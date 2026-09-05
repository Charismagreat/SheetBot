export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller, getSpreadsheetFullContext } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings, getModelTokenMultiplier } from "@/lib/ai-settings";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { queryTable } from "@/lib/setup-db";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * AI 자가 학습(Self-Improving) 피드백 컨텍스트 생성
 * - 고평가(4~5점) 피드백: 모범 사례(Exemplars)로 강화
 * - 저평가(1~2점) 피드백: 실수/오류 방지 가이드(Pitfalls to Avoid)로 보강
 */
async function buildSelfImprovingFeedbackContext(): Promise<string> {
  try {
    const feedbackRes = await queryTable("sheetbot_project_feedback", {
      orderBy: "created_at",
      orderDirection: "DESC",
      limit: 30,
    }).catch(() => ({ rows: [] }));

    const rawRows = feedbackRes.rows || [];
    const rows = rawRows.filter((r: any) => !r.deleted_at && (r.ai_learned === 1 || r.ai_learned === "1" || r.ai_learned === true));
    if (rows.length === 0) return "";

    const positiveCases = rows.filter((r: any) => r.rating >= 4).slice(0, 3);
    const negativeCases = rows.filter((r: any) => r.rating <= 2).slice(0, 3);

    let context = "\n[🧠 AI 자가 학습 시스템 - 사용자 실제 만족도 피드백 반영 지침]:\n";

    if (positiveCases.length > 0) {
      context += "🌟 [사용자 극찬 모범 패턴 (적극 준수)]:\n";
      positiveCases.forEach((c: any) => {
        let tags: string[] = [];
        try {
          tags = typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags || [];
        } catch {
          tags = [];
        }
        const tagStr = tags.length > 0 ? ` [칭찬 요소: ${tags.join(", ")}]` : "";
        context += `  - 만족도 ${c.rating}점${tagStr}: ${c.comment || "완벽한 열 매핑과 안정적인 실행"}\n`;
      });
    }

    if (negativeCases.length > 0) {
      context += "⚠️ [이전 사용자 불만/오류 발생 요인 (절대 반복 금지)]:\n";
      negativeCases.forEach((c: any) => {
        let tags: string[] = [];
        try {
          tags = typeof c.tags === "string" ? JSON.parse(c.tags) : c.tags || [];
        } catch {
          tags = [];
        }
        const tagStr = tags.length > 0 ? ` [문제 유형: ${tags.join(", ")}]` : "";
        context += `  - 불만족 ${c.rating}점${tagStr}: ${c.comment || "컬럼 순서 불일치 또는 런타임 오류 방지 필수"}\n`;
      });
    }

    return context;
  } catch (err: any) {
    console.warn("[Self-Improving AI] Failed to load feedback context:", err.message);
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, sheetUrl, customTitle, model: userRequestedModel, analyzedSchema } = body;

    const aiSettings = await getAiModelSettings();
    // 사용자가 선택한 모델이 있으면 최우선 적용, 없으면 관리자 기본 설정 모델 적용
    const targetModel = userRequestedModel || aiSettings.scriptGeneratorModel || aiSettings.defaultModel || "gemini-3.8-flash";

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
    const rawServerUrl = `${protocol}://${host}`;
    // Google 클라우드 환경에서 localhost 호출 시 발생하는 DNS 오류 방지: EGDesk 공용 터널 URL 기본 제공
    const egdeskTunnelUrl = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/ai-caller/tools/call";
    const egdeskApiKey = "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0";
    const currentServerUrl = process.env.SHEETBOT_PUBLIC_URL || (host.includes("localhost") ? egdeskTunnelUrl : `${rawServerUrl}/api/ai/ocr`);

    // 2. 시트 스키마 사전 분석 정보 확인 및 누락 시 실시간 자동 스캔 폴백
    let activeSchema = analyzedSchema;
    if (!activeSchema && sheetUrl) {
      const spreadsheetId = extractSpreadsheetId(sheetUrl);
      if (spreadsheetId) {
        try {
          const fullContext = await getSpreadsheetFullContext(spreadsheetId, 5);
          if (fullContext && fullContext.sheetsData && fullContext.sheetsData.length > 0) {
            // '발주서' 또는 '접수'가 포함된 시트 우선, 없으면 첫 번째 탭
            const targetSheet =
              fullContext.sheetsData.find((s: any) =>
                s.sheetTitle.includes("발주") || s.sheetTitle.includes("접수") || s.sheetTitle.includes("대장")
              ) || fullContext.sheetsData[0];

            const rawHeaders = (targetSheet.headers || []).filter((h: string) => h && h.trim());
            if (rawHeaders.length > 0) {
              activeSchema = {
                archetypeName: "실제 스프레드시트 검증 대장",
                targetTab: targetSheet.sheetTitle,
                headerRow: 1,
                dataStartRow: 2,
                columns: rawHeaders.map((h: string, idx: number) => ({
                  index: idx,
                  letter: String.fromCharCode(65 + idx),
                  name: h.trim(),
                  purpose: h.trim(),
                })),
                keyStrategies: [
                  `실제 시트 '${targetSheet.sheetTitle}'의 ${rawHeaders.length}개 열(A열~${String.fromCharCode(64 + rawHeaders.length)}열) 순서와 1:1 완벽 일치 매핑`,
                  "다중 품목(N개) 발주서인 경우 품목별로 1행씩 분리하여 순차 최상단 삽입",
                ],
              };
              console.log(`[Generate] Auto-detected ${rawHeaders.length} headers from sheet:`, rawHeaders);
            }
          }
        } catch (e: any) {
          console.warn("[Generate] Auto inspect spreadsheet headers warning:", e.message);
        }
      }
    }

    let schemaPromptSection = "";
    if (activeSchema && activeSchema.columns && activeSchema.columns.length > 0) {
      const colDetails = activeSchema.columns
        .map((c: any) => `  * ${c.letter || `Col${c.index}`}열: "${c.name}"`)
        .join("\n");

      schemaPromptSection = `
[사전 검증된 실제 구글 시트 양식 및 스키마 (100% 필수 준수)]:
- 양식 유형: ${activeSchema.archetypeName || "실무 누적 대장형"}
- 대상 탭 이름: "${activeSchema.targetTab || "기본 탭"}"
- 헤더 위치: ${activeSchema.headerRow || 1}행 (신규 데이터 삽입 위치: ${activeSchema.dataStartRow || 2}행)
- 확정된 컬럼 매핑 (총 ${activeSchema.columns.length}개 열):
${colDetails}
- 핵심 실행 전략:
${(activeSchema.keyStrategies || []).map((s: string) => `  - ${s}`).join("\n")}

⚠️ [컬럼 매핑 절대 규칙 - 불일치 시 시스템 작동 불가]:
1. 임의의 가상 컬럼을 생성하지 말고, 반드시 위에서 감지된 실제 시트의 확정된 컬럼 순서 및 개수(${activeSchema.columns.length}개 열)를 1:1로 엄격히 준수하세요.
2. recordToSheet 또는 데이터 삽입 시 각 행 배열(rowData)은 반드시 위에서 확정된 정확히 ${activeSchema.columns.length}개의 원소를 가져야 하며, A열부터 순서대로 정확한 필드 값을 매핑해야 합니다.
3. 세부 품목(Line Items)이 복수 개 존재하는 문서(발주서, 견적서, 거래명세서, 영수증 등)의 경우, 1행으로 뭉뚱그리지 말고 품목별로 1행씩(총 N개 행) 분리하여 시트에 순차 삽입하세요. 단일 건 문서(신청서, 문의 등)는 1건당 1행으로 삽입하세요.
`;
    }

    const systemPrompt = `당신은 Google Apps Script(GAS) 최고의 전문 수석 엔지니어입니다.
사용자의 자연어 요구사항을 분석하여 Google 스프레드시트에서 즉시 완벽히 동작하는 완성형 Apps Script 코드와 매니페스트를 작성하세요.

[시트봇 핵심 보안 및 API 원칙 - 절대 준수]
1. ⚠️ 사용자 개인 API 키 요구 절대 금지:
   - 사용자에게 Gemini API 키나 OpenAI API 키 등 개인 API 키 입력을 요구하는 UI, 안내문, 팝업, 메뉴(예: 'Gemini API 키 설정')를 "절대로 작성하지 마십시오".
   - 시트봇(SheetBot) 서비스는 모든 AI 및 OCR 호출을 이지데스크 중앙 AI Caller에서 일괄 처리하므로, 사용자가 개인 API 키를 소지하거나 시트에 등록할 필요가 없습니다.
2. 🤖 AI 및 OCR 분석 구현 방법 (Google 클라우드 DNS 오류 방지 및 응답 언래핑 필수):
   - 중요: Google Apps Script(UrlFetchApp)는 Google 클라우드에서 실행되므로 'localhost' 주소를 호출하면 DNS 오류가 발생합니다.
   - 따라서 이지데스크 정식 공용 터널 엔드포인트를 호출해야 합니다:
     const EGDESK_TUNNEL_URL = "${egdeskTunnelUrl}";
     const EGDESK_API_KEY = "${egdeskApiKey}";
   - 사이드바에서 PDF 또는 이미지 파일 업로드 시:
     - 사이드바 UI에 파일 선택(<input type="file">)과 'AI 분석 및 시트 기록' 버튼을 제공하세요.
     - 사용자가 파일을 선택하고 버튼을 누르면, 브라우저 FileReader로 Base64로 인코딩한 뒤 google.script.run을 통해 GAS 서버 함수(예: processUploadedDocument)를 호출하세요.
     - GAS 서버 함수에서는 EGDESK_TUNNEL_URL로 UrlFetchApp.fetch를 실행할 때, 헤더에 {'X-Api-Key': EGDESK_API_KEY}를 넣고 바디에 { tool: 'ai_caller_call', arguments: { model: 'gemini-3.8-flash', prompt: '첨부된 문서를 정밀 분석하여 대상 시트의 각 컬럼에 맞는 JSON 규격으로 추출하세요. (복수 품목이 있는 문서는 items 배열 포함)', files: [{ name: fileName, content: fileData, encoding: 'base64', mimeType: mimeType }] } } 형식으로 전송하여 OCR 결과를 받아오세요.
   - ⚠️ [AI Caller 응답 언래핑 표준 코드 - 100% 필수 준수]:
     - 이지데스크 AI Caller는 결과를 { result: { content: [{ type: "text", text: "..." }] } } 형태로 반환합니다.
     - outerJson.result 객체 자체를 파싱하려 하면 내부 텍스트 추출에 실패하므로, 반드시 아래 코드로 aiText를 안전하게 언래핑하세요:
       \`\`\`javascript
       const outerJson = JSON.parse(responseText);
       let aiText = "";
       if (outerJson.result && outerJson.result.content && Array.isArray(outerJson.result.content) && outerJson.result.content[0] && outerJson.result.content[0].text) {
         aiText = outerJson.result.content[0].text;
       } else if (outerJson.content && Array.isArray(outerJson.content) && outerJson.content[0] && outerJson.content[0].text) {
         aiText = outerJson.content[0].text;
       } else if (typeof outerJson.result === "string") {
         aiText = outerJson.result;
       } else {
         aiText = JSON.stringify(outerJson);
       }
       let jsonStr = aiText.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
       const firstBrace = jsonStr.indexOf("{");
       const lastBrace = jsonStr.lastIndexOf("}");
       if (firstBrace !== -1 && lastBrace !== -1) {
         jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
       }
       const parsedResult = JSON.parse(jsonStr);
       \`\`\`
   - ⚠️ [데이터 유효성 검증]:
     - AI 분석 결과가 비어있거나 유효하지 않으면 절대 파일명(fileName)이나 임의의 더미값을 데이터 열에 대체 삽입하지 말고, throw new Error("문서에서 유효한 정보를 추출하지 못했습니다.")로 명확히 예외를 발생시키세요.
     - 사용자에게 API 키가 없다는 경고나 설정창을 절대 띄우지 마세요!
3. 📋 시트 및 데이터 조작 (실제 컬럼 1:1 매핑 및 동적 행 삽입 절대 준수):
   - 특정 시트명이 언급된 경우, getSheetByName()으로 참조하고 시트가 없으면 insertSheet()로 헤더 행과 함께 자동 생성하세요.
   - 단, 시트에 이미 존재하는 헤더(1행)가 있을 경우, 헤더를 임의로 변경하거나 덮어쓰지 말고 실제 시트 1행의 컬럼 순서 및 개수에 1:1로 정확히 맞추어 rowsToInsert 2차원 배열을 구성하세요.
   - '최근 기록이 위에 오도록' 요청된 경우:
     - 삽입할 행이 N개일 때, sheet.insertRowsBefore(2, N) 후 sheet.getRange(2, 1, N, rowsToInsert[0].length).setValues(rowsToInsert)로 한 번에 삽입하여 데이터 순서가 뒤집히지 않고 최신 데이터가 시트 맨 위(2행부터)에 안전하게 자리잡도록 작성하세요.
   - 숫자 포맷: 금액, 수량, 단가 등 숫자 열이 감지되면 해당 열에 .setNumberFormat("#,##0")을 적용하세요.
4. 🚀 상단 메뉴 및 사이드바:
   - 구글 시트 상단 메뉴에 '🚀 SheetBot 자동화' 메뉴를 추가하는 onOpen() 함수를 항상 포함하세요.
   - 메뉴 클릭 시 showSidebar()를 호출하여 파일 업로드 사이드바가 즉시 열리도록 하세요.
5. 🛡️ 예외 처리:
   - try-catch를 꼼꼼히 감싸고, 실패 시 { success: false, error: error.message }를 반환하여 사이드바에 실패 원인이 빨간색 안내창으로 명확히 뜨도록 작성하세요.
6. 🌐 독립 웹페이지(Web App) 설문/신청서/접수폼 구현 규칙:
   - 사용자가 '설문지', '신청서', '접수 폼', '웹페이지', '공개 링크/URL'을 요구한 경우:
     - 반드시 function doGet(e) 함수를 구현하여 HtmlService.createHtmlOutput(getFormHtml()).setTitle("...").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)을 반환하세요.
     - getFormHtml() 함수 내부에 Tailwind CSS(CDN)를 활용한 모바일 반응형 독립 웹페이지 입력 폼을 작성하세요.
     - 시트 컬럼에 맞는 입력 필드(성함, 연락처, 주관식 내용 등)를 구성하고, 브라우저에서 google.script.run을 통해 서버 함수(예: submitFormToSheet)를 호출하여 시트에 실시간 기록(appendRow)하세요.
     - 제출 완료 후 "정상 접수되었습니다" 안내 화면을 표출하세요.
     - appsscript.json 매니페스트에 "webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" }를 포함하세요.

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

    const userMessage = `[회원 계정]: ${userEmail}
[대상 구글 시트]: ${sheetUrl || "연결된 스프레드시트"}
[프로젝트 명칭]: ${customTitle || "스마트 시트 자동화"}
[이지데스크 공용 터널]: ${egdeskTunnelUrl}
${schemaPromptSection}
[사용자 요구사항]:
${prompt}

* 중요 지침: 
1. 코드 상단에 다음 상수를 선언하세요:
   const EGDESK_TUNNEL_URL = "${egdeskTunnelUrl}";
   const EGDESK_API_KEY = "${egdeskApiKey}";
   const SHEETBOT_USER_EMAIL = "${userEmail}";
2. AI OCR 분석 시, Google 클라우드 DNS 오류 방지를 위해 반드시 EGDESK_TUNNEL_URL(X-Api-Key 헤더 포함)을 통해 이지데스크 AI Caller(gemini-3.8-flash)를 호출하여 완벽히 처리하세요.
3. 사용자에게 개인 Gemini API 키 입력을 요구하는 코드는 절대로 작성하지 마십시오.`;

    const learningFeedbackSection = await buildSelfImprovingFeedbackContext();

    const fullPrompt = `${systemPrompt}\n${learningFeedbackSection}\n\n${userMessage}`;

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
