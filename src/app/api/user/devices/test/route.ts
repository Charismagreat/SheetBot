export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { sendPhoneSms, queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/devices/test
 * 회원이 등록한 시트봇 에이전트(스마트폰 네이티브 앱)로 즉시 테스트 문자 발송
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const recipient = body.recipient?.trim() || body.phoneNumber?.trim();
    const customMessage = body.message?.trim();
    const deviceId = body.deviceId?.trim();

    // 1. 유저 이메일 식별 (req 전달, body 및 헤더 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const bodyEmail = body.userEmail;
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: "수신자 전화번호(예: 010-1234-5678)를 입력해 주세요." },
        { status: 400 }
      );
    }

    const sendContent = customMessage || `[SheetBot] 스마트폰(시트봇 에이전트) 연동 테스트 문자가 정상 발송되었습니다.`;
    const logId = `log_${Date.now()}`;
    const now = new Date().toISOString();

    // 2. 먼저 발송 대기 상태(PENDING)로 DB 적재 (스마트폰 앱이 대기열에서 즉시 가져갈 수 있도록 보장)
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "test",
        rule_name: "디바이스 연결 테스트 발송",
        device_id: deviceId || "SheetBot Agent",
        recipient,
        content: sendContent,
        status: "PENDING",
        error_message: null,
        created_at: now,
      },
    ]).catch((err) => console.warn("[UserDevicesTest] DB insert warning:", err));

    // 3. 만약 egdesk-phone 장치가 연결되어 있다면 직접 전송도 시도
    let directSent = false;
    try {
      const res = await sendPhoneSms({
        phoneNumber: recipient,
        message: sendContent,
        deviceId: deviceId || undefined,
        isMarketing: false,
      });
      if (res && (res.success === true || res.status === "sent" || res.messageId)) {
        directSent = true;
        await updateRows(
          "sheetbot_user_dispatch_logs",
          { status: "SUCCESS", updated_at: new Date().toISOString() },
          { filters: { id: logId } }
        ).catch(() => {});
      }
    } catch {
      // egdesk-phone 미연동 시 스마트폰 앱의 대기열(KeepAliveService) 폴링으로 자연스럽게 위임됨
    }

    return NextResponse.json({
      success: true,
      logId,
      status: directSent ? "SUCCESS" : "PENDING",
      message: directSent
        ? `[${recipient}] 번호로 테스트 문자가 성공적으로 발송되었습니다.`
        : `[${recipient}] 번호로 발송 요청이 등록되었습니다. 연동된 스마트폰(시트봇 에이전트)에서 잠시 후 발송됩니다.`,
    });
  } catch (err: any) {
    console.error("[UserDevicesTest] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
