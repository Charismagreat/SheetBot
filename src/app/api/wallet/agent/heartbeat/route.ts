export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/wallet/agent/heartbeat
 * 안드로이드 에이전트 앱이 주기적으로 보내는 생존 신호(Heartbeat) 수신 및 상태 갱신
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { userEmail, deviceModel, batteryLevel, appVersion } = body;

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "userEmail이 필요합니다." }, { status: 400 });
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);

    // 해당 유저의 android_agent 기기 레코드 탐색 및 갱신
    const devRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, pairing_mode: "android_agent" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (devRes.rows && devRes.rows.length > 0) {
      const dev = devRes.rows[0];
      const updates: Record<string, any> = {
        status: "CONNECTED",
        last_connected_at: nowStr,
        updated_at: nowStr,
      };
      if (deviceModel) updates.label = `스마트폰 (${deviceModel})`;

      await updateRows("sheetbot_user_devices", updates, {
        filters: { id: dev.id },
      });
    }

    // 현재 입금 대기 중인 세션 개수 반환 (앱 화면에 "현재 1건 입금 대기 중" 표시 지원)
    const pendingRes = await queryTable("sheetbot_deposit_requests", {
      filters: { status: "PENDING" },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const pendingCount = (pendingRes.rows || []).length;

    return NextResponse.json({
      success: true,
      status: "CONNECTED",
      serverTime: nowStr,
      pendingDepositsCount: pendingCount,
      message: "정상 통신 중입니다.",
    });
  } catch (err: any) {
    console.error("[Agent-Heartbeat] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
