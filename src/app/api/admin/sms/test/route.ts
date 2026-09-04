export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { sendPhoneSms } from "@/lib/egdesk-helpers";

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const deviceId = body.deviceId?.trim();
    const phoneNumber = body.phoneNumber?.trim()?.replace(/[^0-9]/g, "");

    if (!deviceId || !phoneNumber) {
      return NextResponse.json(
        { success: false, error: "발송 디바이스 ID와 수신자 전화번호를 입력해 주세요." },
        { status: 400 }
      );
    }

    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const testMessage = `[SheetBot 관리자 테스트]\nEGDesk 구글메시지 MCP 연동 테스트 발송 성공!\n발송시각: ${nowStr}\n수신번호: ${phoneNumber}`;

    try {
      const res = await sendPhoneSms({
        deviceId,
        phoneNumber,
        message: testMessage,
        isMarketing: false,
      });

      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      recordDispatchLog({
        channel: "SMS",
        eventType: "test",
        ruleName: "관리자 SMS 테스트 발송",
        recipient: phoneNumber,
        recipientType: "ADMIN",
        title: "[SheetBot 관리자 테스트]",
        content: testMessage,
        status: "SUCCESS",
      }).catch((e) => console.warn("[SMS Test Log Error]", e));

      return NextResponse.json({
        success: true,
        message: `[${phoneNumber}] 번호로 테스트 문자가 성공적으로 발송되었습니다.`,
        result: res,
      });
    } catch (smsErr: any) {
      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      recordDispatchLog({
        channel: "SMS",
        eventType: "test",
        ruleName: "관리자 SMS 테스트 발송",
        recipient: phoneNumber,
        recipientType: "ADMIN",
        title: "[SheetBot 관리자 테스트]",
        content: testMessage,
        status: "FAILED",
        errorMessage: smsErr.message,
      }).catch((e) => console.warn("[SMS Test Log Error]", e));

      throw smsErr;
    }
  } catch (err: any) {
    console.error("[AdminSMS Test] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "문자 발송 실패" }, { status: 500 });
  }
}
