export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  getKakaoMediaUserSettings,
  saveKakaoMediaUserSettings,
} from "@/lib/kakao-media-analyzer";

/**
 * GET /api/user/messages/kakao/settings
 * 카카오톡 첨부파일 AI 자동 요약 및 할 일 자동 연계 설정 조회
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryEmail = (url.searchParams.get("email") || "").trim();
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = (req.headers.get("x-sheetbot-user-email") || "").trim();
    const targetEmail = (sessionEmail || queryEmail || headerEmail).toLowerCase().trim();

    if (!targetEmail || !targetEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const settings = await getKakaoMediaUserSettings(targetEmail);
    return NextResponse.json({
      success: true,
      email: targetEmail,
      ...settings,
    });
  } catch (err: any) {
    console.error("[KakaoSettings GET] 오류:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "설정 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/messages/kakao/settings
 * 카카오톡 첨부파일 AI 자동 요약(aiSummaryEnabled) 및 할 일 자동 연계(autoTaskFromAttachment) ON/OFF 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = (req.headers.get("x-sheetbot-user-email") || "").trim();
    const bodyEmail = String(body?.email || body?.userEmail || "").trim();
    const targetEmail = (sessionEmail || bodyEmail || headerEmail).toLowerCase().trim();

    if (!targetEmail || !targetEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const updated = await saveKakaoMediaUserSettings(targetEmail, {
      aiSummaryEnabled:
        typeof body?.aiSummaryEnabled === "boolean" ? body.aiSummaryEnabled : undefined,
      autoTaskFromAttachment:
        typeof body?.autoTaskFromAttachment === "boolean"
          ? body.autoTaskFromAttachment
          : undefined,
    });

    return NextResponse.json({
      success: true,
      email: targetEmail,
      ...updated,
    });
  } catch (err: any) {
    console.error("[KakaoSettings POST] 오류:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "설정 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
