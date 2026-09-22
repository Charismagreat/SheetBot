export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { cachedQueryTable, fetchWithCache } from "@/lib/server-cache";

export async function GET(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail || !(await isCurrentUserAdmin(adminEmail))) {
      return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // ⚡ 인메모리 TTL 캐시 적용: 동일 통계 요청 시 0.001초 반환 및 중복 병렬 요청 병합
    const stats = await fetchWithCache(
      "admin_kpi_stats",
      async () => {
        // 상단 KPI 렌더링에 필요한 핵심 통계만 병렬로 빠르게 집계 (cachedQueryTable로 중복 쿼리 병합)
        const [usersRes, inquiriesRes, reviewsRes, taxRes] = await Promise.all([
          cachedQueryTable("sheetbot_users", { limit: 300 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_inquiries", { limit: 300 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_reviews", { limit: 200 }, 30, forceRefresh),
          cachedQueryTable("sheetbot_tax_invoices", { limit: 200 }, 20, forceRefresh),
        ]);

        const validUsers = (usersRes.rows || []).filter((r: any) => !r.deleted_at);
        const validInquiries = (inquiriesRes.rows || []).filter((r: any) => !r.deleted_at);
        const validReviews = (reviewsRes.rows || []).filter((r: any) => !r.deleted_at);
        const validTaxInvoices = (taxRes.rows || []).filter((r: any) => !r.deleted_at);

        // 1. 기본 플랫폼 지표
        const totalUsersCount = validUsers.length;
        const proUsersCount = validUsers.filter((u: any) => u.tier === "PRO" || u.tier === "ENTERPRISE").length;
        const pendingInquiriesCount = validInquiries.filter((i: any) => i.status === "PENDING").length;
        const avgRating = validReviews.length > 0
          ? (validReviews.reduce((acc: number, r: any) => acc + (Number(r.rating) || 5), 0) / validReviews.length).toFixed(1)
          : "5.0";
        const requestedTaxCount = validTaxInvoices.filter((t: any) => t.status === "REQUESTED").length;

        // 2. Enterprise AX 수주 파이프라인 지표
        const enterpriseInquiries = validInquiries.filter(
          (i: any) => i.source === "ENTERPRISE_INQUIRY" || i.category === "ENTERPRISE_AX"
        );
        const tierSCount = enterpriseInquiries.filter((i: any) => i.ai_score?.tier === "S").length;
        const tierACount = enterpriseInquiries.filter((i: any) => i.ai_score?.tier === "A").length;
        const highTierCount = tierSCount + tierACount;
        const voucherMatchedCount = enterpriseInquiries.filter(
          (i: any) => i.ai_company_analysis?.matchedVouchers && i.ai_company_analysis.matchedVouchers.length > 0
        ).length;
        const mfgInquiriesCount = enterpriseInquiries.filter(
          (i: any) => i.industry && /제조|생산|가공|조명/.test(i.industry)
        ).length;

        return {
          totalUsersCount,
          proUsersCount,
          pendingInquiriesCount,
          totalInquiriesCount: validInquiries.length,
          totalReviewsCount: validReviews.length,
          avgRating,
          requestedTaxCount,
          totalTaxInvoicesCount: validTaxInvoices.length,
          enterpriseCount: enterpriseInquiries.length,
          highTierCount,
          tierSCount,
          tierACount,
          voucherMatchedCount,
          mfgInquiriesCount,
        };
      },
      20,
      forceRefresh
    );

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error("[Admin-Stats-API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
