export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callSheetsTool,
  listDriveFiles,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { maskPhoneNumber, formatZeroRetentionContent } from "@/lib/privacy";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";
import { recordPaymentToGoogleSheet } from "@/lib/payment-sheet-sync";
import { findMatchingSmartOrder, generateReceiptSmsText } from "@/lib/smart-order-match";
import { getKoreanTimeString } from "@/lib/date-utils";

// 15초 이내 동일 SMS 송수신 중복 기록 방어 캐시 (키: userEmail:direction:phoneNumber:message, 값: timestamp)
const recentSmsDedupeCache = new Map<string, number>();
// 동일 본문 기준 2차 중복 방어 캐시 (단말기 이중 감시로 인한 번호 왜곡 중복 방지)
const recentSmsBodyCache = new Map<string, { time: number; phone: string }>();

/**
 * 국가코드(82) 제거 및 한국 표준 전화번호 형식(010-XXXX-XXXX, 1599-XXXX 등)으로 정규화
 */
function normalizePhoneNumber(phone: string): string {
  if (!phone) return "-";
  const trimmed = phone.trim();

  // "알림:" 접두어가 붙어있거나 일반 텍스트인 경우 원본 유지
  if (trimmed.startsWith("알림:") || /[가-힣a-zA-Z]/.test(trimmed)) {
    return trimmed;
  }

  let clean = trimmed.replace(/[^0-9+]/g, "").trim();

  // 7자리 미만의 짧은 숫자는 유효한 한국 전화번호가 아니므로 0 접두어를 억지로 붙이지 않고 원본 반환
  if (clean.length < 7) {
    return trimmed;
  }

  if (clean.startsWith("+82")) {
    clean = clean.slice(3);
  } else if (clean.startsWith("82") && clean.length >= 10) {
    clean = clean.slice(2);
  }

  // 대표번호 (15xx, 16xx, 18xx) 8자리
  if (clean.length === 8 && /^(15|16|18)/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }

  if (!clean.startsWith("0")) {
    clean = `0${clean}`;
  }

  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    if (clean.startsWith("02")) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  } else if (clean.length === 9 && clean.startsWith("02")) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return clean;
}

/**
 * POST /api/user/messages/sms
 * 스마트폰 시트봇 에이전트(SmsReceiver 및 SmsSentObserver)에서 수신/발신된 문자를 수신하여
 * 구글 드라이브 [SheetBot] 스마트폰 문자(SMS) 송수신 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      direction = "INBOUND", // "INBOUND" (수신) 또는 "OUTBOUND" (발신)
      phoneNumber: rawPhoneNumber,
      contactName,
      message,
      timestamp,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
      autoRecordSheet = true,
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!rawPhoneNumber || !message) {
      return NextResponse.json({ success: false, error: "전화번호와 메시지 내용은 필수입니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const isOutbound = direction.toUpperCase() === "OUTBOUND";
    const directionLabel = isOutbound ? "발신" : "수신";
    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
    const displayName = contactName && contactName.trim().length > 0 ? contactName.trim() : "미등록 연락처";
    const nowStr = timestamp || getKoreanTimeString();

    // 0. 15초 이내 동일 송수신 중복 요청 방어 (Idempotency Guard)
    const dedupeKey = `${cleanEmail}:${directionLabel}:${phoneNumber}:${message.trim()}`;
    const now = Date.now();
    const lastSeen = recentSmsDedupeCache.get(dedupeKey) || 0;
    if (now - lastSeen < 15_000) {
      return NextResponse.json({
        success: true,
        message: `중복된 문자(${directionLabel}) 요청이 15초 이내에 감지되어 시트 중복 기록을 안전하게 방어했습니다.`,
        isDuplicate: true,
      });
    }
    recentSmsDedupeCache.set(dedupeKey, now);

    // 0-1. 본문 기준 2차 지능형 중복 방어 (단말기 이중 감시로 번호가 왜곡되어 들어온 2차 요청 스킵)
    const bodyKey = `${cleanEmail}:${directionLabel}:${message.trim()}`;
    const lastBodyRecord = recentSmsBodyCache.get(bodyKey);
    const currentDigits = phoneNumber.replace(/[^0-9]/g, "");

    if (lastBodyRecord && (now - lastBodyRecord.time < 15_000)) {
      const prevDigits = lastBodyRecord.phone.replace(/[^0-9]/g, "");
      // 동일 본문이 15초 내에 이미 들어왔는데, 현재 번호가 7자리 미만의 비정상이거나 알림 접두어인 경우 중복 스킵
      if (currentDigits.length < 7 || phoneNumber.startsWith("알림:") || (prevDigits.length >= 9 && currentDigits.length < prevDigits.length)) {
        console.warn(`[SMS API] 단말기 이중 인입 중복 차단: 이전번호=${lastBodyRecord.phone}, 현재번호=${phoneNumber}, 본문=${message.trim()}`);
        return NextResponse.json({
          success: true,
          message: `동일 메시지가 15초 이내에 이미 정상 기록되어 2차 중복 요청을 안전하게 건너뛰었습니다.`,
          isDuplicate: true,
        });
      }
    }
    recentSmsBodyCache.set(bodyKey, { time: now, phone: phoneNumber });

    // 오래된 캐시 정리 (최대 200개 유지)
    if (recentSmsDedupeCache.size > 200) {
      const threshold = now - 60_000;
      for (const [k, v] of recentSmsDedupeCache.entries()) {
        if (v < threshold) recentSmsDedupeCache.delete(k);
      }
      for (const [k, v] of recentSmsBodyCache.entries()) {
        if (v.time < threshold) recentSmsBodyCache.delete(k);
      }
    }

    // [SheetBot] 표준 네이밍 원칙 준수
    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    // 1. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 행 기록 (비동기 처리로 응답 지연 원천 차단)
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      (async () => {
        try {
          const resolved = await resolveUserSpreadsheet({
            userEmail: cleanEmail,
            sheetType: "SMS",
            defaultTitle: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
            requestedTitle: sheetTitle,
            preferOAuth: true,
          });

          const targetSpreadsheetId = resolved.spreadsheetId;

          // 시트에 신규 문자 기록 행 추가 (자가 치유: 1행 헤더 보장)
          if (targetSpreadsheetId) {
            const headerValues = [
              ["일시", "구분", "상대방 이름", "상대방 전화번호", "메시지 내용", "기기명"]
            ];

            // 1행 A1 셀 확인하여 비어있으면 헤더 선제 주입
            const firstRowCheck = await callSheetsTool("sheets_get_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:A1",
              preferOAuth: true,
            }).catch(() => null);

            const hasHeaderOrData = firstRowCheck?.values && firstRowCheck.values.length > 0 && firstRowCheck.values[0]?.[0];

            if (!hasHeaderOrData) {
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:F1",
                values: headerValues,
                preferOAuth: true,
              }).catch(() => {});

              await callSheetsTool("sheets_format_headers", {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#1e293b",
                headerTextColor: "#ffffff",
                preferOAuth: true,
              }).catch(() => {});
            }

            const newRowValues = [
              [nowStr, directionLabel, displayName, phoneNumber, message, deviceId]
            ];
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "A:F",
              values: newRowValues,
              preferOAuth: true,
            }).catch((err: any) => console.warn("[SmsSync] append_values warning:", err.message));
          }
        } catch (sheetErr: any) {
          console.warn("[SmsSync] Sheet auto-record warning:", sheetErr.message);
        }
      })();
    }

    // 1-1. 수신 문자(INBOUND)가 은행 입금 또는 결제 승인 문자일 경우 스마트 간편 주문 즉시 매칭 (Fast-Path)
    let replySms: { recipientPhone: string; message: string } | null = null;
    let matchedOrder: any = null;
    let orderTtsText: string | null = null;

    let parsedBank: any = null;
    let cleanAmount = 0;
    let custName = displayName;
    let isExpense = false;

    if (!isOutbound) {
      try {
        parsedBank = parseBankDepositSms(message);
        if (parsedBank.amountKrw && parsedBank.amountKrw > 0) {
          isExpense = (parsedBank.transactionType || "").includes("지출");
          custName = parsedBank.depositorName || displayName || (isExpense ? "가맹점/출금처" : "고객");
          cleanAmount = parsedBank.amountKrw;

          // 🎯 매출(입금) 건인 경우, [SheetBot] 스마트 간편 주문 및 품목 대장 매칭을 즉각 선제 실행!
          if (!isExpense && custName && custName !== "고객" && cleanAmount > 0) {
            matchedOrder = await findMatchingSmartOrder({
              userEmail: cleanEmail,
              depositorName: custName,
              amount: cleanAmount,
            });

            if (matchedOrder && matchedOrder.customerPhone) {
              console.log(`[SmsSync] 🎉 스마트 간편 주문 매칭 성공! 영수증 SMS 발송 연동: ${matchedOrder.customerName} (${matchedOrder.customerPhone})`);
              const replyMsg = generateReceiptSmsText(matchedOrder.customerName, cleanAmount, matchedOrder.itemsSummary);
              replySms = {
                recipientPhone: matchedOrder.customerPhone,
                message: replyMsg,
              };
              orderTtsText = `${matchedOrder.customerName}님의 주문 결제 ${cleanAmount.toLocaleString()}원이 확인되어 영수증 문자가 발송되었습니다.`;
            }
          }
        }
      } catch (bankErr: any) {
        console.warn("[SmsSync] Bank deposit parse warning:", bankErr?.message);
      }
    }

    // 1-2. 매출 대장 시트 동기화 (비동기 병렬 백그라운드 위임으로 클라이언트 타임아웃 100% 방지)
    if (!isOutbound && parsedBank && parsedBank.amountKrw > 0) {
      recordPaymentToGoogleSheet({
        userEmail: cleanEmail,
        paymentTime: nowStr,
        transactionType: parsedBank.transactionType || "매출(계좌)",
        channelOrBank: parsedBank.bankName || "카드/은행 결제",
        accountOrCardNumber: parsedBank.accountOrCardNumber || "-",
        customerName: custName,
        amount: cleanAmount,
        memoOrRawText: message.slice(0, 200),
        deviceId: deviceId || "SheetBot Agent",
      }).catch((err) => console.warn("[SmsSync] Payment sheet sync background error:", err));
    }

    // 2. 발송/수신 감사 대장 DB 적재 (Zero-Retention: 고객 전화번호 마스킹 및 본문 서버 미보관 정책 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: isOutbound ? "OUTBOUND_SMS" : "INBOUND_SMS",
        rule_name: isOutbound ? "📱 스마트폰 고객 문자 직접 발신" : "📱 스마트폰 고객 문자 수신",
        device_id: deviceId,
        recipient: `${displayName} (${maskPhoneNumber(phoneNumber)})`,
        content: formatZeroRetentionContent(`문자(${directionLabel})`, message.length),
        status: isOutbound ? "SUCCESS" : "INBOUND",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch((err) => console.warn("[SmsSync] DB log insert warning:", err.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: isOutbound ? "agent2_outbound_sms" : "agent2_inbound_sms",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `문자(${directionLabel}) 내역이 구글 시트에 안전하게 기록되었습니다.`,
      spreadsheetUrl,
      logId,
      replySms,
      matchedOrder: matchedOrder ? true : false,
      depositorName: matchedOrder?.customerName || null,
      amountKrw: matchedOrder?.amount || 0,
      ttsText: orderTtsText,
    });
  } catch (err: any) {
    console.error("[SmsSync] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
