export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callKoreanLawTool,
  searchKoreanLaw,
  getKoreanLawDecision,
  callSheetsTool,
  callAiCaller,
  insertRows,
  uploadDriveFile,
  findOrCreateEgdeskFolder,
  findOrCreateEgdeskSubfolder,
  createDriveFolder,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

// 10대 컬럼 구글 시트 헤더 정의
const LAW_SHEET_HEADERS = [
  "ID",
  "질의 일시",
  "법률 질의 / 쟁점",
  "첨부 증빙 파일 URL",
  "첨부 문서 핵심 요약",
  "핵심 관련 법령",
  "관련 대법원 판례",
  "대법원 판결 요지",
  "AI 종합 리스크 진단 (3줄 요약)",
  "상세 보고서 링크",
  "검토 상태",
];

/**
 * GET /api/user/law-advisory?id=xxx
 * 법률 자문 심층 보고서 상세 데이터 단건 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(req.url);
    const advisoryId = searchParams.get("id") || "";

    if (!advisoryId) {
      return NextResponse.json({ success: false, error: "advisoryId (id) is required" }, { status: 400 });
    }

    const { queryTable } = await import("@/lib/egdesk-helpers");
    const rowsRes = await queryTable("sheetbot_law_advisories", {
      filters: { uuid: advisoryId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const row = rowsRes.rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "법률 자문 보고서를 찾을 수 없습니다." }, { status: 404 });
    }

    let reportData = null;
    if (row.full_report_json) {
      try {
        reportData = typeof row.full_report_json === "string" ? JSON.parse(row.full_report_json) : row.full_report_json;
      } catch {
        reportData = null;
      }
    }

    if (!reportData) {
      reportData = {
        advisoryId: row.id,
        queryDatetime: row.created_at,
        queryText: row.query,
        fileName: row.file_name,
        fileDriveUrl: row.file_drive_url,
        documentSummary: row.document_ocr_summary,
        lawTitle: row.related_laws,
        caseNumber: row.related_precedents,
        executiveSummary: row.executive_summary,
        clauseAnalysis: [],
        actionItems: [],
      };
    }

    return NextResponse.json({
      success: true,
      report: reportData,
    });
  } catch (error: any) {
    console.error("[LawAdvisory GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "보고서 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/law-advisory
 * 
 * 자연어 질문 + (선택) 사진/계약서 첨부 파일을 수신하여
 * 1. 구글 드라이브 전용 보관함 격리 저장
 * 2. 멀티모달 OCR 및 독소 조항 분석
 * 3. 법제처 공공 API 병렬 검색 (법령 + 대법원 리딩 판례)
 * 4. 3줄 요약 + 심층 법률 검토 보고서 자동 생성
 * 5. 구글 시트 [SheetBot] 법률·계약 검토 대장 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let queryText = "";
    let userEmailInput = "";
    let uploadedFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      queryText = String(formData.get("query") || "").trim();
      userEmailInput = String(formData.get("userEmail") || formData.get("email") || "").trim();
      const fileEntry = formData.get("file");
      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        uploadedFile = fileEntry as File;
      }
    } else {
      const json = await req.json().catch(() => ({}));
      queryText = String(json.query || "").trim();
      userEmailInput = String(json.userEmail || json.email || "").trim();
    }

    const userEmail = (userEmailInput && userEmailInput.includes("@"))
      ? userEmailInput.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!queryText && !uploadedFile) {
      return NextResponse.json(
        { success: false, error: "법률 질의 내용 또는 첨부 서류(사진/파일)를 입력해 주세요." },
        { status: 400 }
      );
    }

    const queryDatetime = getKoreanTimeString();
    const advisoryId = `law_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. 파일 첨부 시 구글 드라이브 업로드 & Base64 추출
    let fileDriveUrl = "";
    let fileName = "";
    let fileBase64 = "";
    let fileMimeType = "image/jpeg";

    if (uploadedFile) {
      try {
        fileName = uploadedFile.name || `계약서_증빙_${Date.now()}.jpg`;
        fileMimeType = uploadedFile.type || "image/jpeg";
        const buffer = Buffer.from(await uploadedFile.arrayBuffer());
        fileBase64 = buffer.toString("base64");

        // 대상 폴더 격리: [SheetBot] 법률·계약 증빙 보관함
        const parentFolder = await findOrCreateEgdeskFolder("[SheetBot] 연동 데이터");
        const lawFolder = await createDriveFolder("[SheetBot] 법률·계약 증빙 보관함", parentFolder?.id);

        const uploadRes = await uploadDriveFile({
          name: fileName,
          content: fileBase64,
          mimeType: fileMimeType,
          folderId: lawFolder.id,
          encoding: "base64",
        });

        fileDriveUrl = uploadRes?.webViewLink || uploadRes?.url || (uploadRes?.id ? `https://drive.google.com/file/d/${uploadRes.id}/view` : "");
      } catch (fileErr: any) {
        console.warn("[LawAdvisory] Drive upload warning:", fileErr.message);
      }
    }

    // 2. 문서 OCR 및 AI 쟁점 분석 (파일이 있을 경우)
    let documentSummary = "-";
    let documentFullOcr = "";
    if (fileBase64) {
      try {
        const ocrRes = await withTimeout(
          callAiCaller(
            `당신은 법률 문서(계약서, 내용증명, 합의서 등) 전문 법무팀 분석관입니다.
첨부된 문서 이미지/파일을 정밀 판독(OCR)하고 다음을 분석하세요:
1. 문서의 성격 (예: 근로계약서, 상가임대차계약서, 비밀유지서약서 등)
2. 주요 계약 당사자 및 계약 기간, 대금/급여 조건
3. 쟁점 또는 특약 조항 전체 텍스트
4. 상대방에게 일방적으로 유리하거나 위법 소지가 있는 독소 조항 요약`,
            {
              model: "gemini-2.5-flash",
              files: [
                {
                  name: fileName,
                  content: fileBase64,
                  encoding: "base64",
                  mimeType: fileMimeType,
                },
              ],
            }
          ),
          6000,
          null
        );

        if (ocrRes?.text) {
          documentFullOcr = ocrRes.text;
          const firstFewLines = ocrRes.text.split("\n").filter((l) => l.trim()).slice(0, 3).join(" / ");
          documentSummary = firstFewLines.slice(0, 150);
        }
      } catch (e: any) {
        console.warn("[LawAdvisory] OCR warning:", e.message);
      }
    }

    // 3. AI Query Normalizer: 법제처 법령 및 판례 검색어 도출 (1초 이내)
    let targetLawQuery = "민법";
    let targetPrecQuery = "손해배상(기)";
    try {
      const normRes = await withTimeout(
        callAiCaller(
          `다음 사용자의 법률 질의와 문서 내용을 분석하여 법제처 국가법령정보센터 API 검색에 가장 적합한 키워드를 JSON으로 출력하세요.
- 사용자 질문: "${queryText}"
- 문서 요약: "${documentSummary}"

반드시 아래 JSON 형식으로만 응답하세요:
{
  "lawQuery": "관련 법률명 (예: 근로기준법, 상가건물 임대차보호법, 주택임대차보호법, 민법, 개인정보 보호법, 부정경쟁방지법 중 가장 유력한 1개 법률명)",
  "precQuery": "판례 사건명 청구유형 (예: 손해배상(기), 임금, 건물인도, 부당이득금, 채무불이행, 퇴직금, 해고무효확인, 약정금 중 가장 적합한 1개)"
}`,
          { model: "gemini-2.5-flash" }
        ),
        2500,
        null
      );

      const parsed = typeof normRes?.text === "string" ? JSON.parse(normRes.text.replace(/```json|```/g, "").trim()) : null;
      if (parsed?.lawQuery) targetLawQuery = parsed.lawQuery;
      if (parsed?.precQuery) targetPrecQuery = parsed.precQuery;
    } catch {}

    // 4. 법제처 공공데이터 동시 병렬 검색 (법령 + 판례, 최대 3.5초)
    const [lawTask, precTask] = await Promise.allSettled([
      withTimeout(
        callKoreanLawTool("korean_law_search", { query: targetLawQuery, target: "law", display: 3 }),
        3500,
        null
      ),
      withTimeout(
        callKoreanLawTool("korean_law_search", { query: targetPrecQuery, target: "prec", display: 3 }),
        3500,
        null
      ),
    ]);

    // 법령 결과 파싱
    const lawResult = lawTask.status === "fulfilled" ? lawTask.value : null;
    const rawLaws = lawResult?.LawSearch?.law || [];
    const matchedLaw = Array.isArray(rawLaws) && rawLaws.length > 0 ? rawLaws[0] : null;
    const lawTitle = matchedLaw?.법령명한글 || targetLawQuery;
    const lawLink = matchedLaw?.법령상세링크 ? `https://www.law.go.kr${matchedLaw.법령상세링크}` : `https://www.law.go.kr/DRF/lawSearch.do?OC=egdesk&target=law&query=${encodeURIComponent(targetLawQuery)}`;

    // 판례 결과 파싱 & 판결 전문 비동기 획득
    const precResult = precTask.status === "fulfilled" ? precTask.value : null;
    const rawPrecs = precResult?.PrecSearch?.prec || [];
    const matchedPrec = Array.isArray(rawPrecs) && rawPrecs.length > 0 ? rawPrecs[0] : null;
    let precedentId = matchedPrec?.판례일련번호 || "";
    let caseNumber = matchedPrec?.사건번호 || "관련 판례";
    let caseName = matchedPrec?.사건명 || targetPrecQuery;
    let precLink = matchedPrec?.판례상세링크 ? `https://www.law.go.kr${matchedPrec.판례상세링크}` : "";

    let rulingSummary = "당사자 간의 약정이라도 강행법규에 위반되는 조항은 무효이며, 손해배상 청구 시에는 실제 발생한 실손해액과 의무 위반 사이의 상당인과관계를 입증해야 함.";
    let precedentDetailText = "";

    if (precedentId) {
      try {
        const decRes = await withTimeout(
          getKoreanLawDecision(precedentId),
          2500,
          null
        );
        const pService = decRes?.PrecService || {};
        if (pService?.판결요지 || pService?.판시사항) {
          const rawYoji = (pService.판결요지 || pService.판시사항 || "").replace(/<[^>]+>/g, " ").trim();
          rulingSummary = rawYoji.slice(0, 300);
          precedentDetailText = rawYoji;
        }
      } catch {}
    }

    // 5. AI 종합 리스크 진단 (3줄 Executive Summary) 및 심층 보고서 JSON 합성
    const prompt = `당신은 대한민국 최고 수준의 기업/민형사 전문 수석 변호사 및 노무사입니다.
다음 의뢰인의 질의와 첨부 문서, 관련 법령 및 대법원 판례를 종합하여
1) 모바일 화면에 표시할 [3줄 Executive Summary]와
2) 웹 뷰어에 표시할 [상세 법률 검토 보고서 데이터]를 작성하세요.

[의뢰인 질문]: ${queryText || "첨부 서류 법적 효력 및 리스크 검토"}
[첨부 문서 요약]: ${documentSummary}
[판독 문서 전문 일부]: ${documentFullOcr.slice(0, 800)}
[관련 법령]: ${lawTitle}
[관련 판례]: ${caseNumber} (${caseName})
[판례 법리]: ${rulingSummary}

반드시 아래 JSON 포맷으로만 응답하세요:
{
  "executiveSummary": "1. [법적 효력/유효성] ...\\n2. [핵심 리스크 및 독소 조항] ...\\n3. [실무 권고사항] ...",
  "clauseAnalysis": [
    { "clause": "쟁점 조항명/내용", "legality": "유효 / 무효 / 일부무효", "riskLevel": "위험 / 주의 / 안전", "reason": "위법성 및 무효 사유 상세 설명" }
  ],
  "actionItems": [
    "실무 대응 조치 1 (예: 내용증명 발송, 사직서 수리 보류 등)",
    "실무 대응 조치 2 (예: 표준 계약서 양식으로 재체결)"
  ],
  "recommendedClause": "분쟁 방지를 위한 추천 표준 수정 계약 조항 예시 문구"
}`;

    let executiveSummary = `1. [법적 효력] 관련 법령(${lawTitle})의 강행규정에 반하는 일방적 불리 조항은 무효가 될 가능성이 높습니다.\n2. [핵심 리스크] 판례(${caseNumber})에 따라 실손해 입증 없는 위약금 청구나 과도한 배상 요구는 배척될 수 있습니다.\n3. [권고 조치] 서면 증빙을 확보하고 표준 계약서 양식에 맞추어 상호 합의서 작성을 권장합니다.`;
    let clauseAnalysis: any[] = [];
    let actionItems: string[] = ["관련 법조항 및 판례에 근거한 서면 증빙 자료 확보", "전문가 상담을 통한 합의서 재작성"];
    let recommendedClause = "";

    try {
      const aiRes = await withTimeout(
        callAiCaller(prompt, { model: "gemini-2.5-flash", temperature: 0.2 }),
        3500,
        null
      );
      if (aiRes?.text) {
        const parsed = JSON.parse(aiRes.text.replace(/```json|```/g, "").trim());
        if (parsed.executiveSummary) executiveSummary = parsed.executiveSummary;
        if (Array.isArray(parsed.clauseAnalysis)) clauseAnalysis = parsed.clauseAnalysis;
        if (Array.isArray(parsed.actionItems)) actionItems = parsed.actionItems;
        if (parsed.recommendedClause) recommendedClause = parsed.recommendedClause;
      }
    } catch (e: any) {
      console.warn("[LawAdvisory] AI synthesis warning:", e.message);
    }

    const reportUrl = `https://sheetbot.cloud/law-report?id=${advisoryId}`;

    const fullReportData = {
      advisoryId,
      queryDatetime,
      queryText: queryText || "첨부 서류 검토",
      fileName,
      fileDriveUrl,
      documentSummary,
      documentFullOcr,
      lawTitle,
      lawLink,
      caseNumber,
      caseName,
      precLink,
      rulingSummary,
      precedentDetailText,
      executiveSummary,
      clauseAnalysis,
      actionItems,
      recommendedClause,
    };

    // 6. SQLite DB sheetbot_law_advisories 적재
    try {
      await insertRows("sheetbot_law_advisories", [
        {
          uuid: advisoryId,
          user_email: userEmail,
          query: queryText,
          file_name: fileName,
          file_drive_url: fileDriveUrl,
          document_ocr_summary: documentSummary,
          related_laws: lawTitle,
          related_precedents: `${caseNumber} ${caseName}`,
          executive_summary: executiveSummary,
          full_report_json: JSON.stringify(fullReportData),
          status: "COMPLETED",
          created_at: queryDatetime,
        },
      ]);
    } catch (dbErr: any) {
      console.warn("[LawAdvisory] DB insert warning:", dbErr.message);
    }

    // 7. 구글 스프레드시트 [SheetBot] 법률·계약 검토 대장 바인딩 및 행 적재
    let sheetUrl = "";
    try {
      const binding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "LAW_ADVISORY",
        defaultTitle: "[SheetBot] 법률·계약 검토 대장",
      });

      sheetUrl = binding.spreadsheetUrl;

      if (binding.isNew) {
        await callSheetsTool("sheets_append_values", {
          spreadsheetId: binding.spreadsheetId,
          range: "A1:K1",
          values: [LAW_SHEET_HEADERS],
        }).catch(() => {});
      }

      const rowValues = [
        advisoryId,
        queryDatetime,
        queryText || "첨부 서류 법적 검토",
        fileDriveUrl || "-",
        documentSummary,
        lawTitle,
        caseNumber ? `${caseNumber} (${caseName})` : "-",
        rulingSummary,
        executiveSummary,
        reportUrl,
        "검토 완료",
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId: binding.spreadsheetId,
        range: "A:K",
        values: [rowValues],
      });
    } catch (sheetErr: any) {
      console.warn("[LawAdvisory] Sheets append warning:", sheetErr.message);
    }

    // 토큰 정산 및 감사 로그 (10토큰 차감)
    void deductTokens(userEmail, 10, "LAW_ADVISORY", advisoryId).catch(() => {});
    void recordAiUsageLog({
      userEmail,
      taskType: "LAW_ADVISORY",
      model: "gemini-2.5-flash",
      promptTokens: 800,
      completionTokens: 600,
      costKrw: 5,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      advisoryId,
      queryDatetime,
      executiveSummary,
      lawTitle,
      lawLink,
      caseNumber: caseNumber ? `${caseNumber} (${caseName})` : "-",
      rulingSummary,
      reportUrl,
      sheetUrl,
      fileDriveUrl,
      documentSummary,
    });
  } catch (error: any) {
    console.error("[LawAdvisory] API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "법률·판례 자문 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
