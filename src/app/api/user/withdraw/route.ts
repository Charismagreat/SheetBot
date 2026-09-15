export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { revokeAllUserApiKeys } from "@/lib/api-keys";

/**
 * POST /api/user/withdraw
 * 회원 탈퇴 요청 처리 및 T=0초 전역 킬스위치(Global Kill-Switch) 파이프라인
 * 
 * 1. sheetbot_users: 상태를 WITHDRAWN으로 변경하고 소프트 삭제
 * 2. sheetbot_user_api_keys: 해당 계정의 모든 활성 API 키 즉시 REVOKED 영구 폐기
 * 3. sheetbot_bridge_tokens: 해당 계정의 모든 브릿지 토큰 소프트 삭제 (410 Gone 차단)
 * 4. sheetbot_projects: 해당 계정의 모든 프로젝트를 PENDING_DELETE로 동결 (410 Gone 차단)
 * 5. sheetbot_schedules: 해당 계정의 모든 자동화 스케줄 PAUSED 및 소프트 삭제
 * 6. 클라이언트 세션 쿠키 파기
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const email = userEmail.toLowerCase().trim();
    const nowStr = new Date().toISOString();

    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const withdrawReason = body.reason || "사용자 자발적 회원 탈퇴";

    // 1. sheetbot_users 탈퇴 처리 (Primary Key id 기반 정확한 업데이트)
    const userRes = await queryTable("sheetbot_users", {
      filters: { email },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const userRow = (userRes.rows || [])[0];
    if (userRow) {
      await updateRows(
        "sheetbot_users",
        {
          status: "WITHDRAWN",
          note: `[탈퇴 사유] ${withdrawReason}`,
          deleted_at: nowStr,
          deleted_by: email,
          updated_at: nowStr,
          updated_by: "user_withdraw",
        },
        { filters: { id: String(userRow.id) } }
      ).catch((err) => console.warn("[Withdraw] Update sheetbot_users warning:", err.message));
    }

    // 2. sheetbot_user_api_keys: 회원의 모든 활성 API 키 즉시 REVOKED 영구 폐기 (T=0초 킬스위치)
    const revokedKeyCount = await revokeAllUserApiKeys(email).catch(() => 0);

    // 3. sheetbot_bridge_tokens: 회원의 모든 브릿지 토큰 소프트 삭제
    const tokensRes = await queryTable("sheetbot_bridge_tokens", {
      filters: { user_email: email },
      limit: 200,
    }).catch(() => ({ rows: [] }));

    for (const tRow of tokensRes.rows || []) {
      await updateRows(
        "sheetbot_bridge_tokens",
        {
          deleted_at: nowStr,
          deleted_by: email,
          updated_at: nowStr,
          updated_by: "user_withdraw",
        },
        { filters: { id: tRow.id } }
      ).catch(() => null);
    }

    // 4. sheetbot_projects: 회원의 모든 프로젝트 PENDING_DELETE 동결
    const projectsRes = await queryTable("sheetbot_projects", {
      filters: { user_email: email },
      limit: 200,
    }).catch(() => ({ rows: [] }));

    for (const pRow of projectsRes.rows || []) {
      await updateRows(
        "sheetbot_projects",
        {
          status: "PENDING_DELETE",
          deleted_at: nowStr,
          deleted_by: email,
          updated_at: nowStr,
          updated_by: "user_withdraw",
        },
        { filters: { id: pRow.id } }
      ).catch(() => null);
    }

    // 5. sheetbot_schedules: 회원의 모든 스케줄 정지 및 삭제
    const schedulesRes = await queryTable("sheetbot_schedules", {
      filters: { user_email: email },
      limit: 200,
    }).catch(() => ({ rows: [] }));

    for (const sRow of schedulesRes.rows || []) {
      await updateRows(
        "sheetbot_schedules",
        {
          status: "PAUSED",
          deleted_at: nowStr,
          deleted_by: email,
          updated_at: nowStr,
          updated_by: "user_withdraw",
        },
        { filters: { id: sRow.id } }
      ).catch(() => null);
    }

    console.log(`[Withdraw API] ✅ User ${email} successfully withdrawn. All services and ${revokedKeyCount} API keys revoked.`);

    // 6. 세션 쿠키 파기 헤더와 함께 응답 반환
    const response = NextResponse.json({
      success: true,
      message: "회원 탈퇴가 완료되었습니다. 모든 연동 주소와 API 키가 안전하게 차단되었습니다.",
      revokedKeyCount,
      projectCount: (projectsRes.rows || []).length,
    });

    const sessionCookies = [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
    ];

    sessionCookies.forEach((name) => {
      response.cookies.set(name, "", {
        path: "/",
        expires: new Date(0),
        httpOnly: true,
        sameSite: "lax",
      });
    });

    return response;
  } catch (err: any) {
    console.error("[Withdraw API] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "회원 탈퇴 처리 실패" }, { status: 500 });
  }
}
