export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrCreateUserWallet } from "@/lib/token-wallet";

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

    const wallet = await getOrCreateUserWallet(userEmail);

    return NextResponse.json(
      {
        success: true,
        userEmail: wallet.userEmail,
        balanceTokens: wallet.balanceTokens,
        tier: wallet.tier,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[Balance-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
