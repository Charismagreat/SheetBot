import { queryTable, insertRows, updateRows } from "./egdesk-helpers";
import { setupDatabase } from "./setup-db";

export interface UserWallet {
  id: string;
  userEmail: string;
  balanceTokens: number;
  totalPurchasedTokens: number;
  totalUsedTokens: number;
  tier: "FREE" | "PRO" | "ENTERPRISE";
}

export interface PaymentPackage {
  id: string;
  name: string;
  priceKrw: number;
  tokens: number;
  bonusTokens: number;
  totalTokens: number;
  tag?: string;
  isPopular?: boolean;
}

// 기본 웰컴 무료 토큰: 20,000 토큰 (약 10회 스크립트 생성 분량)
export const INITIAL_WELCOME_TOKENS = 20000;

// 토큰 결제 패키지 라인업
export const TOKEN_PACKAGES: PaymentPackage[] = [
  {
    id: "pkg_starter",
    name: "Starter (체험형)",
    priceKrw: 5000,
    tokens: 50000,
    bonusTokens: 0,
    totalTokens: 50000,
    tag: "약 25회 생성 가능",
  },
  {
    id: "pkg_standard",
    name: "Standard (인기 추천)",
    priceKrw: 12000,
    tokens: 120000,
    bonusTokens: 30000,
    totalTokens: 150000,
    tag: "+25% 보너스 토큰",
    isPopular: true,
  },
  {
    id: "pkg_pro",
    name: "Pro Automation",
    priceKrw: 30000,
    tokens: 300000,
    bonusTokens: 150000,
    totalTokens: 450000,
    tag: "+50% 대용량 보너스",
  },
];

/**
 * 회원의 토큰 지갑을 조회하거나, 없으면 신규 가입 웰컴 토큰을 지급하여 생성합니다.
 */
export async function getOrCreateUserWallet(userEmail: string): Promise<UserWallet> {
  await setupDatabase();
  const email = userEmail.toLowerCase().trim();

  const res = await queryTable("sheetbot_user_wallets", {
    filters: { user_email: email },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

  if (validRows.length > 0) {
    const row = validRows[0];
    return {
      id: row.id,
      userEmail: row.user_email,
      balanceTokens: Number(row.balance_tokens || 0),
      totalPurchasedTokens: Number(row.total_purchased_tokens || 0),
      totalUsedTokens: Number(row.total_used_tokens || 0),
      tier: row.tier || "FREE",
    };
  }

  // 신규 지갑 생성 (웰컴 무료 토큰 지급)
  const now = new Date().toISOString();
  const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newRow = {
    id: walletId,
    uuid: crypto.randomUUID(),
    user_email: email,
    balance_tokens: INITIAL_WELCOME_TOKENS,
    total_purchased_tokens: 0,
    total_used_tokens: 0,
    tier: "FREE",
    created_at: now,
    updated_at: now,
    updated_by: "system_welcome",
    deleted_at: null,
    deleted_by: null,
    restored_at: null,
    restored_by: null,
  };

  await insertRows("sheetbot_user_wallets", [newRow]);

  return {
    id: walletId,
    userEmail: email,
    balanceTokens: INITIAL_WELCOME_TOKENS,
    totalPurchasedTokens: 0,
    totalUsedTokens: 0,
    tier: "FREE",
  };
}

/**
 * AI 작업 실행 전 잔여 토큰 충분 여부 검증 (Pre-check)
 */
export async function checkTokenBalance(
  userEmail: string,
  requiredTokens: number = 1000
): Promise<{ allowed: boolean; balance: number; reason?: string }> {
  const wallet = await getOrCreateUserWallet(userEmail);

  if (wallet.balanceTokens < requiredTokens) {
    return {
      allowed: false,
      balance: wallet.balanceTokens,
      reason: `잔여 토큰이 부족합니다. (현재: ${wallet.balanceTokens.toLocaleString()} 토큰 / 필요: 약 ${requiredTokens.toLocaleString()} 토큰)`,
    };
  }

  return {
    allowed: true,
    balance: wallet.balanceTokens,
  };
}

/**
 * AI 호출 완료 후 실제 사용된 토큰 차감
 */
export async function deductTokens(
  userEmail: string,
  usedTokens: number
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const wallet = await getOrCreateUserWallet(userEmail);
    const newBalance = Math.max(0, wallet.balanceTokens - usedTokens);
    const newTotalUsed = wallet.totalUsedTokens + usedTokens;
    const now = new Date().toISOString();

    await updateRows(
      "sheetbot_user_wallets",
      {
        balance_tokens: newBalance,
        total_used_tokens: newTotalUsed,
        updated_at: now,
        updated_by: userEmail,
      },
      { filters: { id: wallet.id } }
    );

    return { success: true, newBalance };
  } catch (err: any) {
    console.error("[TokenWallet] Deduct error:", err);
    return { success: false, newBalance: 0 };
  }
}

/**
 * 결제 승인 후 토큰 충전
 */
export async function creditTokens(
  userEmail: string,
  tokensToAdd: number,
  packageName: string,
  amountKrw: number,
  paymentMethod: string = "간편결제/카드"
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const wallet = await getOrCreateUserWallet(userEmail);
    const newBalance = wallet.balanceTokens + tokensToAdd;
    const newPurchased = wallet.totalPurchasedTokens + tokensToAdd;
    const now = new Date().toISOString();

    // 1. 지갑 잔액 갱신
    await updateRows(
      "sheetbot_user_wallets",
      {
        balance_tokens: newBalance,
        total_purchased_tokens: newPurchased,
        tier: "PRO",
        updated_at: now,
        updated_by: userEmail,
      },
      { filters: { id: wallet.id } }
    );

    // 2. 결제 주문 대장 기록
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await insertRows("sheetbot_payment_orders", [
      {
        id: orderId,
        uuid: crypto.randomUUID(),
        order_id: orderId,
        user_email: userEmail.toLowerCase().trim(),
        package_name: packageName,
        amount_krw: amountKrw,
        tokens_credited: tokensToAdd,
        pg_provider: "portone_simulation",
        payment_method: paymentMethod,
        status: "PAID",
        created_at: now,
        updated_at: now,
        updated_by: userEmail,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);

    return { success: true, newBalance };
  } catch (err: any) {
    console.error("[TokenWallet] Credit error:", err);
    throw err;
  }
}
