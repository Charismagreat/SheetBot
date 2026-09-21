export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { setupDatabase } from "@/lib/setup-db";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { isCurrentUserAdmin, getCurrentUserEmail } from "@/lib/auth";

/**
 * GET / POST /api/admin/migrate
 * 시트봇 전체 데이터베이스 스키마 동기화 및 관리자 계정 승격 마이그레이션 API
 */
export async function GET(req: NextRequest) {
  return handleMigration(req);
}

export async function POST(req: NextRequest) {
  return handleMigration(req);
}

async function handleMigration(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const cleanSessionEmail = (sessionEmail || "").toLowerCase().trim();

    // 관리자 또는 로컬 개발 환경 검증 (chachogreat@gmail.com)
    const isAdmin = cleanSessionEmail === "chachogreat@gmail.com" || 
                    cleanSessionEmail === "charismagreat@gmail.com" || 
                    await isCurrentUserAdmin(cleanSessionEmail);

    console.log(`[Admin-Migrate] Started migration by: ${sessionEmail || "system"} (isAdmin: ${isAdmin})`);

    // 1. 전체 DB 스키마 강제 동기화 및 신규 컬럼 주입
    await setupDatabase(true);

    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    const targetEmail = "chachogreat@gmail.com";

    // 2. sheetbot_users 관리자 계정 보장
    const userRes = await queryTable("sheetbot_users", {
      filters: { email: targetEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let userStatus = "";
    if (userRes.rows && userRes.rows.length > 0) {
      await updateRows(
        "sheetbot_users",
        {
          role: "ADMIN",
          tier: "ENTERPRISE",
          status: "ACTIVE",
          updated_at: nowStr,
        },
        { filters: { email: targetEmail } }
      );
      userStatus = "기존 계정 관리자(ADMIN/ENTERPRISE) 승격 완료";
    } else {
      await insertRows("sheetbot_users", [
        {
          id: "user_admin_chachogreat",
          email: targetEmail,
          name: "차호석",
          role: "ADMIN",
          tier: "ENTERPRISE",
          status: "ACTIVE",
          created_at: nowStr,
          updated_at: nowStr,
        },
      ]);
      userStatus = "신규 관리자(ADMIN/ENTERPRISE) 레코드 생성 완료";
    }

    // 3. 관리자 토큰 지갑 보장 (sheetbot_user_wallets)
    const walletRes = await queryTable("sheetbot_user_wallets", {
      filters: { user_email: targetEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let walletStatus = "";
    if (walletRes.rows && walletRes.rows.length > 0) {
      const currentBalance = Number(walletRes.rows[0].balance_tokens || 0);
      if (currentBalance < 100000) {
        await updateRows(
          "sheetbot_user_wallets",
          {
            balance_tokens: 1000000,
            tier: "ENTERPRISE",
            updated_at: nowStr,
          },
          { filters: { user_email: targetEmail } }
        );
        walletStatus = "지갑 잔액 1,000,000 토큰으로 재충전 완료";
      } else {
        walletStatus = `기존 지갑 정상 유지 (${currentBalance.toLocaleString()} 토큰)`;
      }
    } else {
      await insertRows("sheetbot_user_wallets", [
        {
          id: "wallet_chachogreat",
          user_email: targetEmail,
          balance_tokens: 1000000,
          total_purchased_tokens: 1000000,
          total_used_tokens: 0,
          tier: "ENTERPRISE",
          created_at: nowStr,
        },
      ]);
      walletStatus = "관리자 지갑 신규 생성 (1,000,000 토큰)";
    }

    // 4. 모바일 에이전트 등록 상태 점검
    const deviceRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: targetEmail, pairing_mode: "android_agent" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const deviceCount = deviceRes.rows?.length || 0;

    return NextResponse.json({
      success: true,
      message: "🎉 SheetBot 데이터베이스 전체 마이그레이션이 성공적으로 완료되었습니다!",
      timestamp: nowStr,
      results: {
        schemaSetup: "20+ 개 전체 테이블 생성 및 감사 컬럼(UUID/Audit) 마이그레이션 완료",
        adminAccount: userStatus,
        adminWallet: walletStatus,
        agentDevices: `등록된 에이전트 기기 ${deviceCount}대`,
        targetEmail,
      },
    });
  } catch (err: any) {
    console.error("[Admin-Migrate] error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
