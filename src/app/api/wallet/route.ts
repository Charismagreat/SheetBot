export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  getOrCreateUserWallet,
  creditTokens,
  TOKEN_PACKAGES,
} from "@/lib/token-wallet";
import { queryTable } from "@/lib/egdesk-helpers";

export async function GET() {
  try {
    const userEmail = await getCurrentUserEmail();
    
    // 로그인된 회원이면 실제 DB 지갑 조회, 미로그인이면 기본 안내용 웰컴 지갑 제공
    let wallet = {
      balanceTokens: 20000,
      totalPurchasedTokens: 0,
      totalUsedTokens: 0,
      tier: "FREE",
    };
    let validOrders: any[] = [];

    if (userEmail) {
      const userWallet = await getOrCreateUserWallet(userEmail);
      wallet = userWallet;

      // 최근 충전 결제 내역 조회 (최근 10건)
      const ordersRes = await queryTable("sheetbot_payment_orders", {
        filters: { user_email: userEmail.toLowerCase().trim() },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 10,
      }).catch(() => ({ rows: [] }));

      validOrders = (ordersRes.rows || []).filter((r: any) => !r.deleted_at);
    }

    return NextResponse.json({
      success: true,
      isLoggedIn: !!userEmail,
      wallet,
      packages: TOKEN_PACKAGES,
      orders: validOrders,
    });
  } catch (err: any) {
    console.error("[Wallet-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 토큰 패키지 결제 충전 처리
export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { packageId, paymentMethod } = body;

    const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ success: false, error: "유효하지 않은 충전 패키지입니다." }, { status: 400 });
    }

    // 결제 승인 및 토큰 지갑 충전
    const res = await creditTokens(
      userEmail,
      pkg.totalTokens,
      pkg.name,
      pkg.priceKrw,
      paymentMethod || "카드 간편결제"
    );

    return NextResponse.json({
      success: true,
      message: `${pkg.name} 결제가 완료되어 ${pkg.totalTokens.toLocaleString()} 토큰이 성공적으로 충전되었습니다!`,
      newBalance: res.newBalance,
    });
  } catch (err: any) {
    console.error("[Wallet-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
