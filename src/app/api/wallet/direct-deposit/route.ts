export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { TOKEN_PACKAGES, getOrCreateUserWallet } from "@/lib/token-wallet";
import { queryTable, insertRows } from "../../../../../egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { syncAndMatchBankDepositFromPhone } from "@/lib/phone-bank-sync";

// 대표자/운영사 입금 기본 계좌 정보
export const DEFAULT_BANK_INFO = {
  bankName: process.env.SHEETBOT_BANK_NAME || "카카오뱅크",
  accountNumber: process.env.SHEETBOT_ACCOUNT_NUMBER || "3333-12-1695965",
  accountHolder: process.env.SHEETBOT_ACCOUNT_HOLDER || "차호석",
  tossMeId: process.env.SHEETBOT_TOSS_ME_ID || "",
};

export function formatAccountNumber(acc: string): string {
  if (!acc) return "3333-12-1695965";
  const digits = acc.replace(/[^0-9]/g, "");
  if (digits.length === 13 && digits.startsWith("3333")) {
    return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
  }
  return acc;
}

async function getDepositBankInfo() {
  try {
    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_footer_info" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    if (validRows.length > 0 && validRows[0].value) {
      const footer = JSON.parse(validRows[0].value);
      if (footer.deposit_account_number) {
        return {
          bankName: footer.deposit_bank_name || DEFAULT_BANK_INFO.bankName,
          accountNumber: formatAccountNumber(footer.deposit_account_number || DEFAULT_BANK_INFO.accountNumber),
          accountHolder: footer.deposit_account_holder || DEFAULT_BANK_INFO.accountHolder,
          tossMeId: footer.deposit_toss_id || DEFAULT_BANK_INFO.tossMeId,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to load bank info from footer settings:", e);
  }
  return DEFAULT_BANK_INFO;
}

export async function POST(request: Request) {
  try {
    await setupDatabase();
    const body = await request.json();
    const { userEmail, userName, packageId, depositorName } = body;

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "userEmail 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const cleanDepositorName = (depositorName || "").trim();
    if (!cleanDepositorName || cleanDepositorName.length < 2) {
      return NextResponse.json(
        { success: false, error: "실제 송금하실 분의 성함(입금자명)을 2글자 이상 입력해 주세요." },
        { status: 400 }
      );
    }

    const email = userEmail.toLowerCase().trim();
    const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId) || TOKEN_PACKAGES[1];
    const bankInfo = await getDepositBankInfo();

    // 1원 단위 난수 할인 금액 계산 (1~99원 즉시 할인, 충돌 방지)
    // 예: 5,000원 -> 4,987원 (13원 할인)
    let discountKrw = Math.floor(1 + Math.random() * 99);
    let finalAmountKrw = pkg.priceKrw - discountKrw;

    // 최근 30분 내 동일한 PENDING 금액이 있는지 확인하여 중복 방지
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const checkRes = await queryTable("sheetbot_deposit_requests", {
          filters: { status: "PENDING", amount_krw: finalAmountKrw },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        if (!checkRes.rows || checkRes.rows.length === 0) break;
        // 중복인 경우 다른 난수로 재시도
        discountKrw = Math.floor(1 + Math.random() * 99);
        finalAmountKrw = pkg.priceKrw - discountKrw;
      }
    } catch (e) {
      console.warn("[Direct-Deposit] Collision check warning:", e);
    }

    // 입금 식별 코드 생성 (성명 첫글자 + 3자리 난수)
    const cleanChars = (cleanDepositorName || userName || email.split("@")[0] || "S").replace(/[^a-zA-Z0-9가-힣]/g, "");
    const initialChar = cleanChars ? cleanChars.charAt(0).toUpperCase() : "S";
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const depositCode = initialChar + randomSuffix;

    const requestId = "dep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const tossUrl = bankInfo.tossMeId
      ? "https://toss.me/" + bankInfo.tossMeId + "/" + finalAmountKrw
      : "";

    const qrPayload = tossUrl || (bankInfo.bankName + " " + bankInfo.accountNumber + " " + finalAmountKrw + "원 (입금자: " + cleanDepositorName + ")");
    const qrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrPayload);

    await insertRows("sheetbot_deposit_requests", [
      {
        id: requestId,
        deposit_code: depositCode,
        depositor_name: cleanDepositorName,
        user_email: email,
        user_name: userName || email.split("@")[0],
        package_id: pkg.id,
        package_name: pkg.name,
        original_amount_krw: pkg.priceKrw,
        discount_krw: discountKrw,
        amount_krw: finalAmountKrw,
        tokens_to_credit: pkg.totalTokens,
        bank_name: bankInfo.bankName,
        account_number: bankInfo.accountNumber,
        account_holder: bankInfo.accountHolder || DEFAULT_BANK_INFO.accountHolder,
        status: "PENDING",
        expires_at: expiresAt,
        completed_at: null,
        created_at: now.toISOString(),
      },
    ]);

    const wallet = await getOrCreateUserWallet(email);

    return NextResponse.json({
      success: true,
      requestId,
      depositCode,
      depositorName: cleanDepositorName,
      originalAmountKrw: pkg.priceKrw,
      originalPriceKrw: pkg.priceKrw,
      discountKrw,
      amountKrw: finalAmountKrw,
      finalAmountKrw: finalAmountKrw,
      finalPriceKrw: finalAmountKrw,
      package: {
        ...pkg,
        priceKrw: finalAmountKrw,
        originalPriceKrw: pkg.priceKrw,
      },
      bank: {
        bankName: bankInfo.bankName,
        accountNumber: formatAccountNumber(bankInfo.accountNumber),
        accountHolder: bankInfo.accountHolder || DEFAULT_BANK_INFO.accountHolder,
      },
      tossUrl,
      qrImageUrl,
      currentBalance: wallet.balanceTokens,
      expiresAt,
    });
  } catch (err: any) {
    console.error("[Direct-Deposit-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const userEmail = searchParams.get("userEmail");

    if (!requestId && !userEmail) {
      return NextResponse.json(
        { success: false, error: "requestId 또는 userEmail이 필요합니다." },
        { status: 400 }
      );
    }

    const filters: Record<string, any> = {};
    if (requestId) filters.id = requestId;
    if (userEmail) filters.user_email = userEmail.toLowerCase().trim();

    const res = await queryTable("sheetbot_deposit_requests", {
      filters,
      limit: 1,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    let reqRow: any = (res.rows || [])[0];
    if (!reqRow) {
      return NextResponse.json({ success: false, error: "입금 요청 세션을 찾을 수 없습니다." }, { status: 404 });
    }

    // 📲 구글 메시지 2중 안전망: 아직 PENDING 상태인 경우 스마트폰(구글 메시지)에서 최신 입금 SMS 즉시 동기화 검사
    if (reqRow.status === "PENDING") {
      try {
        const syncResult = await syncAndMatchBankDepositFromPhone(reqRow.id);
        if (syncResult.matched) {
          // 상태 최신 갱신
          const refreshed = await queryTable("sheetbot_deposit_requests", {
            filters: { id: reqRow.id },
            limit: 1,
          }).catch(() => ({ rows: [] }));
          if (refreshed.rows && refreshed.rows[0]) {
            reqRow = refreshed.rows[0];
          }
        }
      } catch (syncErr: any) {
        console.warn("[Direct-Deposit-GET] Phone SMS sync warning:", syncErr.message);
      }
    }

    const wallet = await getOrCreateUserWallet(reqRow.user_email);

    return NextResponse.json(
      {
        success: true,
        requestId: reqRow.id,
        status: reqRow.status,
        depositCode: reqRow.deposit_code,
        amountKrw: reqRow.amount_krw,
        tokensToCredit: reqRow.tokens_to_credit,
        completedAt: reqRow.completed_at,
        currentBalance: wallet.balanceTokens,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[Direct-Deposit-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
