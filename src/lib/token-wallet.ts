import { queryTable, insertRows, updateRows } from "./egdesk-helpers";
import { setupDatabase } from "./setup-db";
import { getOrCreateUserApiKey } from "./api-keys";
import { fetchWithCache, invalidateServerCache } from "./server-cache";

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
 * (10초 인메모리 캐시 & In-flight Deduplication 적용으로 0ms 즉각 반환)
 */
export async function getOrCreateUserWallet(userEmail: string): Promise<UserWallet> {
  const email = userEmail.toLowerCase().trim();

  return fetchWithCache(
    `user_wallet_${email}`,
    async () => {
      // 터널 지연 상황에서도 실제 지갑(240만 토큰, PRO)을 안전하게 조회 (조급한 2초 타임아웃으로 인한 2만 토큰 오인식 원천 차단)
      const res = await queryTable("sheetbot_user_wallets", {
        filters: { user_email: email },
        limit: 10,
      }).catch((err) => {
        console.warn("[Wallet] queryTable error:", err);
        return { rows: [] };
      });
      const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

      if (validRows.length > 0) {
        // 잔액이 가장 크고 유효한 지갑을 메인으로 선택 (PRO 우선)
        validRows.sort((a: any, b: any) => {
          const balA = Number(a.balance_tokens) || 0;
          const balB = Number(b.balance_tokens) || 0;
          if (balB !== balA) return balB - balA;
          if (a.tier === "PRO" && b.tier !== "PRO") return -1;
          if (b.tier === "PRO" && a.tier !== "PRO") return 1;
          return String(b.id || "").localeCompare(String(a.id || ""));
        });

        const mainWallet = validRows[0];

        // ⚡ 중복 지갑 정리는 사용자 응답을 블로킹하지 않고 백그라운드 비동기 처리
        if (validRows.length > 1) {
          void (async () => {
            try {
              let extraBalance = 0;
              let extraPurchased = 0;
              let extraUsed = 0;
              const nowStr = new Date().toISOString();

              for (let i = 1; i < validRows.length; i++) {
                const dup = validRows[i];
                extraBalance += Number(dup.balance_tokens || 0);
                extraPurchased += Number(dup.total_purchased_tokens || 0);
                extraUsed += Number(dup.total_used_tokens || 0);

                await updateRows(
                  "sheetbot_user_wallets",
                  {
                    deleted_at: nowStr,
                    deleted_by: "system_wallet_consolidation",
                    updated_at: nowStr,
                  },
                  { filters: { id: String(dup.id) } }
                ).catch(() => {});
              }

              if (extraBalance > 0 || extraPurchased > 0) {
                const newBal = (Number(mainWallet.balance_tokens) || 0) + extraBalance;
                const newPurchased = (Number(mainWallet.total_purchased_tokens) || 0) + extraPurchased;
                const newUsed = (Number(mainWallet.total_used_tokens) || 0) + extraUsed;

                await updateRows(
                  "sheetbot_user_wallets",
                  {
                    balance_tokens: newBal,
                    total_purchased_tokens: newPurchased,
                    total_used_tokens: newUsed,
                    updated_at: nowStr,
                    updated_by: "system_wallet_consolidation",
                  },
                  { filters: { id: String(mainWallet.id) } }
                ).catch(() => {});
              }
            } catch (consolidationErr) {
              console.warn("[Wallet] Background consolidation note:", consolidationErr);
            }
          })();
        }

        return {
          id: mainWallet.id,
          userEmail: mainWallet.user_email,
          balanceTokens: Number(mainWallet.balance_tokens || 0),
          totalPurchasedTokens: Number(mainWallet.total_purchased_tokens || 0),
          totalUsedTokens: Number(mainWallet.total_used_tokens || 0),
          tier: mainWallet.tier || "FREE",
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

      // 신규 지갑 DB 저장 (2초 타임아웃 레이스)
      const insertTimeout = new Promise((resolve) => setTimeout(resolve, 2000));
      await Promise.race([
        insertRows("sheetbot_user_wallets", [newRow]).catch(() => {}),
        insertTimeout,
      ]);

      // 회원가입 시 개인 API 키 자동 발급은 백그라운드 비동기로 위임하여 응답 지연 방지
      void getOrCreateUserApiKey(email).catch((err) =>
        console.warn("[Token-Wallet] Auto-provision API key warning:", err.message)
      );

      return {
        id: walletId,
        userEmail: email,
        balanceTokens: INITIAL_WELCOME_TOKENS,
        totalPurchasedTokens: 0,
        totalUsedTokens: 0,
        tier: "FREE",
      };
    },
    10 // 10초 TTL
  );
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
    const isOverdraft = wallet.balanceTokens < 0;
    const reasonMsg = isOverdraft
      ? `잔여 토큰이 부족합니다. (현재 미정산 초과 사용분: ${wallet.balanceTokens.toLocaleString()} 토큰 / 필요: 약 ${requiredTokens.toLocaleString()} 토큰). 충전 시 초과 사용분이 자동 상계 정산됩니다.`
      : `잔여 토큰이 부족합니다. (현재: ${wallet.balanceTokens.toLocaleString()} 토큰 / 필요: 약 ${requiredTokens.toLocaleString()} 토큰).`;

    return {
      allowed: false,
      balance: wallet.balanceTokens,
      reason: reasonMsg,
    };
  }

  return {
    allowed: true,
    balance: wallet.balanceTokens,
  };
}

/**
 * AI 호출 완료 후 실제 사용된 토큰 차감 (마이너스 잔액 허용 및 차기 충전 시 자동 상계)
 */
export async function deductTokens(
  userEmail: string,
  usedTokens: number
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const wallet = await getOrCreateUserWallet(userEmail);
    // 초과 사용 시 마이너스(-) 잔액을 그대로 기록하여 다음 충전 시 정산
    const newBalance = wallet.balanceTokens - usedTokens;
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

/**
 * 친구/동료 초대 양방향 보너스 토큰 규격 (각각 1만 토큰)
 */
export const REFERRAL_REWARD_TOKENS = 10000;

/**
 * 회원의 고유 추천 코드 생성 (이메일 앞자리 기반 + 4자리 고유 해시)
 */
export function getUserReferralCode(userEmail: string): string {
  const clean = userEmail.toLowerCase().trim();
  const prefix = clean.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "SHEET";
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const suffix = Math.abs(hash).toString(36).toUpperCase().padStart(4, "0").slice(0, 4);
  return `${prefix}${suffix}`;
}

/**
 * 추천 코드 또는 이메일로 초대한 회원 이메일 역추적
 */
export async function findUserEmailByReferralCode(codeOrEmail: string): Promise<string | null> {
  const query = codeOrEmail.trim().toLowerCase();
  if (query.includes("@")) {
    return query;
  }

  // 1. 이메일 앞자리 또는 추천 코드가 일치하는 지갑 탐색
  const walletsRes = await queryTable("sheetbot_user_wallets", { limit: 500 }).catch(() => ({ rows: [] }));
  const rows = (walletsRes.rows || []).filter((r: any) => !r.deleted_at);

  for (const row of rows) {
    const email = String(row.user_email || "").toLowerCase().trim();
    if (!email) continue;
    const myCode = getUserReferralCode(email).toLowerCase();
    const myPrefix = email.split("@")[0].toLowerCase();
    if (query === myCode || query === myPrefix) {
      return email;
    }
  }

  return null;
}

/**
 * 친구/동료 초대 보너스 정산 트랜잭션 (양방향 각각 1만 토큰 즉시 적립)
 */
export async function processReferralReward(options: {
  inviterCodeOrEmail: string;
  inviteeEmail: string;
  deviceId?: string;
  ipAddress?: string;
  channel?: "MOBILE_AGENT" | "SHEET_COPILOT" | "WEB_INVITE";
}): Promise<{
  success: boolean;
  message: string;
  rewardTokens: number;
  inviterEmail?: string;
  error?: string;
}> {
  try {
    await setupDatabase();
    const { inviterCodeOrEmail, inviteeEmail, deviceId, ipAddress, channel = "MOBILE_AGENT" } = options;
    const cleanInvitee = inviteeEmail.toLowerCase().trim();

    if (!cleanInvitee || !cleanInvitee.includes("@")) {
      return { success: false, rewardTokens: 0, message: "유효한 가입자 이메일이 아닙니다.", error: "INVALID_EMAIL" };
    }

    if (!inviterCodeOrEmail || inviterCodeOrEmail.trim().length < 2) {
      return { success: false, rewardTokens: 0, message: "추천인 코드 또는 이메일을 입력해 주세요.", error: "INVALID_CODE" };
    }

    // 1. 추천인 이메일 탐색
    const inviterEmail = await findUserEmailByReferralCode(inviterCodeOrEmail);
    if (!inviterEmail) {
      return { success: false, rewardTokens: 0, message: "존재하지 않거나 유효하지 않은 추천인 코드입니다.", error: "INVITER_NOT_FOUND" };
    }

    // 2. 셀프 추천 차단
    if (inviterEmail.toLowerCase() === cleanInvitee) {
      return { success: false, rewardTokens: 0, message: "본인의 추천 코드는 직접 등록할 수 없습니다.", error: "SELF_REFERRAL_FORBIDDEN" };
    }

    // 3. 중복 수급 방지 (이미 추천 보상을 받은 적이 있는지 검증)
    const existingRefRes = await queryTable("sheetbot_referrals", {
      filters: { invitee_email: cleanInvitee },
      limit: 1,
    }).catch(() => ({ rows: [] }));
    const existingRefs = (existingRefRes.rows || []).filter((r: any) => !r.deleted_at);

    if (existingRefs.length > 0) {
      return {
        success: false,
        rewardTokens: 0,
        message: "이미 친구 초대 보너스를 수령한 계정입니다. (1인 1회 한정)",
        error: "ALREADY_CLAIMED",
      };
    }

    // 4. 기기 다중 계정 어뷰징 차단 (동일 스마트폰에서 다계정 수급 방지)
    if (deviceId && deviceId.trim().length > 3) {
      const deviceCheck = await queryTable("sheetbot_referrals", {
        filters: { device_id: deviceId.trim() },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      const deviceRefs = (deviceCheck.rows || []).filter((r: any) => !r.deleted_at);
      if (deviceRefs.length > 0) {
        return {
          success: false,
          rewardTokens: 0,
          message: "해당 기기에서 이미 초대 보너스가 지급되었습니다.",
          error: "DEVICE_ALREADY_USED",
        };
      }
    }

    const now = new Date().toISOString();
    const numericId = Date.now();

    // 5. 추천인 지갑에 1만 토큰 지급
    const inviterWallet = await getOrCreateUserWallet(inviterEmail);
    const newInviterBalance = inviterWallet.balanceTokens + REFERRAL_REWARD_TOKENS;
    await updateRows(
      "sheetbot_user_wallets",
      {
        balance_tokens: newInviterBalance,
        total_purchased_tokens: inviterWallet.totalPurchasedTokens + REFERRAL_REWARD_TOKENS,
        updated_at: now,
        updated_by: "system_referral_reward",
      },
      { filters: { id: inviterWallet.id } }
    );
    invalidateServerCache(`user_wallet_${inviterEmail.toLowerCase()}`);

    // 6. 가입자(피초대자) 지갑에 1만 토큰 지급
    const inviteeWallet = await getOrCreateUserWallet(cleanInvitee);
    const newInviteeBalance = inviteeWallet.balanceTokens + REFERRAL_REWARD_TOKENS;
    await updateRows(
      "sheetbot_user_wallets",
      {
        balance_tokens: newInviteeBalance,
        total_purchased_tokens: inviteeWallet.totalPurchasedTokens + REFERRAL_REWARD_TOKENS,
        updated_at: now,
        updated_by: "system_referral_reward",
      },
      { filters: { id: inviteeWallet.id } }
    );
    invalidateServerCache(`user_wallet_${cleanInvitee}`);

    // 7. 추천 대장에 기록
    await insertRows("sheetbot_referrals", [
      {
        id: numericId,
        uuid: `ref_${numericId}`,
        inviter_email: inviterEmail,
        inviter_code: getUserReferralCode(inviterEmail),
        invitee_email: cleanInvitee,
        reward_tokens: REFERRAL_REWARD_TOKENS,
        device_id: deviceId || null,
        ip_address: ipAddress || null,
        channel,
        status: "COMPLETED",
        created_at: now,
      },
    ]);

    console.log(`[Referral] 🎉 양방향 10,000 토큰 지급 완료: 초대한 분(${inviterEmail}) + 신규 가입(${cleanInvitee})`);

    return {
      success: true,
      message: `🎉 친구 초대 보너스 10,000 토큰이 즉시 충전되었습니다! (초대한 분: ${inviterEmail})`,
      rewardTokens: REFERRAL_REWARD_TOKENS,
      inviterEmail,
    };
  } catch (err: any) {
    console.error("[Referral] Process error:", err);
    return { success: false, rewardTokens: 0, message: "초대 보너스 정산 중 오류가 발생했습니다: " + err.message, error: err.message };
  }
}

/**
 * 회원의 초대 실적 및 통계 조회
 */
export async function getReferralStats(userEmail: string): Promise<{
  myCode: string;
  inviteCount: number;
  earnedTokens: number;
  hasClaimedReward: boolean;
}> {
  try {
    await setupDatabase();
    const email = userEmail.toLowerCase().trim();
    const myCode = getUserReferralCode(email);

    // 내가 초대한 실적
    const inviteRes = await queryTable("sheetbot_referrals", {
      filters: { inviter_email: email },
      limit: 500,
    }).catch(() => ({ rows: [] }));
    const inviteRows = (inviteRes.rows || []).filter((r: any) => !r.deleted_at);

    // 내가 다른 사람의 초대를 받아 보상을 받았는지 여부
    const claimedRes = await queryTable("sheetbot_referrals", {
      filters: { invitee_email: email },
      limit: 1,
    }).catch(() => ({ rows: [] }));
    const claimedRows = (claimedRes.rows || []).filter((r: any) => !r.deleted_at);

    return {
      myCode,
      inviteCount: inviteRows.length,
      earnedTokens: inviteRows.length * REFERRAL_REWARD_TOKENS,
      hasClaimedReward: claimedRows.length > 0,
    };
  } catch (e: any) {
    return {
      myCode: getUserReferralCode(userEmail),
      inviteCount: 0,
      earnedTokens: 0,
      hasClaimedReward: false,
    };
  }
}

