export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callCompanyResearchTool,
  callSheetsTool,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";
import {
  COMPANY_RESEARCH_REPORTS_TABLE,
  ensureCompanyResearchReportsTable,
  extractCompanyEntities,
  generateFreeformResearchHtml,
  runMultiAngleMcpResearch,
  uploadResearchArtifactsToDrive,
} from "@/lib/company-research-engine";

// 15초 멱등성 중복 요청 방어 캐시
const recentResearchRequests = new Map<string, { ts: number; payload: any }>();

/**
 * POST /api/user/company-research
 *
 * 시트봇 모바일 앱(SheetBot Agent)에서 텍스트, URL, 이미지(명함/사업자등록증/브로슈어), PDF 자료를 수신하여:
 * 1. AI 멀티모달로 회사 핵심 엔티티 추출
 * 2. EGDesk MCP 다각적 병렬 리서치 (국민연금 + 국세청 + SMPP 기술개발제품 인증 + 나라장터 + 입찰공고 + 기업마당 + 웹/SEO/SSL)
 * 3. AI 자유 생성 완전 자립형 HTML 보고서 제작
 * 4. 공개 공유용 UUID URL 발급 + 구글 드라이브 .html 파일 격리 저장 + 구글 시트 대장 자동 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    await ensureCompanyResearchReportsTable();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let companyName = "";
    let domain = "";
    let sourceText = "";
    let sourceUrl = "";
    let bodyEmail = "";
    let uploadedFile: File | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      companyName = String(formData.get("companyName") || formData.get("name") || "").trim();
      domain = String(formData.get("domain") || formData.get("homepage") || "").trim();
      sourceText = String(formData.get("sourceText") || formData.get("text") || formData.get("memo") || "").trim();
      sourceUrl = String(formData.get("sourceUrl") || formData.get("url") || "").trim();
      bodyEmail = String(formData.get("userEmail") || formData.get("email") || "").trim();
      const fileEntry = formData.get("file");
      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        uploadedFile = fileEntry as File;
      }
    } else {
      const json = await req.json().catch(() => ({}));
      companyName = String(json.companyName || json.name || "").trim();
      domain = String(json.domain || json.homepage || "").trim();
      sourceText = String(json.sourceText || json.text || json.memo || "").trim();
      sourceUrl = String(json.sourceUrl || json.url || "").trim();
      bodyEmail = String(json.userEmail || json.email || "").trim();
    }

    const userEmail =
      bodyEmail && bodyEmail.includes("@")
        ? bodyEmail.toLowerCase().trim()
        : sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!companyName && !domain && !sourceText && !sourceUrl && !uploadedFile) {
      return NextResponse.json(
        {
          success: false,
          error: "회사명, URL, 텍스트, 이미지 또는 PDF 자료 중 최소 1개 이상을 입력·첨부해 주세요.",
        },
        { status: 400 }
      );
    }

    // 파일 버퍼 준비 (최대 15MB 가드)
    let fileBuffer: Buffer | null = null;
    let fileName = "";
    let fileMimeType = "";
    if (uploadedFile) {
      if (uploadedFile.size > 15 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: "첨부 파일 크기는 최대 15MB까지 지원합니다." },
          { status: 413 }
        );
      }
      fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
      fileName = uploadedFile.name || `company_source_${Date.now()}`;
      fileMimeType = uploadedFile.type || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 15초 멱등성 중복 방어
    const dedupKey = `${cleanEmail}|${companyName}|${domain}|${sourceUrl}|${sourceText.slice(0, 60)}|${fileName}|${fileBuffer?.length || 0}`;
    const recent = recentResearchRequests.get(dedupKey);
    if (recent && Date.now() - recent.ts < 15_000) {
      return NextResponse.json(recent.payload);
    }

    // 1. 잔여 토큰 점검 (심층 멀티모달 HTML 리서치 600 토큰 / 텍스트 기본 500 토큰)
    const tokenCost = fileBuffer ? 600 : 500;
    const balanceCheck = await checkTokenBalance(cleanEmail, tokenCost);
    if (!balanceCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "AI 토큰이 부족합니다. 충전 후 다시 시도해 주세요." },
        { status: 402 }
      );
    }

    const nowStr = getKoreanTimeString();
    const reportUuid = crypto.randomUUID();
    const reportId = `cr_${Date.now()}_${reportUuid.slice(0, 8)}`;

    // 자료 유형 판별
    const sourceTypes: string[] = [];
    if (companyName || sourceText) sourceTypes.push("text");
    if (domain || sourceUrl) sourceTypes.push("url");
    if (fileBuffer) {
      sourceTypes.push(fileMimeType.includes("pdf") ? "pdf" : "image");
    }
    const sourceType = sourceTypes.length > 1 ? "mixed" : sourceTypes[0] || "text";

    // 2. 1단계: AI 멀티모달 회사 정보 추출
    const entity = await extractCompanyEntities({
      companyName,
      domain,
      sourceText,
      sourceUrl,
      fileBuffer,
      fileName,
      fileMimeType,
    });

    // 3. 2단계: EGDesk MCP 다각적 병렬 리서치 (국민연금 + 국세청 + SMPP + 나라장터 + 입찰공고 + 기업마당 + 웹/SEO/SSL)
    const mcp = await runMultiAngleMcpResearch(entity);

    // 4. 3단계: AI 자유 생성 HTML 보고서 + 3줄 Executive Summary
    const { html: reportHtml, summary: aiSummary, tokensUsed } = await generateFreeformResearchHtml({
      entity,
      mcp,
      nowStr,
    });

    const shareUrl = `https://sheetbot.cloud/research/report/${reportUuid}`;

    // 5. 4단계: 사용자 격리 OAuth 세션으로 구글 드라이브 .html 파일 업로드 + 구글 시트 대장 적재
    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);

    const { driveHtmlUrl, sourceFileUrl } = await uploadResearchArtifactsToDrive({
      userEmail: cleanEmail,
      companyName: entity.companyName,
      reportHtml,
      sourceFileBuffer: fileBuffer,
      sourceFileName: fileName,
      sourceFileMimeType: fileMimeType,
      callOptions,
    });

    let sheetUrl: string | null = null;
    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: "COMPANY_RESEARCH",
        defaultTitle: "[SheetBot] 기업 리서치 관리 대장",
        preferOAuth: true,
        callOptions,
      });
      const sheetId = resolved.spreadsheetId;
      sheetUrl = resolved.spreadsheetUrl;

      const STANDARD_RESEARCH_HEADERS = [
        "HTML 보고서 (공유 링크)",
        "조사 일시",
        "회사명 (상호)",
        "홈페이지 (도메인)",
        "사업자번호",
        "기업 상태 (국세청)",
        "고용 인원 (국민연금)",
        "추정 평균 급여",
        "SMPP 기술인증",
        "공공조달 계약",
        "추천 정부지원사업",
        "드라이브 HTML 파일",
        "AI 경영진 핵심 요약",
      ];

      if (sheetId) {
        try {
          const headerCheck = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: sheetId,
              range: "시트1!A1:M1",
              preferOAuth: true,
            },
            callOptions
          );
          const existingHeaders = headerCheck?.values?.[0] || [];
          if (existingHeaders.length < 13 || existingHeaders[0] !== STANDARD_RESEARCH_HEADERS[0]) {
            await callSheetsTool(
              "sheets_update_range",
              {
                spreadsheetId: sheetId,
                range: "시트1!A1:M1",
                values: [STANDARD_RESEARCH_HEADERS],
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});

            await callSheetsTool(
              "sheets_format_headers",
              {
                spreadsheetId: sheetId,
                tabName: "시트1",
                headerBgColor: "#0f172a",
                headerTextColor: "#38bdf8",
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});
          }
        } catch {}

        const shareFormula = `=HYPERLINK("${shareUrl}", "🌐 HTML 보고서 열기")`;
        const driveFormula = driveHtmlUrl
          ? `=HYPERLINK("${driveHtmlUrl}", "📁 드라이브 HTML")`
          : "-";

        const newRow = [
          shareFormula,
          nowStr,
          entity.companyName,
          entity.domain || "-",
          mcp.resolvedBusinessNumber || "-",
          mcp.bizverify.taxStatus,
          mcp.nps.employeeCount,
          mcp.nps.avgSalary,
          mcp.smpp.summary,
          mcp.koneps.contractSummary,
          mcp.bizinfo.summary,
          driveFormula,
          aiSummary,
        ];

        await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId: sheetId,
            range: "A:M",
            values: [newRow],
            preferOAuth: true,
          },
          callOptions
        ).catch(() => {});
      }
    } catch (sheetErr: any) {
      console.warn("[CompanyResearch] Sheet append warning:", sheetErr?.message || sheetErr);
    }

    // 6. My DB 영구 저장 (외부 공유 UUID URL 조회용 — 7종 감사 컬럼 준수)
    await insertRows(COMPANY_RESEARCH_REPORTS_TABLE, [
      {
        id: reportId,
        uuid: reportUuid,
        user_email: cleanEmail,
        company_name: entity.companyName,
        domain: entity.domain || "",
        business_number: mcp.resolvedBusinessNumber || "",
        source_type: sourceType,
        source_file_name: fileName || "",
        source_file_url: sourceFileUrl || "",
        drive_html_url: driveHtmlUrl || "",
        doc_url: mcp.existingResearch.docUrl || "",
        sheet_url: sheetUrl || "",
        share_url: shareUrl,
        tax_status: mcp.bizverify.taxStatus,
        employee_count: mcp.nps.employeeCount,
        avg_salary: mcp.nps.avgSalary,
        contract_summary: mcp.koneps.contractSummary,
        smpp_summary: mcp.smpp.summary,
        grants_summary: mcp.bizinfo.summary,
        ai_summary: aiSummary,
        report_html: reportHtml,
        mcp_data_json: JSON.stringify({
          entity,
          smppCount: mcp.smpp.count,
          contractCount: mcp.koneps.contractCount,
          grantsCount: mcp.bizinfo.count,
          webTechSummary: mcp.webTech.summary,
        }),
        status: "COMPLETED",
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: cleanEmail,
      },
    ]).catch((dbErr: any) => {
      console.warn("[CompanyResearch] Report DB insert warning:", dbErr?.message || dbErr);
    });

    // 7. 백그라운드 EGDesk 리서치 문서 블록 삽입 (응답 지연 방지)
    void (async () => {
      try {
        const bNoForDoc = (mcp.resolvedBusinessNumber || "").replace(/[^0-9]/g, "").padEnd(10, "0").slice(0, 10);
        const blocks: Array<{ toolName: string; rawResult: any }> = [];
        if (mcp.nps.primary) blocks.push({ toolName: "nps_search", rawResult: mcp.nps.primary });
        if (mcp.bizverify.raw) blocks.push({ toolName: "bizverify_status", rawResult: mcp.bizverify.raw });
        if (mcp.smpp.count > 0) blocks.push({ toolName: "smpp_lookup", rawResult: { count: mcp.smpp.count, items: mcp.smpp.items } });
        if (mcp.koneps.contractCount > 0) blocks.push({ toolName: "koneps_search", rawResult: { count: mcp.koneps.contractCount, items: mcp.koneps.contracts } });
        if (mcp.bizinfo.count > 0) blocks.push({ toolName: "bizinfo_search", rawResult: { count: mcp.bizinfo.count, items: mcp.bizinfo.items } });

        for (const b of blocks) {
          await callCompanyResearchTool("companyresearch_doc_insert_result", {
            businessNumber: bNoForDoc,
            companyName: entity.companyName,
            domain: entity.domain,
            toolName: b.toolName,
            rawResult: b.rawResult,
          }).catch(() => {});
        }
      } catch {}
    })();

    // 8. 감사 로그 적재 및 토큰 차감
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        user_email: cleanEmail,
        rule_id: "COMPANY_RESEARCH",
        rule_name: "🔍 AI 멀티모달 기업 심층 리서치 (HTML 보고서)",
        device_id: "SheetBot Agent",
        recipient: entity.companyName,
        content: `[기업리서치] ${entity.companyName} (${entity.domain || sourceType}) -> HTML 보고서(${shareUrl}) 및 드라이브·시트 적재`,
        status: "SUCCESS",
        error_message: null,
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: cleanEmail,
      },
    ]).catch(() => {});

    await deductTokens(cleanEmail, tokenCost).catch(() => {});
    void recordAiUsageLog({
      userEmail: cleanEmail,
      caller: "sheetbot-company-research-html",
      purpose: `기업 심층 리서치 HTML 보고서 (${entity.companyName})`,
      model: "gemini-3.8-flash",
      promptTokens: Math.round((tokensUsed || tokenCost) * 0.6),
      completionTokens: Math.round((tokensUsed || tokenCost) * 0.4),
      totalTokens: tokensUsed || tokenCost,
      promptText: `기업 조사(${sourceType}): ${entity.companyName} / ${entity.domain}`,
      responseText: aiSummary,
    });

    const responsePayload = {
      success: true,
      message: `${entity.companyName}에 대한 AI 심층 리서치 HTML 보고서가 생성되었습니다.`,
      reportUuid,
      shareUrl,
      driveHtmlUrl,
      sourceFileUrl,
      companyName: entity.companyName,
      domain: entity.domain,
      businessNumber: mcp.resolvedBusinessNumber,
      docId: mcp.existingResearch.docId,
      docUrl: shareUrl, // 모바일 기존 호환: 기본 보고서 열기 버튼을 공개 HTML 보고서로 직결
      egdeskDocUrl: mcp.existingResearch.docUrl,
      sheetUrl: sheetUrl || "",
      taxStatus: mcp.bizverify.taxStatus,
      employeeCount: mcp.nps.employeeCount,
      avgSalary: mcp.nps.avgSalary,
      smppSummary: mcp.smpp.summary,
      contractSummary: mcp.koneps.contractSummary,
      grantsSummary: mcp.bizinfo.summary,
      webTechSummary: mcp.webTech.summary,
      summary: aiSummary,
    };

    recentResearchRequests.set(dedupKey, { ts: Date.now(), payload: responsePayload });
    if (recentResearchRequests.size > 100) {
      const oldestKey = recentResearchRequests.keys().next().value;
      if (oldestKey) recentResearchRequests.delete(oldestKey);
    }

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[CompanyResearch] Error:", err);
    return NextResponse.json({ success: false, error: err?.message || "기업 리서치 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
