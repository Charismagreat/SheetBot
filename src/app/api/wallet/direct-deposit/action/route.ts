export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { creditTokens } from "@/lib/token-wallet";
import { setupDatabase } from "@/lib/setup-db";
import { executeSmartDispatchRules } from "@/lib/smart-dispatch-rules";

/**
 * POST /api/wallet/direct-deposit/action
 * 관리자 전용: 보류(ON_HOLD), 충돌(COLLISION_HOLD), 지연(DELAYED_MATCH) 입금건에 대한 원클릭 수동 승인 또는 취소/환불
 * Body: { id: string | number, action: "APPROVE" | "REJECT", customAmount?: number, reason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail(req);
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, action, customAmount, reason } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: "id와 action(APPROVE/REJECT)이 필요합니다." }, { status: 400 });
    }

    // 1. 해당 입금 요청 레코드 조회
    const res = await queryTable("sheetbot_deposit_requests", {
      filters: { id: String(id) },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const requestRow = (res.rows || []).find((r: any) => !r.deleted_at);
    if (!requestRow) {
      return NextResponse.json({ success: false, error: "해당 입금 요청건을 찾을 수 없습니다." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    if (action === "APPROVE") {
      // 실제 충전할 금액 결정: 커스텀 지정액 > 실제 입금액(actual_amount_krw) > 최초 신청액(amount_krw)
      const finalAmount = Number(customAmount || requestRow.actual_amount_krw || requestRow.amount_krw);
      
      // 토큰 비율 계산 (원래 신청 패키지 비율 유지)
      const originalAmount = Number(requestRow.amount_krw) || 1;
      const originalTokens = Number(requestRow.tokens_to_credit) || 0;
      const tokenRatio = originalTokens / originalAmount;
      const finalTokens = Math.round(finalAmount * tokenRatio);

      // 토큰 지급 실행
      const creditRes = await creditTokens(
        requestRow.user_email,
        finalTokens,
        `${requestRow.package_name || "패키지"} (관리자 수동 승인)`,
        finalAmount,
        `관리자 수동 입금 확인 (${adminEmail})`
      );

      // 대장 상태를 COMPLETED로 갱신
      await updateRows(
        "sheetbot_deposit_requests",
        {
          status: "COMPLETED",
          actual_amount_krw: finalAmount,
          tokens_to_credit: finalTokens,
          completed_at: nowIso,
          updated_at: nowIso,
          updated_by: `admin:${adminEmail}`,
          hold_reason: `관리자(${adminEmail}) 수동 확인 승인 완료`,
          receipt_sent: 0, // 0원 영수증 SMS 자동 발송 큐에 등록
        },
        { filters: { id: requestRow.id } }
      );

      // 스마트 발송 규칙 알림
      executeSmartDispatchRules("payment", {
        userEmail: requestRow.user_email,
        title: `${requestRow.package_name} (관리자 수동 승인)`,
        amount: finalAmount,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `${requestRow.user_email}님께 ${finalTokens.toLocaleString()} 토큰이 성공적으로 지급되었습니다!`,
        creditedTokens: finalTokens,
        newBalance: creditRes.newBalance,
      });
    } else if (action === "REJECT") {
      // 취소 / 환불 처리
      const rejectReason = reason || "관리자에 의해 입금 취소/환불 처리됨";

      await updateRows(
        "sheetbot_deposit_requests",
        {
          status: "CANCELLED",
          updated_at: nowIso,
          updated_by: `admin:${adminEmail}`,
          hold_reason: rejectReason,
        },
        { filters: { id: requestRow.id } }
      );

      return NextResponse.json({
        success: true,
        message: "해당 입금 요청이 정상적으로 취소 처리되었습니다.",
      });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 액션입니다." }, { status: 400 });
  } catch (err: any) {
    console.error("[Deposit-Action] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
