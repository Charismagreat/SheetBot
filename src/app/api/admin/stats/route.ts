export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";

export async function GET() {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail || !(await isCurrentUserAdmin(adminEmail))) {
      return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    // 상단 KPI 렌더링에 필요한 핵심 통계만 병렬로 빠르게 집계
    const [usersRes, inquiriesRes, reviewsRes, taxRes] = await Promise.all([
      queryTable("sheetbot_users", { limit: 1000 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_inquiries", { limit: 1000 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_reviews", { limit: 500 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_tax_invoices", { limit: 500 }).catch(() => ({ rows: [] })),
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

    return NextResponse.json({
      success: true,
      stats: {
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
      },
    });
  } catch (error: any) {
    console.error("[Admin-Stats-API] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch admin stats" },
      { status: 500 }
    );
  }
}
