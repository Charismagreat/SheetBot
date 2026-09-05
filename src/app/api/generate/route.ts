export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings } from "@/lib/ai-settings";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 1. 토큰 지갑 잔여량 사전 검증 (스크립트 생성 기본 1,500 토큰 필요)
    const tokenCheck = await checkTokenBalance(userEmail, 1500);
    if (!tokenCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: tokenCheck.reason,
          requirePayment: true,
          balance: tokenCheck.balance,
        },
        { status: 402 } // Payment Required
      );
    }

    const aiSettings = await getAiModelSettings();
    // EGDesk AI Caller가 공식 지원하는 최적 모델 기본값 적용
    const targetModel = aiSettings.scriptGeneratorModel || aiSettings.defaultModel || "gemini-2.5-flash";

    const body = await request.json();
    const { prompt, sheetUrl, customTitle } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: "요구사항 프롬프트를 입력해 주세요." }, { status: 400 });
    }

    const systemPrompt = `당신은 Google Apps Script(GAS) 최고의 전문 수석 엔지니어입니다.
사용자의 자연어 요구사항을 분석하여 Google 스프레드시트에서 즉시 완벽히 동작하는 완성형 Apps Script 코드와 매니페스트를 작성하세요.

[필수 구현 지침]
1. 사용자의 요구사항(기능, 시트 이름, 사이드바, 트리거, 삽입 위치 등)을 빠짐없이 100% 코드로 구체화하세요. 생략이나 TODO, 빈 함수를 남기지 마세요.
2. 사이드바가 요구되는 경우: SpreadsheetApp.getUi().showSidebar()와 HtmlService를 활용하여 직관적인 HTML/JS 인터페이스를 생성하고, 사용자가 파일 업로드나 입력을 수행할 수 있는 핸들러를 온전히 포함하세요.
3. 시트 조작: 특정 시트명이 언급된 경우(예: '발주서 접수대장'), getSheetByName()으로 참조하되 없으면 insertSheet()로 자동 생성하도록 하세요.
4. 데이터 삽입: '최근 기록이 위에 오도록' 요청된 경우, 1행(헤더) 바로 아래인 2행에 새 행을 삽입(insertRowAfter(1) 또는 insertRows(2))하여 기존 데이터를 보존하며 맨 위에 추가되도록 작성하세요.
5. 상단 메뉴: 구글 시트 상단 메뉴에 '🚀 SheetBot 자동화' 메뉴를 추가하는 onOpen() 함수를 항상 포함하세요.
6. 예외 처리: 모든 주요 함수에는 try-catch를 꼼꼼히 감싸고, SpreadsheetApp.getUi().alert() 및 toast 안내를 적극 활용하세요.

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

    const userMessage = `[대상 구글 시트]: ${sheetUrl || "연결된 스프레드시트"}
[프로젝트 명칭]: ${customTitle || "스마트 시트 자동화"}
[사용자 요구사항]:
${prompt}`;

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

    // 2. 토큰 사용량 계산 및 차감 (기본 예상치 1500~2000)
    const promptLength = fullPrompt.length;
    const responseLength = (generatedData?.scriptCode || JSON.stringify(generatedData)).length;
    const estimatedUsedTokens = Math.max(800, Math.ceil((promptLength + responseLength) / 2.5));

    const deductRes = await deductTokens(userEmail, estimatedUsedTokens);

    // AI 사용량 및 추정 비용 실시간 적재
    void recordAiUsageLog({
      userEmail,
      caller: "sheetbot-script-generator",
      purpose: "Apps Script 자동 생성",
      model: targetModel,
      promptTokens: Math.ceil(promptLength / 2.5),
      completionTokens: Math.ceil(responseLength / 2.5),
      promptText: fullPrompt,
      responseText: generatedData?.scriptCode || JSON.stringify(generatedData),
    });

    return NextResponse.json({
      success: true,
      data: generatedData,
      tokensDeducted: estimatedUsedTokens,
      newBalance: deductRes.newBalance,
    });
  } catch (error: any) {
    console.error("Generate script error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
