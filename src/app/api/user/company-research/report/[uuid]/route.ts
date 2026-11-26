export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable } from "@/lib/egdesk-helpers";
import { COMPANY_RESEARCH_REPORTS_TABLE } from "@/lib/company-research-engine";

/**
 * GET /api/user/company-research/report/[uuid]
 *
 * 외부 팀원·고객에게 공유 가능한 UUID 기반 기업 리서치 HTML 보고서 단건 조회 API
 * - ?format=html : 생성된 HTML 문서를 text/html로 직접 반환
 * - ?download=1  : .html 파일 다운로드 응답 반환
 * - 기본(JSON)   : 뷰어 페이지용 메타데이터 + reportHtml 반환
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await context.params;
    const cleanUuid = (uuid || "").trim();

    if (!cleanUuid || cleanUuid.length < 8) {
      return NextResponse.json(
        { success: false, error: "유효한 보고서 UUID가 필요합니다." },
        { status: 400 }
      );
    }

    const res = await queryTable(COMPANY_RESEARCH_REPORTS_TABLE, {
      filters: { uuid: cleanUuid },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    // 소프트 삭제 필터링 준수 (deleted_at IS NULL)
    const row = (res.rows || []).find((r: any) => !r.deleted_at);
    if (!row) {
      return NextResponse.json(
        { success: false, error: "해당 리서치 보고서를 찾을 수 없거나 삭제되었습니다." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "").toLowerCase();
    const isDownload = searchParams.get("download") === "1" || searchParams.get("download") === "true";

    const reportHtml = String(row.report_html || "");
    const companyName = String(row.company_name || "기업리서치");

    if (isDownload || format === "html") {
      const safeFileName = `${companyName.replace(/[/\\?%*:|"<>]/g, "_")}_기업리서치보고서.html`;
      const headers: Record<string, string> = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      };
      if (isDownload) {
        headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}`;
      }
      return new NextResponse(reportHtml, { status: 200, headers });
    }

    return NextResponse.json({
      success: true,
      report: {
        uuid: row.uuid,
        companyName,
        domain: row.domain || "",
        businessNumber: row.business_number || "",
        sourceType: row.source_type || "text",
        sourceFileName: row.source_file_name || "",
        sourceFileUrl: row.source_file_url || "",
        driveHtmlUrl: row.drive_html_url || "",
        shareUrl: row.share_url || `https://sheetbot.cloud/research/report/${row.uuid}`,
        taxStatus: row.tax_status || "-",
        employeeCount: row.employee_count || "-",
        avgSalary: row.avg_salary || "-",
        smppSummary: row.smpp_summary || "-",
        contractSummary: row.contract_summary || "-",
        grantsSummary: row.grants_summary || "-",
        aiSummary: row.ai_summary || "",
        createdAt: row.created_at || "",
        reportHtml,
      },
    });
  } catch (err: any) {
    console.error("[CompanyResearch Report GET] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "보고서 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
