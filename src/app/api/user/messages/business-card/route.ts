export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { recordBusinessCardToGoogleSheet } from "@/lib/business-card-sync";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * POST /api/user/messages/business-card
 * 스마트폰 시트봇 에이전트(PhoneCallReceiver)에서 통화 종료 후 모바일 명함이 발송되었을 때
 * 구글 드라이브 [SheetBot] 모바일 명함 발송 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      recipientPhone,
      contactName,
      sendMode = "스마트 웹 명함(0원)",
      cardContentOrUrl,
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
    if (!recipientPhone || !cardContentOrUrl) {
      return NextResponse.json({ success: false, error: "수신 번호와 명함 내용은 필수입니다." }, { status: 400 });
    }

    const result = await recordBusinessCardToGoogleSheet({
      userEmail,
      sentTime: getKoreanTimeString(),
      recipientPhone,
      contactName,
      sendMode,
      cardContentOrUrl,
      status,
      deviceId,
      sheetTitle,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[BusinessCardRoute] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
