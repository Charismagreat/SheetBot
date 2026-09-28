export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { maskPhoneNumber, formatZeroRetentionContent } from "@/lib/privacy";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";
import { recordPaymentToGoogleSheet } from "@/lib/payment-sheet-sync";

/**
 * POST /api/user/agent2/inbound-sms
 * SheetBot Agent(이용자용 앱)에서 스마트폰으로 수신된 고객 SMS를 시트봇 서버에 동기화
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const userEmail = body.userEmail || body.user_email || body.email || "";
    const sender = body.sender || body.originatingAddress || body.phone || body.from || "알 수 없음";
    const message = body.message || body.smsText || body.text || body.content || body.msg || "";
    const receivedAt = body.receivedAt || body.timestamp || new Date().toISOString();
    const deviceId = body.deviceId || body.device_id || "SheetBot Agent";

    if (!userEmail || !message) {
      return NextResponse.json(
        { success: false, error: "필수 파라미터(userEmail, message)가 누락되었습니다." },
        { status: 400 }
      );
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const nowIso = receivedAt || new Date().toISOString();
    const logId = Date.now();

    // 발신자 표시 형식 정제 (PUSH 푸시인 경우 그대로 유지, 전화번호인 경우 마스킹)
    const isPushNotification = sender.startsWith("PUSH:") || sender.includes("푸시");
    const displayRecipient = isPushNotification ? sender : maskPhoneNumber(sender);
    const ruleName = isPushNotification ? `🔔 ${sender.replace("PUSH:", "")} 입금/결제 푸시` : "📱 스마트폰 고객 문자 수신";

    // 1. 회원의 스마트 알림 발송/수신 이력 대장에 INBOUND로 기록 (Zero-Retention: 고객 전화번호 마스킹 및 본문 서버 미보관 정책 준수)
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: isPushNotification ? "INBOUND_PUSH" : "INBOUND_SMS",
        rule_name: ruleName,
        device_id: deviceId || "SheetBot Agent",
        recipient: displayRecipient,
        content: formatZeroRetentionContent(isPushNotification ? "금융 푸시" : "수신 문자", message.length),
        status: "INBOUND", // 수신 상태
        error_message: null,
        created_at: nowIso,
      },
    ]);

    // 1-1. 은행/결제/배달앱 승인 문자 및 푸시일 경우 [SheetBot] 매장 결제 및 매출 대장 시트에 실시간 자동 기록
    const parsedBank = parseBankDepositSms(message);
    if (parsedBank.amountKrw && parsedBank.amountKrw > 0) {
      const detectedBankName = parsedBank.bankName !== "알 수 없음" && parsedBank.bankName !== "시중은행 (일반)"
        ? parsedBank.bankName
        : (isPushNotification ? sender.replace("PUSH:", "") : "카드/은행 결제");

      recordPaymentToGoogleSheet({
        userEmail: cleanEmail,
        paymentTime: nowIso.replace("T", " ").slice(0, 19),
        channelOrBank: detectedBankName,
        customerName: parsedBank.depositorName || "고객",
        amount: parsedBank.amountKrw,
        memoOrRawText: message.slice(0, 200),
        deviceId: deviceId || "SheetBot Agent",
      }).catch((err) => console.warn("[InboundSms] Payment sheet sync error:", err));
    }

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
