export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";

/**
 * POST /api/wallet/agent/test-sms
 * 카카오뱅크 입금 SMS 가상 시뮬레이션 및 웹훅 파이프라인 검증 도구
 */
export async function POST(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const body = await req.json().catch(() => ({}));
    const userEmail = body.userEmail || sessionEmail || "chachogreat@gmail.com";
    const amount = Number(body.amount) || 5000;
    const depositor = body.depositor || "테스트입금";

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");

    // 카카오뱅크 통신사 실물 문자 표준 포맷 (인명 제외, 범용 테스트 규격)
    const simulatedSms = `[Web발신]\n[카카오뱅크] 입금알림\n${mm}/${dd} ${hh}:${min} 입금 ${amount.toLocaleString()}원\n테스트입금\n잔액 2,050,439원`;

    // 실제 bank-webhook 로직 직접 호출 (외부 서버 오프라인/503 에러 방지)
    const { POST: handleBankWebhook } = await import("../../bank-webhook/route");
    const webhookReq = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: "1599-3333",
        smsText: simulatedSms,
        userEmail: userEmail,
        isTest: true,
      }),
    });

    const webhookRes = await handleBankWebhook(webhookReq);
    const webhookData = await webhookRes.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      simulatedSms,
      sender: "1599-3333",
      webhookResult: webhookData,
      message: "가상 카카오뱅크 입금 테스트가 성공적으로 전송되었습니다.",
    });
  } catch (err: any) {
    console.error("[Agent-TestSms] error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
