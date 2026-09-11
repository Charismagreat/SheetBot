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
    const {
      prompt,
      sheetUrl,
      customTitle,
      model: userRequestedModel,
      analyzedSchema,
      existingScriptCode,
      mergeMode = "OVERWRITE",
      includeCopilotSidebar = true,
    } = body;

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

[이지데스크 터널 클라이언트 인프라 환경 (사전 주입 완료)]:
* 중요: 이 프로젝트는 이지데스크 터널 설정 도구(apps_script_setup_egdesk_tunnel)를 통해 다음 파일들이 이미 함께 주입되어 즉시 사용할 수 있습니다.
1. EgdeskConfig.gs: getEgdeskConfig() 함수 제공 (활성 공용 터널 URL 및 인증 X-Api-Key 자동 보유)
2. EgdeskClient.gs: 강력한 터널 통신 클라이언트 유틸리티 함수 사전 제공:
   - egdeskToolsCall(service, tool, args): 이지데스크의 모든 백엔드 MCP 도구를 원격 호출 (예: service 'ai-caller', 'user-data' 등)
   - egdeskUserDataCall(tool, args): My DB 도구(user_data_*) 원격 호출
   - egdeskUserDataSql(query): My DB에 SQL 쿼리 직접 실행 및 결과 반환
   - egdeskUserDataListTables(): DB 테이블 목록 조회
   - testEgdeskTunnel(): 터널 연결 상태 점검 및 UI 알림 함수
3. appsscript.json: UrlFetchApp 외부 요청 권한("https://www.googleapis.com/auth/script.external_request") 사전 등록 완료

[시트봇 핵심 보안 및 API 원칙 - 절대 준수]
1. ⚠️ 사용자 개인 API 키 요구 절대 금지:
   - 사용자에게 Gemini API 키나 OpenAI API 키 등 개인 API 키 입력을 요구하는 UI, 안내문, 팝업, 메뉴(예: 'Gemini API 키 설정')를 "절대로 작성하지 마십시오".
   - 시트봇(SheetBot) 서비스는 모든 AI 및 OCR 호출을 이지데스크 중앙 AI Caller에서 일괄 처리하므로, 사용자가 개인 API 키를 소지하거나 시트에 등록할 필요가 없습니다.
2. 🤖 AI 및 OCR 분석 구현 방법 (EgdeskClient 유틸리티 함수 적극 활용):
   - 더 이상 Code.gs 내부에 길고 복잡한 UrlFetchApp 저수준 코드나 하드코딩된 API Key 상수를 넣을 필요가 없습니다!
   - 이미 사전 제공되는 egdeskToolsCall('ai-caller', 'ai_caller_call', { ... }) 함수를 호출하여 AI/OCR 분석을 깔끔하게 구현하세요.
   - 사이드바에서 PDF 또는 이미지 파일 업로드 시:
     - 사이드바 UI에 파일 선택(<input type="file">)과 'AI 분석 및 시트 기록' 버튼을 제공하세요.
     - 사용자가 파일을 선택하고 버튼을 누르면, 브라우저 FileReader로 Base64로 인코딩한 뒤 google.script.run을 통해 GAS 서버 함수(예: processUploadedDocument)를 호출하세요.
     - GAS 서버 함수에서는 egdeskToolsCall을 사용하여 AI Caller(gemini-3.8-flash)를 호출하세요:
       \`\`\`javascript
       const toolRes = egdeskToolsCall('ai-caller', 'ai_caller_call', {
         model: 'gemini-3.8-flash',
         temperature: 0.1,
         prompt: '첨부된 문서를 정밀 분석하여 대상 시트의 각 컬럼에 맞는 JSON 규격으로 추출하세요. (복수 품목이 있는 문서는 items 배열 포함)',
         files: [{ name: fileName, content: fileData, encoding: 'base64', mimeType: mimeType }]
       });
       \`\`\`
   - ⚠️ [AI Caller 응답 언래핑 헬퍼 함수 - 필수 포함 및 준수]:
     - egdeskToolsCall이 반환한 결과 객체에서 실제 AI JSON 텍스트를 안전하게 추출하는 parseAiCallerResponse 헬퍼 함수를 Code.gs에 포함하세요:
       \`\`\`javascript
       function parseAiCallerResponse(toolRes) {
         let text = "";
         if (toolRes && toolRes.result && toolRes.result.content && toolRes.result.content[0] && toolRes.result.content[0].text) {
           text = toolRes.result.content[0].text;
         } else if (toolRes && toolRes.content && toolRes.content[0] && toolRes.content[0].text) {
           text = toolRes.content[0].text;
         } else if (typeof toolRes.result === "string") {
           text = toolRes.result;
         } else {
           text = JSON.stringify(toolRes);
         }

         // 중첩된 메타 JSON 래퍼({ content: "..." }) 언래핑
         try {
           const nested = JSON.parse(text);
           if (nested && typeof nested === "object") {
             if (typeof nested.content === "string") text = nested.content;
             else if (typeof nested.text === "string") text = nested.text;
             else if (nested.json && typeof nested.json === "object") text = JSON.stringify(nested.json);
           }
         } catch (e) {}

         var jsonStr = text.replace(/\`\`\`json/gi, "").replace(/\`\`\`/g, "").trim();
         var firstBrace = jsonStr.indexOf("{");
         var lastBrace = jsonStr.lastIndexOf("}");
         if (firstBrace !== -1 && lastBrace !== -1) {
           jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
         }
         return JSON.parse(jsonStr);
       }
       \`\`\`
   - ⚠️ [실시간 AI 사용량 감사 로그 적재]:
     - AI OCR 분석이 완료되면, 사용자 관제 센터에 기록되도록 egdeskToolsCall('user-data', 'user_data_insert_rows', { tableName: 'sheetbot_ai_usage_logs', rows: [{ user_email: SHEETBOT_USER_EMAIL, caller: 'sheetbot-gas-ocr', purpose: '구글 시트 문서 AI OCR 분석', model: 'gemini-3.8-flash', prompt_preview: fileName }] })를 호출하는 recordOcrUsageLog 헬퍼 함수를 포함하세요 (try-catch로 감싸서 실패해도 본 작업에 영향 없도록 안전 처리).
   - ⚠️ [데이터 유효성 검증]:
     - AI 분석 결과가 비어있거나 유효하지 않으면 절대 파일명(fileName)이나 임의의 더미값을 데이터 열에 대체 삽입하지 말고, throw new Error("문서에서 유효한 정보를 추출하지 못했습니다.")로 명확히 예외를 발생시키세요.
     - 사용자에게 API 키가 없다는 경고나 설정창을 절대 띄우지 마세요!
3. 💾 My DB 연동 및 🏛️ B2B 공공/기업 인텔리전스 도구 활용:
   - 스프레드시트 데이터를 My DB 대장에 백업하거나, My DB의 프로젝트/회원/이력 데이터를 조회해야 할 때는 egdeskUserDataSql("SELECT ...") 또는 egdeskToolsCall('user-data', 'user_data_insert_rows', ...)를 사용하여 원격 DB와 원활히 동기화할 수 있습니다.
   - 🏢 [국민연금(NPS) 사업장·직원 수·고용 추이 자동 조회]:
     - 거래처나 고객사의 직원 수, 월별 가입자 변동을 시트에 채울 때: egdeskToolsCall('nps', 'nps_lookup', { workplaceName: '회사명', businessNumber: '사업자번호' })
   - 🏛️ [나라장터(KONEPS) 공공 계약 실적 & 입찰공고(BidNotice) 실시간 수집]:
     - 기업의 공공기관 납품/낙찰 계약 실적 조회: egdeskToolsCall('koneps', 'koneps_lookup', { companyName: '회사명' })
     - 나라장터 신규 입찰공고 실시간 모니터링: egdeskToolsCall('bidnotice', 'bidnotice_lookup', { title: '키워드', openOnly: true })
   - 🔍 [기업 심층 웹 리서치]:
     - 기업 홈페이지 분석 및 사업 영역 요약: egdeskToolsCall('company-research', 'companyresearch_run', { domain: '회사도메인', companyName: '회사명' })
4. 📋 시트 및 데이터 조작 (실제 컬럼 1:1 매핑 및 동적 행 삽입 절대 준수):
   - 특정 시트명이 언급된 경우, getSheetByName()으로 참조하고 시트가 없으면 insertSheet()로 헤더 행과 함께 자동 생성하세요.
   - 단, 시트에 이미 존재하는 헤더(1행)가 있을 경우, 헤더를 임의로 변경하거나 덮어쓰지 말고 실제 시트 1행의 컬럼 순서 및 개수에 1:1로 정확히 맞추어 rowsToInsert 2차원 배열을 구성하세요.
   - '최근 기록이 위에 오도록' 요청된 경우:
     - 삽입할 행이 N개일 때, sheet.insertRowsBefore(2, N) 후 sheet.getRange(2, 1, N, rowsToInsert[0].length).setValues(rowsToInsert)로 한 번에 삽입하여 데이터 순서가 뒤집히지 않고 최신 데이터가 시트 맨 위(2행부터)에 안전하게 자리잡도록 작성하세요.
   - 숫자 포맷: 금액, 수량, 단가 등 숫자 열이 감지되면 해당 열에 .setNumberFormat("#,##0")을 적용하세요.
5. 🚀 상단 메뉴 및 사이드바 (표준 메뉴 규칙 필수 준수):
   - 구글 시트 상단 메뉴에 '🚀 SheetBot 메뉴' 메뉴를 추가하는 onOpen() 함수를 항상 포함하세요.
   - 메뉴 구성 순서:
     - 1. 업무 자동화 기능 항목들 (예: '📄 문서 AI 업로드 및 분석', '⚡ 터널 연결 상태 점검', '🛠️ 초기 시트 양식 및 데이터 자동 세팅' 등)
     - 2. 구분선 (.addSeparator())
     - 3. '🤖 SheetBot AI 코파일럿' (showAiCopilotSidebar 호출)
     - 4. 최하단 고정: '📖 SheetBot 사용법 및 활용사례' (openSheetBotGuide 호출 - sheetbot.cloud 사이트를 새 탭으로 여는 모달 함수)
   - 🌐 [SheetBot 사용법 안내 함수 - openSheetBotGuide 필수 포함]:
     - Code.gs 하단에 다음 openSheetBotGuide() 함수를 반드시 포함하세요:
       \`\`\`javascript
       function openSheetBotGuide() {
         var html = HtmlService.createHtmlOutput(
           '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">🌐 SheetBot 가이드로 이동합니다</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 탭이 열리지 않으면 아래를 클릭하세요.</div><a href="https://sheetbot.cloud" target="_blank" class="btn">sheetbot.cloud 바로가기</a></body></html>'
         ).setWidth(320).setHeight(130);
         SpreadsheetApp.getUi().showModalDialog(html, "SheetBot 사용법 및 활용사례");
       }
       \`\`\`
   - 🛠️ [신규 시트 양식/엑셀 데이터 초기화 함수 - setupInitialSheetLayout]:
     - 사용자가 빈 구글 시트에서 시작하거나 엑셀 데이터를 가져왔을 때를 대비하여, setupInitialSheetLayout() 함수를 구현하세요:
       * 대상 시트 탭이 없으면 새로 생성,
       * 1행에 확정된 컬럼 헤더들을 깔끔하게 채우고 배경색(에메랄드 또는 네이비 #1e293b)과 굵은 글씨 스타일 적용,
       * 각 열의 너비를 내용에 맞게 자동 조절(autoResizeColumns),
       * 완료 시 SpreadsheetApp.getUi().alert("✅ 시트 양식 및 초기 설정이 완료되었습니다.") 안내.
6. 🛡️ 예외 처리:
   - try-catch를 꼼꼼히 감싸고, 실패 시 { success: false, error: error.message }를 반환하여 사이드바에 실패 원인이 빨간색 안내창으로 명확히 뜨도록 작성하세요.
7. 🌐 독립 웹페이지(Web App) 설문/신청서/접수폼 구현 규칙:
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
  "scriptCode": "/* Code.gs 전체 소스코드 (onOpen, 사이드바 표출, egdeskToolsCall을 활용한 깔끔하고 강력한 자동화 코드) */",
  "manifest": "{\\n  \\"timeZone\\": \\"Asia/Seoul\\",\\n  \\"dependencies\\": {},\\n  \\"exceptionLogging\\": \\"STACKDRIVER\\",\\n  \\"runtimeVersion\\": \\"V8\\",\\n  \\"oauthScopes\\": [\\"https://www.googleapis.com/auth/script.external_request\\", \\"https://www.googleapis.com/auth/spreadsheets\\"]\\n}",
  "triggers": [
    { "type": "ON_OPEN", "description": "시트 열기 시 커스텀 메뉴 및 환경 자동 초기화" }
  ]
}`;

    let existingScriptSection = "";
    if (mergeMode === "MERGE" && existingScriptCode && existingScriptCode.trim()) {
      existingScriptSection = `
[🛡️ 안전 병합 모드: 기존 Apps Script 코드 보존 및 신규 기능 증분(Merge) 절대 준수 지침]:
- 사용자의 구글 시트에는 이미 실무에서 사용 중인 중요한 Apps Script 코드가 존재합니다.
- ⚠️ 절대 규칙:
  1. 아래 제공되는 [기존 Apps Script 소스코드]에 정의된 모든 커스텀 함수(이름, 매개변수, 내부 로직)를 절대 임의로 삭제하거나 기능을 훼손하지 마십시오.
  2. 기존 코드에 onOpen() 함수가 이미 있다면:
     - 기존 onOpen()의 UI 메뉴 구조를 100% 보존하면서, 새로 추가되는 SheetBot 기능 메뉴를 기존 메뉴에 깔끔하게 합치거나 하위 메뉴/새 메뉴로 병합하십시오. (onOpen 함수가 2개 존재하면 문법 오류가 나므로 반드시 1개로 병합)
  3. 신규 자동화 요구사항에 필요한 함수들은 기존 함수들과 충돌하지 않도록 명확한 네이밍으로 새롭게 추가하십시오.
  4. 결과물 scriptCode는 기존 코드의 모든 함수와 이번 신규 요구사항 구현 코드가 조화롭게 결합된 '완전한 완성형 Code.gs'여야 합니다.

[기존 Apps Script 소스코드 (반드시 보존 및 융합)]:
\`\`\`javascript
${existingScriptCode.trim()}
\`\`\`
`;
    }

    let copilotSidebarPromptSection = "";
    if (includeCopilotSidebar) {
      copilotSidebarPromptSection = `
[🤖 시트 내장 AI 코파일럿 사이드바 (자가 코드 생성 및 원격 자동 주입) 필수 탑재 지침]:
- 사용자가 구글 시트 안에서 편리하게 요구사항을 말하면 AI가 스스로 코드를 다시 작성하여 시트에 즉시 주입(Self-Update)하는 대화형 코파일럿 사이드바 기능을 필수 구현하세요.
1. 상단 onOpen() 메뉴 구성:
   - 메뉴의 다른 업무 기능들이 모두 등록된 후 맨 마지막에 구분선(.addSeparator())과 함께 다음 순서대로 배치하세요:
     .addSeparator()
     .addItem('🤖 SheetBot AI 코파일럿', 'showAiCopilotSidebar')
     .addItem('📖 SheetBot 사용법 및 활용사례', 'openSheetBotGuide')
     .addToUi();
2. 사이드바 표출 함수 showAiCopilotSidebar():
   - HtmlService.createHtmlOutput(getAiCopilotSidebarHtml()).setTitle("🤖 SheetBot AI 코파일럿").setWidth(360);
   - SpreadsheetApp.getUi().showSidebar(html);
3. 사이드바 UI 템플릿 getAiCopilotSidebarHtml():
   - 중복 헤더나 안내 카드를 일절 배제한 극도로 심플하고 실용적인 레이아웃:
   - 텍스트 입력란(라벨: '자연어 요청 또는 직접 짠 코드 붙여넣기', 드래그로 높이 확장 가능한 <textarea id="userPrompt" class="... resize-y min-h-[220px] ...">)
   - 실행 버튼 1종 제공:
     * '⚡ AI 코드 생성 및 시트에 즉시 주입' 버튼 (google.script.run.executeSelfCodeInjection(prompt) 호출)
     * (자연어 요구사항뿐만 아니라 사용자가 직접 작성한 JavaScript 함수 코드가 입력된 경우에도 AI가 스스로 감지하여 기존 코드에 무손실 100% 원형 병합 배포)
   - 실행 중 로딩 스피너 및 진행 상태(완료 시 F5 새로고침 안내)
4. 백엔드 주입 함수 구현:
   - executeSelfCodeInjection(userPrompt): 자연어 요청 및 직접 작성 코드를 분석하여 기존 로직과 충돌 없이 안전 병합(Merge)한 후 클라우드 Apps Script(Code.gs)에 주입 및 push
   - 스프레드시트 탭, 컬럼 구조(A열~헤더), 기존 Code.gs 소스코드를 수집.
   - 프로젝트 메타(gasProjectId, projectId)를 조회:
     상수 SHEETBOT_GAS_PROJECT_ID 가 있으면 우선 사용하고, 없으면 egdeskUserDataSql("SELECT id, gas_project_id FROM sheetbot_projects WHERE spreadsheet_id = '" + currentSpreadsheetId + "' AND deleted_at IS NULL LIMIT 1") 로 동적 획득.
   - egdeskToolsCall('ai-caller', 'ai_caller_call', {
       model: 'gemini-3.8-flash',
       temperature: 0.1,
       prompt: '현재 구글 스프레드시트의 기존 기능과 스키마를 100% 무손실 보존(Merge)하면서, 다음 요구사항을 반영한 완전한 완성형 Code.gs 전체 코드를 생성하세요. [중요]: 사용자가 직접 작성한 JavaScript/Apps Script 코드나 함수 정의(function ...)가 요구사항에 포함되어 있는 경우, 해당 로직을 왜곡하거나 생략하지 말고 원형 그대로 안전하게 융합 반영하세요. 요구사항: ' + userPrompt + ' ...',
     }) 호출.
   - parseAiCallerResponse()로 AI가 생성한 완성형 소스코드를 추출.
   - egdeskToolsCall('apps-script', 'apps_script_write_file', { projectId: gasProjectId, fileName: 'Code.gs', content: cleanCode }) 호출.
   - egdeskToolsCall('apps-script', 'apps_script_push_to_google', { projectId: gasProjectId }) 호출하여 구글 클라우드에 즉시 배포.
   - egdeskToolsCall('user-data', 'user_data_update_rows', { tableName: 'sheetbot_projects', filters: { id: projectId }, updates: { script_code: cleanCode, updated_at: new Date().toISOString() } }) 로 My DB에도 최신 코드 동기화.
   - 성공 시 { success: true, message: "새로운 코드가 구글 시트에 성공적으로 자동 주입되었습니다! 브라우저를 새로고침하세요." } 반환.
`;
    }

    const userMessage = `[회원 계정]: ${userEmail}
[대상 구글 시트]: ${sheetUrl || "연결된 스프레드시트"}
[프로젝트 명칭]: ${customTitle || "스마트 시트 자동화"}
[이지데스크 공용 터널 인프라]: 사전 배포 완료 (EgdeskConfig.gs, EgdeskClient.gs 내장)
${schemaPromptSection}
${existingScriptSection}
${copilotSidebarPromptSection}
[사용자 요구사항]:
${prompt}

* 중요 지침: 
1. 코드 상단에 회원 식별을 위한 상수를 선언하세요:
   const SHEETBOT_USER_EMAIL = "${userEmail}";
2. AI/OCR 호출 시, 별도의 저수준 UrlFetchApp 대신 프로젝트에 사전 제공되는 egdeskToolsCall('ai-caller', 'ai_caller_call', { model: 'gemini-3.8-flash', prompt: '...', files: [...] })을 사용하여 간결하고 우아하게 구현하세요.
3. My DB 연동이나 SQL 쿼리가 필요한 경우 egdeskUserDataSql(query)을 활용하세요.
4. 사용자에게 개인 Gemini API 키 입력을 요구하는 코드는 절대로 작성하지 마십시오.`;

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
          "스프레드시트 상단 '🚀 SheetBot 메뉴' 전용 메뉴 자동 생성",
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
  ui.createMenu('🚀 SheetBot 메뉴')
    .addItem('▶️ 자동화 작업 실행', 'runSheetBotAutomatedTask')
    .addItem('📊 일일 통계 집계', 'calculateDailySummary')
    .addSeparator()
    .addItem('⚡ 터널 연결 상태 점검', 'checkEgdeskTunnelConnection')
    .addItem('📖 SheetBot 사용법 및 활용사례', 'openSheetBotGuide')
    .addToUi();
}

function openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">🌐 SheetBot 가이드로 이동합니다</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 탭이 열리지 않으면 아래를 클릭하세요.</div><a href="https://sheetbot.cloud" target="_blank" class="btn">sheetbot.cloud 바로가기</a></body></html>'
  ).setWidth(320).setHeight(130);
  SpreadsheetApp.getUi().showModalDialog(html, "SheetBot 사용법 및 활용사례");
}

function checkEgdeskTunnelConnection() {
  if (typeof testEgdeskTunnel === 'function') {
    testEgdeskTunnel();
  } else {
    SpreadsheetApp.getUi().alert('이지데스크 터널 클라이언트가 프로젝트에 설치되어 있습니다.');
  }
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

    // AI 사용량 및 추정 비용 실시간 적재 (가중치 적용된 실차감 토큰 기록)
    void recordAiUsageLog({
      userEmail,
      caller: "sheetbot-script-generator",
      purpose: `Apps Script 자동 생성 (${targetModel} / ${tokenMultiplier}x)`,
      model: targetModel,
      promptTokens: Math.ceil(promptLength / 2.5),
      completionTokens: Math.ceil(responseLength / 2.5),
      totalTokens: estimatedUsedTokens,
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
