export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";

/**
 * POST /api/user/agent2/inbound-sms
 * SheetBot Agent(이용자용 앱)에서 스마트폰으로 수신된 고객 SMS를 시트봇 서버에 동기화
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { userEmail, sender, message, receivedAt, deviceId } = body;

    if (!userEmail || !sender || !message) {
      return NextResponse.json(
        { success: false, error: "필수 파라미터(userEmail, sender, message)가 누락되었습니다." },
        { status: 400 }
      );
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const nowIso = receivedAt || new Date().toISOString();
    const logId = Date.now();

    // 1. 회원의 스마트 알림 발송/수신 이력 대장에 INBOUND로 기록 (SQLite INTEGER id 준수)
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "INBOUND_SMS",
        rule_name: "📱 스마트폰 고객 문자 수신",
        device_id: deviceId || "SheetBot Agent",
        recipient: sender, // 수신된 발신자 번호
        content: message,
        status: "INBOUND", // 수신 상태
        error_message: null,
        created_at: nowIso,
      },
    ]);

    // 2. 실시간 SSE 알림 브로드캐스트 (대시보드 실시간 반영)
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: "agent2_inbound",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch (sseErr) {
      console.warn("[InboundSms] SSE notification error:", sseErr);
    }

    return NextResponse.json({
      success: true,
      message: "수신된 문자가 성공적으로 동기화되었습니다.",
      logId,
    });
  } catch (err: any) {
    console.error("[InboundSms] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
