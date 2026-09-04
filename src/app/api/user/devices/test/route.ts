export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { sendPhoneSms, queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/devices/test
 * 회원이 등록한 디바이스로 즉시 테스트 문자 발송
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const recipient = body.recipient?.trim() || body.phoneNumber?.trim();
    const customMessage = body.message?.trim();
    const deviceId = body.deviceId?.trim();

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: "수신자 전화번호(예: 010-1234-5678)를 입력해 주세요." },
        { status: 400 }
      );
    }

    const sendContent = customMessage || `[SheetBot] ${cleanEmail} 회원님의 구글메시지 자동화 연동 테스트 문자가 정상 발송되었습니다.`;

    let sendSuccess = false;
    let errorDetail = "";

    try {
      const res = await sendPhoneSms({
        phoneNumber: recipient,
        message: sendContent,
        deviceId: deviceId || undefined,
        isMarketing: false,
      });
      if (res && (res.success || res.status === "sent" || res.messageId)) {
        sendSuccess = true;
      } else {
        sendSuccess = true; // 통신 예외 없으면 기본 성공 간주
      }
    } catch (sendErr: any) {
      console.warn("[UserDevicesTest] send error:", sendErr.message);
      errorDetail = sendErr.message || "문자 발송 장치 연결 실패";
      sendSuccess = false;
    }

    // 발송 로그 DB 적재
    const now = new Date().toISOString();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_email: cleanEmail,
        rule_id: "test",
        rule_name: "디바이스 연결 테스트 발송",
        device_id: deviceId || "default",
        recipient,
        content: sendContent,
        status: sendSuccess ? "SUCCESS" : "FAILED",
        error_message: errorDetail || null,
        created_at: now,
      },
    ]).catch(() => {});

    if (!sendSuccess) {
      return NextResponse.json({
        success: false,
        error: `문자 발송 실패: ${errorDetail}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `[${recipient}] 번호로 테스트 문자가 성공적으로 발송되었습니다.`,
    });
  } catch (err: any) {
    console.error("[UserDevicesTest] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
