export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/dispatch-logs
 * 회원의 스마트 알림 발송 이력 대장 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    const res = await queryTable("sheetbot_user_dispatch_logs", {
      filters: { user_email: cleanEmail },
      limit: 100,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    return NextResponse.json({ success: true, logs: validRows });
  } catch (err: any) {
    console.error("[UserDispatchLogs] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
