export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getReferralStats, getUserReferralCode } from "@/lib/token-wallet";

/**
 * GET /api/wallet/referral?userEmail={email}
 * 회원의 고유 추천 코드, 초대 링크, 추천 통계 조회
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get("userEmail");

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "userEmail 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const stats = await getReferralStats(userEmail);
    const inviteUrl = `https://sheetbot.cloud/?ref=${stats.myCode}`;
    const apkInviteUrl = `https://sheetbot.cloud/downloads/SheetBotAgent.apk?ref=${stats.myCode}`;

    const shareText = `🚀 Google 스프레드시트 1초 AI 자동화 [SheetBot]\n` +
      `초대 링크로 앱을 설치하거나 연동하시면 가입 즉시 10,000 보너스 토큰이 선물됩니다 🎁\n\n` +
      `• 초대 링크: ${inviteUrl}\n` +
      `• 추천인 코드: ${stats.myCode}`;

    return NextResponse.json(
      {
        success: true,
        userEmail,
        myCode: stats.myCode,
        inviteUrl,
        apkInviteUrl,
        shareText,
        inviteCount: stats.inviteCount,
        earnedTokens: stats.earnedTokens,
        hasClaimedReward: stats.hasClaimedReward,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[Referral-GET-API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
