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
    
    // 스마트폰(MacroDroid 등)에서 줄바꿈이 포함된 비표준 JSON이 오더라도 안전하게 수용
    let body: any = {};
    const rawText = await request.text();
    
    if (rawText && rawText.trim()) {
      try {
        body = JSON.parse(rawText);
      } catch {
        try {
          // JSON 문자열 내부의 실제 줄바꿈을 정규식으로 안전 추출
          const smsMatch = rawText.match(/"(?:smsText|text|content|message|msg)"\s*:\s*"([\s\S]*?)"\s*}/);
          if (smsMatch) {
            body = { smsText: smsMatch[1] };
          } else {
            const sanitized = rawText.replace(/[\r\n]+/g, " ");
            body = JSON.parse(sanitized);
          }
        } catch {
          // JSON 형식이 아닌 일반 텍스트로 들어온 경우 본문 자체를 SMS 텍스트로 인식
          body = { smsText: rawText };
        }
      }
    }

    let { depositorName, amountKrw, bankName, requestId } = body || {};

    // 스마트폰 전달 앱에서 본문 텍스트 통째로 넘어온 경우 (smsText, text, content, message 등)
    const rawSms = body?.smsText || body?.text || body?.content || body?.message || body?.msg || depositorName || "";
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
    // 1순위: 금액 일치 AND (실제 입금자명 / 입금코드 / 사용자명 매칭)
    let matched: any = pendingRequests.find((req: any) => {
      const amount = Number(req.amount_krw);
      if (amount !== cleanAmount) return false;

      const code = (req.deposit_code || "").replace(/\s+/g, "").trim().toLowerCase();
      const depositor = (req.depositor_name || "").replace(/\s+/g, "").trim().toLowerCase();
      const userName = (req.user_name || "").replace(/\s+/g, "").trim().toLowerCase();
      const target = cleanDepositor.toLowerCase();

      const isNameMatch =
        (depositor && (target.includes(depositor) || depositor.includes(target))) ||
        (code && (target.includes(code) || code.includes(target))) ||
        (userName && (target.includes(userName) || userName.includes(target)));

      return isNameMatch;
    });

    // 2순위: 1원 단위 고유 단수 금액(예: 4,987원) 안전망 폴백
    // 100원 단위가 아닌 1원 단위 특수 금액인 경우, 최근 PENDING 요청 중 해당 금액이 단 1건뿐이면 자동 승인
    if (!matched && cleanAmount % 100 !== 0) {
      const candidateByAmount = pendingRequests.filter(
        (req: any) => Number(req.amount_krw) === cleanAmount
      );
      if (candidateByAmount.length === 1) {
        matched = candidateByAmount[0];
        console.log(
          `[Bank-Webhook] 1원 단위 고유 금액(${cleanAmount}원) 단일 요청자 자동 매칭 성공: ${matched.user_email}`
        );
      }
    }

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
