export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { maskPhoneNumber, formatZeroRetentionContent } from "@/lib/privacy";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";
import { recordPaymentToGoogleSheet } from "@/lib/payment-sheet-sync";
import { recordReceiptSmsToGoogleSheet } from "@/lib/receipt-sms-sync";
import { findMatchingSmartOrder, generateReceiptSmsText } from "@/lib/smart-order-match";
import { getKoreanTimeString } from "@/lib/date-utils";
import { recordDispatchToGoogleSheet } from "@/lib/dispatch-sheet-sync";

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
    const kstNow = getKoreanTimeString();
    const nowIso = receivedAt || kstNow;
    const logId = Date.now();

    // 발신자 표시 형식 정제 (PUSH 푸시인 경우 그대로 유지, 전화번호인 경우 마스킹)
    const isPushNotification = sender.startsWith("PUSH:") || sender.includes("푸시");
    const displayRecipient = isPushNotification ? sender : maskPhoneNumber(sender);
    const ruleName = isPushNotification ? `🔔 ${sender.replace("PUSH:", "")} 입금/결제 푸시` : "📱 스마트폰 고객 문자 수신";

    // 1. 회원의 스마트 알림 발송/수신 이력 대장에 INBOUND로 기록 (Zero-Retention: 고객 전화번호 마스킹 및 본문 서버 미보관 정책 준수)
    insertRows("sheetbot_user_dispatch_logs", [
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
        created_at: kstNow,
      },
    ]).catch((err: any) => console.warn("[InboundSms] DB log insert error:", err?.message));

    // 1-0. 🛡️ [Zero-Retention 실현] 이용자의 구글 시트 [SheetBot] 고객 알림 발송 및 수신 대장에 직접 실시간 1행 기록
    recordDispatchToGoogleSheet({
      userEmail: cleanEmail,
      dispatchTime: kstNow,
      direction: isPushNotification ? "결제푸시" : "수신(SMS)",
      ruleName,
      recipient: sender, // 마스킹 없는 온전한 원본 발신자 번호/채널명 기록
      content: message, // 온전한 수신 메시지 전문 보존
      status: "INBOUND",
      deviceId: deviceId || "SheetBot Agent",
    }).catch((err) => console.warn("[InboundSms] Dispatch sheet sync error:", err));

    // 1-1. 은행/결제/배달앱 승인 문자 및 푸시일 경우 [SheetBot] 매장 결제 및 매출 대장 시트에 실시간 자동 기록
    const parsedBank = parseBankDepositSms(message);
    let replySms: { recipientPhone: string; message: string } | null = null;
    let matchedOrder: any = null;
    let orderTtsText: string | null = null;

    if (parsedBank.amountKrw && parsedBank.amountKrw > 0) {
      const detectedBankName = parsedBank.bankName !== "알 수 없음" && parsedBank.bankName !== "시중은행 (일반)"
        ? parsedBank.bankName
        : (isPushNotification ? sender.replace("PUSH:", "") : "카드/은행 결제");

      const isExpense = (parsedBank.transactionType || "").includes("지출");
      const custName = parsedBank.depositorName || (isExpense ? "가맹점/출금처" : "고객");
      const cleanAmount = parsedBank.amountKrw;

      recordPaymentToGoogleSheet({
        userEmail: cleanEmail,
        paymentTime: kstNow,
        transactionType: parsedBank.transactionType || "매출(계좌)",
        channelOrBank: detectedBankName,
        accountOrCardNumber: parsedBank.accountOrCardNumber || "-",
        customerName: custName,
        amount: cleanAmount,
        memoOrRawText: message.slice(0, 200),
        deviceId: deviceId || "SheetBot Agent",
      }).catch((err) => console.warn("[InboundSms] Payment sheet sync error:", err));

      // 🎯 매출(입금) 건인 경우, [SheetBot] 스마트 간편 주문 및 품목 대장 매칭 수행!
      if (!isExpense && custName && custName !== "고객" && cleanAmount > 0) {
        try {
          matchedOrder = await findMatchingSmartOrder({
            userEmail: cleanEmail,
            depositorName: custName,
            amount: cleanAmount,
          });

          if (matchedOrder && matchedOrder.customerPhone) {
            console.log(`[InboundSms] 🎉 스마트 간편 주문 매칭 성공! 영수증 SMS 발송 연동: ${matchedOrder.customerName} (${matchedOrder.customerPhone})`);
            // 단문 SMS 규격(한글 40~45자, 80바이트 이하)으로 생성하여 100% 즉시 전송 보장
            const replyMsg = generateReceiptSmsText(matchedOrder.customerName, cleanAmount, matchedOrder.itemsSummary);

            replySms = {
              recipientPhone: matchedOrder.customerPhone,
              message: replyMsg,
            };

            orderTtsText = `${matchedOrder.customerName}님의 주문 결제 ${cleanAmount.toLocaleString()}원이 확인되어 영수증 문자가 발송되었습니다.`;

            // ⚠️ 주의: 여기서 서버가 대장에 미리 '전송 완료'를 기록하면,
            // 안드로이드 앱에서 실제 발송 성공 후 sendReceiptSmsSync를 호출할 때 2건이 중복 기록되므로,
            // 실제 단말기 발송 후 앱의 리포트를 통해 단일 1행만 정확히 기록되도록 일원화합니다.
          }
        } catch (orderErr: any) {
          console.warn("[InboundSms] findMatchingSmartOrder error:", orderErr);
        }
      }
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
      replySms,
      matchedOrder: matchedOrder ? true : false,
      depositorName: matchedOrder?.customerName || null,
      amountKrw: matchedOrder?.amount || 0,
      ttsText: orderTtsText,
    });
  } catch (err: any) {
    console.error("[InboundSms] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
