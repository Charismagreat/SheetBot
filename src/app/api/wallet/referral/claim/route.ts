export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { processReferralReward } from "@/lib/token-wallet";

/**
 * POST /api/wallet/referral/claim
 * 친구/동료 초대 코드 등록 및 양방향 1만 토큰 지급
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inviteeEmail, referralCode, deviceId, channel } = body;

    if (!inviteeEmail) {
      return NextResponse.json(
        { success: false, error: "inviteeEmail 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    if (!referralCode) {
      return NextResponse.json(
        { success: false, error: "referralCode 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";

    const result = await processReferralReward({
      inviterCodeOrEmail: referralCode,
      inviteeEmail,
      deviceId,
      ipAddress,
      channel: channel || "MOBILE_AGENT",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        rewardTokens: result.rewardTokens,
        inviterEmail: result.inviterEmail,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[Referral-Claim-API] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
