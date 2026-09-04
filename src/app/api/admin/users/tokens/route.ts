export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getOrCreateUserWallet } from "@/lib/token-wallet";
import { updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { targetEmail, amount, reason } = body;

    if (!targetEmail || typeof amount !== "number" || amount === 0) {
      return NextResponse.json({
        success: false,
        error: "대상 회원 이메일과 0이 아닌 조정 토큰 수량을 입력해 주세요.",
      }, { status: 400 });
    }

    const email = targetEmail.toLowerCase().trim();
    const wallet = await getOrCreateUserWallet(email);
    const newBalance = Math.max(0, wallet.balanceTokens + amount);
    const now = new Date().toISOString();

    // 1. 지갑 잔액 업데이트
    await updateRows("sheetbot_user_wallets", {
      filters: { id: wallet.id },
      updates: {
        balance_tokens: newBalance,
        updated_at: now,
        updated_by: `admin:${adminEmail}`,
      },
    });

    // 2. 관리자 토큰 조정 이력을 결제/주문 대장에 투명하게 기록
    const orderId = `admin_adj_${Date.now()}`;
    const isGrant = amount > 0;
    const packageName = `[관리자 ${isGrant ? "지급" : "차감"}] ${reason ? reason.trim() : "수동 조정"}`;

    await insertRows("sheetbot_payment_orders", [
      {
        id: `ord_${Date.now()}`,
        order_id: orderId,
        user_email: email,
        package_name: packageName,
        amount_krw: 0,
        tokens_credited: amount,
        pg_provider: "ADMIN_CONSOLE",
        payment_method: `관리자(${adminEmail})`,
        status: "PAID",
        created_at: now,
        updated_at: now,
        updated_by: adminEmail,
        deleted_at: null,
      },
    ]).catch((e) => console.warn("Failed to record admin grant order:", e.message));

    return NextResponse.json({
      success: true,
      message: `${email} 회원에게 ${amount > 0 ? "+" : ""}${amount.toLocaleString()} 토큰이 성공적으로 ${amount > 0 ? "지급" : "차감"}되었습니다. (현재 잔액: ${newBalance.toLocaleString()} 토큰)`,
      newBalance,
    });
  } catch (err: any) {
    console.error("[Admin-Users-Tokens-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
