export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { insertRows } from "@/lib/egdesk-helpers";
import { cachedQueryTable, fetchWithCache } from "@/lib/server-cache";

/**
 * GET /api/admin/bootstrap
 * ⚡ 관리자 대시보드 전체 초기 데이터(KPI 지표 + 기본 탭 회원 목록)를
 * 단 1회의 초고속 HTTP 왕복으로 번들링하여 반환
 */
export async function GET(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail(req);
    if (!adminEmail || !(await isCurrentUserAdmin(adminEmail))) {
      const forbiddenRes = NextResponse.json(
        { success: false, error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
      forbiddenRes.headers.set("Access-Control-Allow-Origin", "*");
      return forbiddenRes;
    }

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // ⚡ 인메모리 TTL 캐시 적용: 중복 병렬 요청 병합 및 0.001초 응답
    const bundleData = await fetchWithCache(
      "admin_bootstrap_bundle",
      async () => {
        // 단 1회의 병렬 실행으로 관리자 대시보드에 필요한 모든 테이블을 동시 수집
        const [
          usersRes,
          inquiriesRes,
          reviewsRes,
          taxRes,
          walletsRes,
          projectsRes,
          paymentsRes,
        ] = await Promise.all([
          cachedQueryTable("sheetbot_users", { limit: 300 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_inquiries", { limit: 300 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_reviews", { limit: 200 }, 30, forceRefresh),
          cachedQueryTable("sheetbot_tax_invoices", { limit: 200 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_user_wallets", { limit: 300 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_projects", { limit: 100 }, 20, forceRefresh),
          cachedQueryTable("sheetbot_payment_orders", { limit: 300 }, 20, forceRefresh),
        ]);

        const validUsers = (usersRes.rows || []).filter((r: any) => !r.deleted_at);
        const validInquiries = (inquiriesRes.rows || []).filter((r: any) => !r.deleted_at);
        const validReviews = (reviewsRes.rows || []).filter((r: any) => !r.deleted_at);
        const validTaxInvoices = (taxRes.rows || []).filter((r: any) => !r.deleted_at);
        const validWallets = (walletsRes.rows || []).filter((r: any) => !r.deleted_at);
        const validProjects = (projectsRes.rows || []).filter((r: any) => !r.deleted_at);
        const validPayments = (paymentsRes.rows || []).filter((r: any) => !r.deleted_at);

        // 1. KPI 지표 계산
        const totalUsersCount = validUsers.length;
        const proUsersCount = validUsers.filter((u: any) => u.tier === "PRO" || u.tier === "ENTERPRISE").length;
        const pendingInquiriesCount = validInquiries.filter((i: any) => i.status === "PENDING").length;
        const avgRating = validReviews.length > 0
          ? (validReviews.reduce((acc: number, r: any) => acc + (Number(r.rating) || 5), 0) / validReviews.length).toFixed(1)
          : "5.0";
        const requestedTaxCount = validTaxInvoices.filter((t: any) => t.status === "REQUESTED").length;

        // Enterprise AX 수주 파이프라인 지표
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

        const stats = {
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

        // 2. 초기 탭(회원 목록) 데이터 구성
        const emailSet = new Set<string>();
        emailSet.add(adminEmail.toLowerCase().trim());
        validWallets.forEach((w: any) => { if (w.user_email) emailSet.add(w.user_email.toLowerCase().trim()); });
        validUsers.forEach((u: any) => { if (u.email) emailSet.add(u.email.toLowerCase().trim()); });
        validProjects.forEach((p: any) => { if (p.user_email) emailSet.add(p.user_email.toLowerCase().trim()); });
        validPayments.forEach((m: any) => { if (m.user_email) emailSet.add(m.user_email.toLowerCase().trim()); });

        const userMetaMap = new Map<string, any>();
        validUsers.forEach((u: any) => {
          if (u.email) userMetaMap.set(u.email.toLowerCase().trim(), u);
        });

        const walletMap = new Map<string, any>();
        validWallets.forEach((w: any) => {
          if (w.user_email) walletMap.set(w.user_email.toLowerCase().trim(), w);
        });

        const projectsMap = new Map<string, any[]>();
        validProjects.forEach((p: any) => {
          const e = p.user_email?.toLowerCase().trim();
          if (e) {
            if (!projectsMap.has(e)) projectsMap.set(e, []);
            projectsMap.get(e)!.push(p);
          }
        });

        const paymentsMap = new Map<string, any[]>();
        validPayments.forEach((m: any) => {
          const e = m.user_email?.toLowerCase().trim();
          if (e && m.status === "PAID") {
            if (!paymentsMap.has(e)) paymentsMap.set(e, []);
            paymentsMap.get(e)!.push(m);
          }
        });

        const inquiriesMap = new Map<string, any[]>();
        validInquiries.forEach((i: any) => {
          const e = i.user_email?.toLowerCase().trim();
          if (e) {
            if (!inquiriesMap.has(e)) inquiriesMap.set(e, []);
            inquiriesMap.get(e)!.push(i);
          }
        });

        const usersList: any[] = [];
        const usersToInsert: any[] = [];

        for (const email of Array.from(emailSet)) {
          const userMeta = userMetaMap.get(email);
          const wallet = walletMap.get(email);
          const userProjects = projectsMap.get(email) || [];
          const userPayments = paymentsMap.get(email) || [];
          const userInquiries = inquiriesMap.get(email) || [];

          const totalSpentKrw = userPayments.reduce((sum: number, cur: any) => sum + (Number(cur.amount_krw) || 0), 0);
          const balanceTokens = wallet ? Number(wallet.balance_tokens || 0) : 20000;
          const totalPurchasedTokens = wallet ? Number(wallet.total_purchased_tokens || 0) : 0;
          const totalUsedTokens = wallet ? Number(wallet.total_used_tokens || 0) : 0;

          const isAdmin = email === adminEmail.toLowerCase().trim() || userMeta?.role === "ADMIN";
          const status = userMeta?.status || "ACTIVE";
          const tier = userMeta?.tier || wallet?.tier || (totalSpentKrw > 0 ? "PRO" : "FREE");
          const name = userMeta?.name || email.split("@")[0];
          const createdAt = userMeta?.created_at || wallet?.created_at || new Date().toISOString();
          const note = userMeta?.note || "";

          if (!userMeta) {
            usersToInsert.push({
              id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              email,
              name,
              role: isAdmin ? "ADMIN" : "USER",
              status,
              tier,
              note: "",
              created_at: createdAt,
              last_login_at: createdAt,
              updated_at: createdAt,
              updated_by: "system_sync",
              deleted_at: null,
            });
          }

          usersList.push({
            id: userMeta?.id || `usr_${email}`,
            email,
            name,
            role: isAdmin ? "ADMIN" : "USER",
            status,
            tier,
            note,
            balanceTokens,
            totalPurchasedTokens,
            totalUsedTokens,
            projectCount: userProjects.length,
            totalSpentKrw,
            inquiryCount: userInquiries.length,
            createdAt,
            projects: userProjects.map((p: any) => ({
              id: p.id,
              name: p.name,
              spreadsheet_url: p.spreadsheet_url,
              status: p.status,
              created_at: p.created_at,
            })),
            payments: userPayments.map((p: any) => ({
              id: p.id,
              order_id: p.order_id,
              package_name: p.package_name,
              amount_krw: p.amount_krw,
              tokens_credited: p.tokens_credited,
              payment_method: p.payment_method,
              created_at: p.created_at,
            })),
          });
        }

        // 신규 유저가 있으면 백그라운드 비동기 삽입
        if (usersToInsert.length > 0) {
          Promise.resolve().then(async () => {
            try {
              await insertRows("sheetbot_users", usersToInsert);
            } catch (err) {
              console.warn("[Admin-Bootstrap] Failed to auto-insert users:", err);
            }
          });
        }

        return { stats, users: usersList };
      },
      20,
      forceRefresh
    );

    const response = NextResponse.json({
      success: true,
      isAdmin: true,
      stats: bundleData.stats,
      users: bundleData.users,
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    return response;
  } catch (error: any) {
    console.error("[Admin-Bootstrap-API] GET error:", error);
    const errRes = NextResponse.json(
      { success: false, error: error.message || "Failed to load admin bootstrap bundle" },
      { status: 500 }
    );
    errRes.headers.set("Access-Control-Allow-Origin", "*");
    return errRes;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}
