export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller, getSpreadsheetFullContext } from "@/lib/egdesk-helpers";
import { getAiModelSettings } from "@/lib/ai-settings";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

export async function POST(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { sheetUrl, prompt, model: userRequestedModel, feedback, previousSchema, turn = 1 } = body;

    if (!sheetUrl || !sheetUrl.trim()) {
      return NextResponse.json({ success: false, error: "구글 스프레드시트 URL을 입력해 주세요." }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: "유효한 구글 스프레드시트 URL 또는 ID가 아닙니다." }, { status: 400 });
    }

    const aiSettings = await getAiModelSettings();
    const targetModel = userRequestedModel || aiSettings.scriptGeneratorModel || "gemini-3.8-flash";

    // 1. 스프레드시트 컨텍스트 조회 (MCP sheets_get_full_context 경유)
    let fullContext: any = null;
    try {
      fullContext = await getSpreadsheetFullContext(spreadsheetId, 8);
    } catch (err: any) {
      console.warn("[Sheets-Analyze] Failed to get full context:", err.message);
    }

    // 시트 구조를 AI가 이해하기 쉬운 텍스트 요약으로 변환
    let sheetStructureSummary = "";
    if (fullContext && fullContext.sheetsData && fullContext.sheetsData.length > 0) {
      sheetStructureSummary = fullContext.sheetsData
        .map((s: any, idx: number) => {
          const headersStr = (s.headers || []).map((h: string, i: number) => `Col ${String.fromCharCode(65 + i)}: "${h}"`).join(", ");
          const sampleRowsStr = (s.sampleData || [])
            .slice(0, 3)
            .map((row: any[], rIdx: number) => `  Row ${rIdx + 2}: [${row.map((v: any) => JSON.stringify(v)).join(", ")}]`)
            .join("\n");
          return `[탭 ${idx + 1}: '${s.sheetTitle}' (전체 ${s.rowCount || 0}행, ${s.columnCount || 0}열)]\n- 감지된 헤더(1행): ${headersStr || "(비어있음)"}\n- 기존 데이터 샘플:\n${sampleRowsStr || "  (데이터 없음)"}`;
        })
        .join("\n\n");
    } else {
      sheetStructureSummary = `스프레드시트 ID: ${spreadsheetId} (시트 상세 격자 자동 조회 불가 - 기본 대장형 기반 추론 필요)`;
    }

    // 2. 피드백 조율 모드 여부 분기
    const isFeedbackMode = Boolean(feedback && feedback.trim() && previousSchema);

    const systemPrompt = `당신은 Google 스프레드시트 자동화 수석 아키텍트(Sheet Architect AI)입니다.
사용자가 제공한 실제 스프레드시트의 탭 목록, 헤더 열, 데이터 샘플 및 요구사항을 정밀 분석하여 자동화 실행 계획을 수립하세요.

[시트 양식 유형 분류 기준]
1. TABULAR_LEDGER (📊 누적 대장형):
   - 상단 또는 특정 행에 헤더가 있고, 행 단위로 신규 데이터(발주 내역, 문의 내역 등)가 계속 추가/누적되는 형태.
   - 단일 발주서에 여러 품목이 있을 경우, 뭉뚱그려 1행으로 넣지 않고 품목별로 N개 행을 분리 기록하는 것이 표준.
2. FORM_TEMPLATE (📄 견적서/발주서 양식형):
   - 인쇄/PDF 출력을 위한 고정된 양식지.
   - 특정 셀 좌표(예: C4, G5)에 고객사/작성일 등이 들어가고, 품목 리스트는 정해진 행 구간(예: 12~20행)에 들어가며 하단에 SUM 합계 수식이 보존되어야 하는 형태.
3. REPORT_DASHBOARD (📈 실적 보고서/대시보드형):
   - 월별/주별 KPI 카드, 집계 셀, 피벗 테이블, 차트 등이 공존하는 형태.
4. MULTI_TAB (📑 다중 탭 연동형):
   - 한 스프레드시트 내에 양식 시트, 내역 대장 시트, 마스터 단가표 시트가 서로 연동되는 시스템.

[주의 사항 - 절대 준수]
- 1행이 무조건 헤더가 아닐 수 있습니다. 상단에 문서 제목이나 결재란이 있다면 실제 헤더 행 번호(headerRow)와 데이터 시작 행(dataStartRow)을 정확히 찾아내세요.
- 셀 병합이나 다단 헤더가 있다면 상·하위 명칭을 조합하여 각 열의 고유한 의미를 명확히 정의하세요.
- 사용자에게 친절하고 전문적인 어조로 분석 결과와 실행 계획을 설명하세요.

[출력 규격]
반드시 마크다운 없이 다음 순수 JSON 규격으로만 응답하세요:
{
  "archetype": "TABULAR_LEDGER" | "FORM_TEMPLATE" | "REPORT_DASHBOARD" | "MULTI_TAB",
  "archetypeName": "📊 누적 대장형" | "📄 견적서/발주서 양식형" | "📈 실적 보고서형" | "📑 다중 탭 연동형",
  "targetTab": "작업 대상 시트 탭 이름",
  "headerRow": 1,
  "dataStartRow": 2,
  "columns": [
    { "index": 1, "letter": "A", "name": "컬럼명", "purpose": "데이터 용도 설명" }
  ],
  "formCoordinates": {
    "fixedCells": [
      { "label": "항목명", "cell": "셀좌표(예: C4)", "valueDescription": "설명" }
    ],
    "itemRange": { "startRow": 12, "endRow": 20 },
    "preservedFormulas": [
      { "cell": "H22", "formula": "=SUM(H12:H21)", "note": "보존 필수" }
    ]
  },
  "planSummary": "사용자에게 브리핑할 2~3줄의 분석 및 실행 계획 요약 (정중한 한국어)",
  "keyStrategies": [
    "핵심 실행 전략 1 (예: 품목별 1행 분리 기록)",
    "핵심 실행 전략 2 (예: 헤더 아래 신규 행 삽입)",
    "핵심 실행 전략 3 (예: 기존 합계 수식 보존)"
  ],
  "warnings": [
    "주의사항 또는 참고 안내문 (없으면 빈 배열)"
  ]
}`;

    let userMessage = "";
    if (isFeedbackMode) {
      userMessage = `[스프레드시트 원본 구조]:
${sheetStructureSummary}

[이전 분석 계획안]:
${JSON.stringify(previousSchema, null, 2)}

[사용자의 추가 조율 피드백 (현재 ${turn}/5회차)]:
"${feedback}"

* 지침: 사용자의 피드백을 반영하여 계획안(JSON)을 수정/보완하고, 사용자에게 변경된 내용을 친절히 안내하는 planSummary를 포함하여 응답하세요.`;
    } else {
      userMessage = `[스프레드시트 원본 구조]:
${sheetStructureSummary}

[사용자 최초 요구사항]:
${prompt || "스마트 발주/업무 자동화 시스템 구축"}

* 지침: 위의 스프레드시트 실제 탭과 컬럼, 데이터 샘플을 정밀 분석하여 양식 유형과 완벽한 자동화 실행 계획(JSON)을 작성하세요.`;
    }

    const aiRes = await callAiCaller(userMessage, {
      model: targetModel,
      systemPrompt,
      temperature: 0.2,
      caller: "sheetbot-sheet-architect",
    });

    let rawText = aiRes.content || aiRes.text || "";
    // JSON 파싱
    let parsedSchema: any = null;
    try {
      const clean = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const s = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (s !== -1 && end !== -1) {
        parsedSchema = JSON.parse(clean.substring(s, end + 1));
      } else {
        throw new Error("JSON 블록을 찾을 수 없습니다.");
      }
    } catch (parseErr: any) {
      console.warn("[Sheets-Analyze] Parse fallback:", parseErr.message);
      // 안전 폴백 스키마
      parsedSchema = {
        archetype: "TABULAR_LEDGER",
        archetypeName: "📊 누적 대장형",
        targetTab: fullContext?.sheetsData?.[0]?.sheetTitle || "Sheet1",
        headerRow: 1,
        dataStartRow: 2,
        columns: (fullContext?.sheetsData?.[0]?.headers || []).map((h: string, idx: number) => ({
          index: idx + 1,
          letter: String.fromCharCode(65 + idx),
          name: h,
          purpose: h,
        })),
        planSummary: "스프레드시트의 컬럼 헤더를 기반으로 자동 기록 파이프라인을 구성합니다.",
        keyStrategies: ["시트의 기존 컬럼 순서에 1:1로 데이터를 안전하게 매핑합니다."],
        warnings: [],
      };
    }

    return NextResponse.json({
      success: true,
      spreadsheetId,
      turn: Math.min(turn, 5),
      maxTurns: 5,
      schema: parsedSchema,
    });
  } catch (err: any) {
    console.error("[Sheets-Analyze-API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "시트 구조 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
