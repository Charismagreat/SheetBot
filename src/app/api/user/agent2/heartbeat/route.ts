export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/agent2/heartbeat
 * SheetBot Agent2 앱에서 주기적으로 기기 상태(온라인, 배터리 등)를 보고
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { userEmail, deviceId, battery, networkType } = body;

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "userEmail이 필요합니다." }, { status: 400 });
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const now = new Date().toISOString();

    const existing = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, pairing_mode: "agent2" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existing.rows && existing.rows.length > 0) {
      const dev = existing.rows[0];
      await updateRows(
        "sheetbot_user_devices",
        {
          status: "CONNECTED",
          last_connected_at: now,
          updated_at: now,
        },
        { filters: { id: dev.id } }
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      status: "CONNECTED",
      timestamp: now,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
