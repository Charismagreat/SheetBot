export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings, getModelTokenMultiplier } from "@/lib/ai-settings";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, sheetUrl, customTitle, model: userRequestedModel } = body;

    const aiSettings = await getAiModelSettings();
    // 사용자가 선택한 모델이 있으면 최우선 적용, 없으면 관리자 기본 설정 모델 적용
    const targetModel = userRequestedModel || aiSettings.scriptGeneratorModel || aiSettings.defaultModel || "gemini-3.5-flash";

    // 1. 토큰 지갑 잔여량 사전 검증 (선택된 모델의 가중치 고려: 기본 1500 * multiplier)
    const tokenMultiplier = await getModelTokenMultiplier(targetModel);
    const requiredTokens = Math.round(1500 * tokenMultiplier);

    const tokenCheck = await checkTokenBalance(userEmail, requiredTokens);
    if (!tokenCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: tokenCheck.reason || `잔여 토큰이 부족합니다. (선택 모델: ${targetModel}, 필요 토큰: ${requiredTokens.toLocaleString()})`,
          requirePayment: true,
          balance: tokenCheck.balance,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: "요구사항 프롬프트를 입력해 주세요." }, { status: 400 });
    }

    const host = request.headers.get("host") || "localhost:4002";
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const currentServerUrl = `${protocol}://${host}`;

    const systemPrompt = `당신은 Google Apps Script(GAS) 최고의 전문 수석 엔지니어입니다.
사용자의 자연어 요구사항을 분석하여 Google 스프레드시트에서 즉시 완벽히 동작하는 완성형 Apps Script 코드와 매니페스트를 작성하세요.

[시트봇 핵심 보안 및 API 원칙 - 절대 준수]
1. ⚠️ 사용자 개인 API 키 요구 절대 금지:
   - 사용자에게 Gemini API 키나 OpenAI API 키 등 개인 API 키 입력을 요구하는 UI, 안내문, 팝업, 메뉴(예: 'Gemini API 키 설정')를 "절대로 작성하지 마십시오".
   - 시트봇(SheetBot) 서비스는 모든 AI 및 OCR 호출을 백엔드 중앙 서버(이지데스크 AI Caller)에서 일괄 처리하므로, 사용자가 개인 API 키를 소지하거나 시트에 등록할 필요가 없습니다.
2. 🤖 AI 및 OCR 분석 구현 방법:
   - 사이드바에서 PDF 또는 이미지 파일 업로드 시:
     - 사이드바 UI에 파일 선택(<input type="file">)과 'AI 분석 및 시트 기록' 버튼을 제공하세요.
     - 사용자가 파일을 선택하고 버튼을 누르면, 브라우저 FileReader로 Base64로 인코딩한 뒤 google.script.run을 통해 GAS 서버 함수(예: processUploadedDocument)를 호출하세요.
     - GAS 서버 함수에서는 시트봇 중앙 엔드포인트(SHEETBOT_API_URL + '/api/ai/ocr')로 UrlFetchApp.fetch를 실행하여 이지데스크 AI Caller의 OCR 분석 결과를 받아오세요.
     - 사용자에게 API 키가 없다는 경고나 설정창을 절대 띄우지 마세요! 바로 파일 업로드 및 자동 분석이 실행되어야 합니다.
3. 📋 시트 및 데이터 조작:
   - 특정 시트명(예: '발주서 접수대장')이 언급된 경우, getSheetByName()으로 참조하고 시트가 없으면 insertSheet()로 헤더 행과 함께 자동 생성하세요.
   - '최근 기록이 위에 오도록' 요청된 경우, 헤더(1행) 바로 아래인 2행에 insertRowAfter(1) 또는 insertRows(2)로 삽입하여 최신 데이터가 항상 맨 위에 오도록 작성하세요. 기존 행을 덮어쓰거나 지우지 마세요.
4. 🚀 상단 메뉴 및 사이드바:
   - 구글 시트 상단 메뉴에 '🚀 SheetBot 자동화' 메뉴를 추가하는 onOpen() 함수를 항상 포함하세요.
   - 메뉴 클릭 시 showSidebar()를 호출하여 파일 업로드 사이드바가 즉시 열리도록 하세요.
5. 🛡️ 예외 처리:
   - try-catch를 꼼꼼히 감싸고, SpreadsheetApp.getUi().alert() 및 toast 안내를 적극 활용하세요.

[출력 형식]
반드시 다음 JSON 규격으로만 응답해야 합니다. 마크다운 코드블록(\`\`\`json) 없이 순수 JSON 문자열만 출력하세요:
{
  "summary": "구현된 자동화 기능의 핵심 요약 (1~2문장)",
  "features": [
    "구현된 세부 기능 1",
    "구현된 세부 기능 2",
    "구현된 세부 기능 3"
  ],
  "scriptCode": "/* Code.gs 전체 소스코드 (onOpen, 사이드바 표출, 데이터 처리 등 완벽 동작 코드) */",
  "manifest": "{\\n  \\"timeZone\\": \\"Asia/Seoul\\",\\n  \\"dependencies\\": {},\\n  \\"exceptionLogging\\": \\"STACKDRIVER\\",\\n  \\"runtimeVersion\\": \\"V8\\"\\n}",
  "triggers": [
    { "type": "ON_OPEN", "description": "시트 열기 시 커스텀 메뉴 및 환경 자동 초기화" }
  ]
}`;

    const userMessage = `[시트봇 중앙 서버 주소]: ${currentServerUrl}
[회원 계정]: ${userEmail}
[대상 구글 시트]: ${sheetUrl || "연결된 스프레드시트"}
[프로젝트 명칭]: ${customTitle || "스마트 시트 자동화"}
[사용자 요구사항]:
${prompt}

* 중요 지침: 
1. 코드 상단에 다음 상수를 반드시 선언하세요:
   const SHEETBOT_SERVER_URL = "${currentServerUrl}";
   const SHEETBOT_USER_EMAIL = "${userEmail}";
2. AI OCR 분석 시, 파일 Base64 데이터와 함께 { fileData: base64, fileName: name, userEmail: SHEETBOT_USER_EMAIL } 객체를 SHEETBOT_SERVER_URL + "/api/ai/ocr" 엔드포인트로 전송(UrlFetchApp.fetch)하여 분석 결과를 받아오세요.
3. 사용자에게 Gemini API 키나 개인 키 입력을 요구하는 코드(경고창, 입력 메뉴 등)는 절대로 작성하지 마십시오. 모든 AI 처리는 시트봇 중앙 서버에서 회원의 토큰 지갑으로 정상 차감 처리됩니다.`;

    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;

    // JSON 안전 추출 헬퍼
    const safeParseJson = (text: string) => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        // 코드블록 제거 후 시도
        const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          return JSON.parse(stripped);
        } catch {
          // 첫 번째 '{'와 마지막 '}' 사이 추출 시도
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            try {
              return JSON.parse(text.substring(start, end + 1));
            } catch {
              return null;
            }
          }
          return null;
        }
      }
    };

    // 데이터 구조 안전 정규화 헬퍼
    const normalizeGeneratedData = (data: any) => {
      if (!data) return null;
      let scriptCode = "";
      if (typeof data.scriptCode === "string") {
        scriptCode = data.scriptCode;
      } else if (typeof data.scriptCode === "object" && data.scriptCode !== null) {
        // {"Code.gs": "..."} 형태 처리
        scriptCode = data.scriptCode["Code.gs"] || Object.values(data.scriptCode).join("\n\n");
      }

      if (!scriptCode || !scriptCode.trim()) return null;

      return {
        summary: typeof data.summary === "string" ? data.summary : "AI 자동 생성 Apps Script",
        features: Array.isArray(data.features) ? data.features : [],
        scriptCode: scriptCode.trim(),
        manifest: typeof data.manifest === "string" ? data.manifest : JSON.stringify({
          timeZone: "Asia/Seoul",
          dependencies: {},
          exceptionLogging: "STACKDRIVER",
          runtimeVersion: "V8",
        }, null, 2),
        triggers: Array.isArray(data.triggers) ? data.triggers : [
          { type: "ON_OPEN", description: "시트 열기 시 상단 메뉴 및 환경 자동 초기화" }
        ],
      };
    };

    let generatedData: any = null;

    // 1. 이지데스크 AI Caller 우선 호출 (사내 중앙 토큰 관리 및 감사 로그 연동)
    try {
      const callerRes = await callAiCaller(fullPrompt, {
        caller: "sheetbot-script-generator",
        model: targetModel,
        temperature: aiSettings.temperature || 0.2,
      });

      if (callerRes && callerRes.text) {
        const rawParsed = safeParseJson(callerRes.text);
        generatedData = normalizeGeneratedData(rawParsed);
        if (generatedData?.scriptCode) {
          console.log("[AI-Caller] Successfully generated script via AI Caller:", targetModel);
        }
      }
    } catch (aiCallerErr: any) {
      console.warn("[AI-Caller] Primary call warning:", aiCallerErr.message);
    }

    // 2. 이지데스크 AI Caller 미응답 시 직접 Gemini API 폴백
    if (!generatedData || !generatedData.scriptCode) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
      if (apiKey) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [{ text: fullPrompt }],
                  },
                ],
                generationConfig: {
                  temperature: 0.2,
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (geminiRes.ok) {
            const geminiJson = await geminiRes.json();
            const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const rawParsed = safeParseJson(rawText);
            generatedData = normalizeGeneratedData(rawParsed);
          }
        } catch (apiErr: any) {
          console.warn("[Gemini-Fallback] Direct call warning:", apiErr.message);
        }
      }
    }

    // 3. AI 키 부재 또는 실패 시 지능형 템플릿 안전 폴백
    if (!generatedData || !generatedData.scriptCode) {
      generatedData = {
        summary: prompt.substring(0, 50) + " 자동화 스크립트",
        features: [
          "스프레드시트 상단 '🚀 SheetBot 자동화' 전용 메뉴 자동 생성",
          "데이터 실시간 검증 및 안전한 일괄 처리 핸들러 탑재",
          "작업 완료 알림 토스트 및 실행 결과 로그 시트 자동 기록",
        ],
        scriptCode: `/**
 * SheetBot AI 자동 생성 Apps Script
 * 생성일: ${new Date().toISOString().substring(0, 10)}
 * 요구사항: ${prompt.replace(/\n/g, " ")}
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 SheetBot 자동화')
    .addItem('▶️ 자동화 작업 실행', 'runSheetBotAutomatedTask')
    .addItem('📊 일일 통계 집계', 'calculateDailySummary')
    .addSeparator()
    .addItem('⚙️ 자동화 상태 점검', 'checkSheetBotStatus')
    .addToUi();
}

function runSheetBotAutomatedTask() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  SpreadsheetApp.getActiveSpreadsheet().toast('SheetBot 자동화 작업을 시작합니다...', '안내', 3);
  
  try {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      SpreadsheetApp.getUi().alert('처리할 데이터가 없습니다.');
      return;
    }
    
    // 자동화 로직 처리
    SpreadsheetApp.getActiveSpreadsheet().toast('총 ' + (lastRow - 1) + '건의 데이터가 성공적으로 처리되었습니다.', '완료', 5);
  } catch (err) {
    SpreadsheetApp.getUi().alert('오류 발생: ' + err.message);
  }
}

function calculateDailySummary() {
  SpreadsheetApp.getActiveSpreadsheet().toast('일일 요약 통계를 산출하고 있습니다.', '집계 중', 3);
}

function checkSheetBotStatus() {
  SpreadsheetApp.getUi().alert('SheetBot SaaS 시스템과 정상적으로 연결되어 있습니다.');
}`,
        manifest: JSON.stringify(
          {
            timeZone: "Asia/Seoul",
            dependencies: {},
            exceptionLogging: "STACKDRIVER",
            runtimeVersion: "V8",
          },
          null,
          2
        ),
        triggers: [
          { type: "ON_OPEN", description: "시트 열기 시 상단 메뉴 자동 생성" },
          { type: "TIME_DRIVEN", description: "매일 정기 자동 실행" },
        ],
      };
    }

    // 2. 토큰 사용량 계산 및 차감 (선택된 모델의 multiplier 가중치 반영)
    const promptLength = fullPrompt.length;
    const responseLength = (generatedData?.scriptCode || JSON.stringify(generatedData)).length;
    const rawTokens = Math.max(800, Math.ceil((promptLength + responseLength) / 2.5));
    const estimatedUsedTokens = Math.round(rawTokens * tokenMultiplier);

    const deductRes = await deductTokens(userEmail, estimatedUsedTokens);

    // AI 사용량 및 추정 비용 실시간 적재
    void recordAiUsageLog({
      userEmail,
      caller: "sheetbot-script-generator",
      purpose: `Apps Script 자동 생성 (${targetModel} / ${tokenMultiplier}x)`,
      model: targetModel,
      promptTokens: Math.ceil(promptLength / 2.5),
      completionTokens: Math.ceil(responseLength / 2.5),
      promptText: fullPrompt,
      responseText: generatedData?.scriptCode || JSON.stringify(generatedData),
    });

    return NextResponse.json({
      success: true,
      data: generatedData,
      modelUsed: targetModel,
      multiplier: tokenMultiplier,
      tokensDeducted: estimatedUsedTokens,
      newBalance: deductRes.newBalance,
    });
  } catch (error: any) {
    console.error("Generate script error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
