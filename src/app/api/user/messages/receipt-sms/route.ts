export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { recordReceiptSmsToGoogleSheet } from "@/lib/receipt-sms-sync";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * POST /api/user/messages/receipt-sms
 * 스마트폰 시트봇 에이전트에서 고객에게 발송된 영수증 문자를 수신하여
 * 구글 드라이브 [SheetBot] 고객 영수증 문자 발송 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      recipientPhone,
      customerName = "고객",
      amount = 0,
      receiptContent,
      status = "전송 완료",
      deviceId = "SheetBot Agent",
      sheetTitle,
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!recipientPhone || !receiptContent) {
      return NextResponse.json({ success: false, error: "수신 번호와 영수증 내용은 필수입니다." }, { status: 400 });
    }

    const result = await recordReceiptSmsToGoogleSheet({
      userEmail,
      sentTime: getKoreanTimeString(),
      recipientPhone,
      customerName,
      amount: Number(amount) || 0,
      receiptContent,
      status,
      deviceId,
      sheetTitle,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[ReceiptSmsRoute] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
