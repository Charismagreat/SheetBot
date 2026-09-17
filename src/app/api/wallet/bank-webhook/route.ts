export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable, updateRows } from "../../../../../egdesk-helpers";
import { creditTokens } from "@/lib/token-wallet";
import { executeSmartDispatchRules } from "@/lib/smart-dispatch-rules";
import { setupDatabase } from "@/lib/setup-db";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";

/**
 * POST /api/wallet/bank-webhook
 * 스마트폰 은행 입금 알림(토스, 카카오뱅크 등)을 수신하거나, 수동 확인 시 입금을 매칭하여 토큰을 즉시 지급합니다.
 * Body: { depositorName: string, amountKrw: number, bankName?: string, secretKey?: string }
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const body = await request.json();
    let { depositorName, amountKrw, bankName, requestId } = body;

    // 스마트폰 전달 앱에서 본문 텍스트 통째로 넘어온 경우 (smsText, text, content, message 등)
    const rawSms = body.smsText || body.text || body.content || body.message || body.msg || depositorName || "";
    if (typeof rawSms === "string" && rawSms.length > 5) {
      const parsed = parseBankDepositSms(rawSms);
      if (parsed.success) {
        if (!amountKrw || Number(amountKrw) <= 0) {
          amountKrw = parsed.amountKrw;
        }
        if (!depositorName || depositorName === rawSms) {
          depositorName = parsed.depositCode;
        }
        if (!bankName || bankName === "자동감지") {
          bankName = parsed.bankName;
        }
      }
    }

    if (!depositorName || !amountKrw) {
      return NextResponse.json(
        { success: false, error: "depositorName과 amountKrw(또는 은행 입금 SMS 문자 본문)가 필요합니다." },
        { status: 400 }
      );
    }

    const cleanDepositor = depositorName.replace(/\s+/g, "").trim();
    const cleanAmount = Number(amountKrw);

    // 1. PENDING 상태인 입금 요청 대장 조회
    const filters: Record<string, any> = { status: "PENDING" };
    if (requestId) filters.id = requestId;

    const res = await queryTable("sheetbot_deposit_requests", {
      filters,
      limit: 50,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const pendingRequests = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 입금자명 및 금액 매칭 탐색
    // 입금자명에 deposit_code가 포함되어 있거나, 일치하는 경우
    const matched: any = pendingRequests.find((req: any) => {
      const code = (req.deposit_code || "").replace(/\s+/g, "").trim();
      const amount = Number(req.amount_krw);
      const isAmountMatch = amount === cleanAmount;
      const isNameMatch =
        cleanDepositor.includes(code) ||
        code.includes(cleanDepositor) ||
        cleanDepositor === (req.user_name || "").replace(/\s+/g, "");

      return isAmountMatch && isNameMatch;
    });

    if (!matched) {
      return NextResponse.json({
        success: false,
        message: "일치하는 입금 대기 세션을 찾지 못했습니다. 입금자명과 금액을 확인해 주세요.",
        depositorName: cleanDepositor,
        amountKrw: cleanAmount,
      });
    }

    // 3. 토큰 지갑 충전 실행
    const now = new Date().toISOString();
    const creditRes = await creditTokens(
      matched.user_email,
      matched.tokens_to_credit,
      matched.package_name,
      matched.amount_krw,
      "다이렉트 송금 (0원 수수료 / " + (bankName || "은행") + ")"
    );

    // 4. 요청 세션 상태를 COMPLETED로 업데이트
    await updateRows(
      "sheetbot_deposit_requests",
      {
        status: "COMPLETED",
        completed_at: now,
        updated_at: now,
        updated_by: "system_bank_webhook",
      },
      { filters: { id: matched.id } }
    );

    // 5. 관리자 및 고객 알림 발송 (문자/이메일)
    executeSmartDispatchRules("payment", {
      userEmail: matched.user_email,
      title: matched.package_name + " (다이렉트 송금)",
      amount: matched.amount_krw,
    }).catch((err) => console.warn("[Bank-Webhook] Dispatch error:", err));

    return NextResponse.json({
      success: true,
      message: matched.user_email + "님께 " + matched.tokens_to_credit.toLocaleString() + " 토큰이 즉시 충전되었습니다!",
      requestId: matched.id,
      userEmail: matched.user_email,
      creditedTokens: matched.tokens_to_credit,
      newBalance: creditRes.newBalance,
    });
  } catch (err: any) {
    console.error("[Bank-Webhook-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
