export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";

export async function GET(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail || !(await isCurrentUserAdmin(adminEmail))) {
      return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    // 1. 필요한 테이블 병렬 조회
    const [walletsRes, usersRes, projectsRes, paymentsRes, inquiriesRes] = await Promise.all([
      queryTable("sheetbot_user_wallets", { limit: 500 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_users", { limit: 500 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_projects", { limit: 500 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_payment_orders", { limit: 500 }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_inquiries", { limit: 500 }).catch(() => ({ rows: [] })),
    ]);

    const validWallets = (walletsRes.rows || []).filter((r: any) => !r.deleted_at);
    const validUsers = (usersRes.rows || []).filter((r: any) => !r.deleted_at);
    const validProjects = (projectsRes.rows || []).filter((r: any) => !r.deleted_at);
    const validPayments = (paymentsRes.rows || []).filter((r: any) => !r.deleted_at);
    const validInquiries = (inquiriesRes.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 전체 고유 이메일 목록 수집 및 Map 사전 구축 (O(N) 성능 최적화)
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

    // 3. 각 회원별 통계 데이터 결합
    const userList: any[] = [];
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

      // users 테이블에 없는 신규 유저 기록 큐잉
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

      userList.push({
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

    // 신규 유저가 있으면 백그라운드 비동기 삽입 (응답 지연 방지)
    if (usersToInsert.length > 0) {
      Promise.resolve().then(async () => {
        try {
          await insertRows("sheetbot_users", usersToInsert);
        } catch (insertErr) {
          console.warn("[Admin-Users-API] Background sync insert note:", insertErr);
        }
      });
    }

    // 가입일 최신순 정렬
    userList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, users: userList });
  } catch (err: any) {
    console.error("[Admin-Users-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail || !(await isCurrentUserAdmin(adminEmail))) {
      return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

    const body = await req.json();
    const { email, status, tier, role, note } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: "대상 회원 이메일이 필요합니다." }, { status: 400 });
    }

    const targetEmail = email.toLowerCase().trim();
    const now = new Date().toISOString();

    // 1. sheetbot_users 업데이트 또는 생성
    const userRes = await queryTable("sheetbot_users", {
      filters: { email: targetEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (userRes.rows && userRes.rows.length > 0) {
      const updateData: any = {
        updated_at: now,
        updated_by: adminEmail,
      };
      if (status) updateData.status = status;
      if (tier) updateData.tier = tier;
      if (role) updateData.role = role;
      if (typeof note === "string") updateData.note = note;

      await updateRows("sheetbot_users", updateData, {
        filters: { email: targetEmail },
      });
    } else {
      await insertRows("sheetbot_users", [
        {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          email: targetEmail,
          name: targetEmail.split("@")[0],
          role: role || "USER",
          status: status || "ACTIVE",
          tier: tier || "FREE",
          note: note || "",
          created_at: now,
          updated_at: now,
          updated_by: adminEmail,
          deleted_at: null,
        },
      ]);
    }

    // 2. sheetbot_user_wallets의 tier 동기화
    if (tier) {
      const walletRes = await queryTable("sheetbot_user_wallets", {
        filters: { user_email: targetEmail },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (walletRes.rows && walletRes.rows.length > 0) {
        await updateRows(
          "sheetbot_user_wallets",
          {
            tier,
            updated_at: now,
            updated_by: adminEmail,
          },
          {
            filters: { user_email: targetEmail },
          }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `${targetEmail} 회원의 정보가 성공적으로 변경되었습니다.`,
    });
  } catch (err: any) {
    console.error("[Admin-Users-API] PUT error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
