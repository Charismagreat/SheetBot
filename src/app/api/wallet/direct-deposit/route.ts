export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { TOKEN_PACKAGES, getOrCreateUserWallet } from "@/lib/token-wallet";
import { queryTable, insertRows } from "../../../../../egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

// 대표자/운영사 입금 기본 계좌 정보
export const DEFAULT_BANK_INFO = {
  bankName: process.env.SHEETBOT_BANK_NAME || "카카오뱅크",
  accountNumber: process.env.SHEETBOT_ACCOUNT_NUMBER || "3333-28-9876543",
  accountHolder: process.env.SHEETBOT_ACCOUNT_HOLDER || "시트봇",
  tossMeId: process.env.SHEETBOT_TOSS_ME_ID || "sheetbot",
};

export async function POST(request: Request) {
  try {
    await setupDatabase();
    const body = await request.json();
    const { userEmail, userName, packageId } = body;

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "userEmail 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const email = userEmail.toLowerCase().trim();
    const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId) || TOKEN_PACKAGES[1];

    // 첫 글자 대문자 1자리 + 3자리 숫자 (예: charisma -> C670, 홍길동 -> 홍670)
    const cleanChars = (userName || email.split("@")[0] || "S").replace(/[^a-zA-Z0-9가-힣]/g, "");
    const initialChar = cleanChars ? cleanChars.charAt(0).toUpperCase() : "S";
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const depositCode = initialChar + randomSuffix;

    const requestId = "dep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    const tossUrl = DEFAULT_BANK_INFO.tossMeId
      ? "https://toss.me/" + DEFAULT_BANK_INFO.tossMeId + "/" + pkg.priceKrw
      : "";

    const qrPayload = tossUrl || (DEFAULT_BANK_INFO.bankName + " " + DEFAULT_BANK_INFO.accountNumber + " " + pkg.priceKrw + "원 (입금자: " + depositCode + ")");
    const qrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(qrPayload);

    await insertRows("sheetbot_deposit_requests", [
      {
        id: requestId,
        deposit_code: depositCode,
        user_email: email,
        user_name: userName || email.split("@")[0],
        package_id: pkg.id,
        package_name: pkg.name,
        amount_krw: pkg.priceKrw,
        tokens_to_credit: pkg.totalTokens,
        bank_name: DEFAULT_BANK_INFO.bankName,
        account_number: DEFAULT_BANK_INFO.accountNumber,
        account_holder: DEFAULT_BANK_INFO.accountHolder,
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
      package: pkg,
      bank: {
        bankName: DEFAULT_BANK_INFO.bankName,
        accountNumber: DEFAULT_BANK_INFO.accountNumber,
        accountHolder: DEFAULT_BANK_INFO.accountHolder,
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

    const reqRow: any = (res.rows || [])[0];
    if (!reqRow) {
      return NextResponse.json({ success: false, error: "입금 요청 세션을 찾을 수 없습니다." }, { status: 404 });
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
