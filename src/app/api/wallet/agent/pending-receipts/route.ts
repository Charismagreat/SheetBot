export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * [시트봇 에이전트 M] 미발송 영수증 대기열(Outbox Queue) 조회 및 발송 완료 마킹 API
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 10), 50);

    // 1. 최근 입금 완료(COMPLETED)된 요청 조회
    const res = await queryTable("sheetbot_deposit_requests", {
      filters: { status: "COMPLETED" },
      limit: 50,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const rows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 전화번호가 존재하고, 아직 영수증이 발송되지 않은 건 필터링
    const pendingList = rows
      .filter((r: any) => {
        const hasPhone = Boolean(r.phone_number && String(r.phone_number).trim().length >= 8);
        const notSent = !r.receipt_sent || Number(r.receipt_sent) === 0;
        return hasPhone && notSent;
      })
      .slice(0, limit)
      .map((r: any) => {
        const depositor = r.depositor_name || r.user_name || "회원";
        const amountStr = Number(r.amount_krw || 0).toLocaleString();
        const tokensStr = Number(r.tokens_to_credit || 0).toLocaleString();
        const msg = `[SheetBot] ${depositor}님, ${amountStr}원 입금이 확인되어 ${tokensStr} 토큰이 정상 충전되었습니다. 감사합니다.`;

        return {
          id: r.id,
          recipientPhone: String(r.phone_number).trim(),
          depositorName: depositor,
          amountKrw: Number(r.amount_krw || 0),
          tokensToCredit: Number(r.tokens_to_credit || 0),
          message: msg,
          completedAt: r.completed_at || r.created_at,
        };
      });

    return NextResponse.json({
      success: true,
      count: pendingList.length,
      pendingReceipts: pendingList,
    });
  } catch (err: any) {
    console.error("[Pending-Receipts-GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json();
    const { id, success } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 발송 성공 마킹
    await updateRows(
      "sheetbot_deposit_requests",
      {
        receipt_sent: success === false ? 0 : 1,
        receipt_sent_at: now,
        updated_at: now,
        updated_by: "agent_receipt_queue",
      },
      { filters: { id: String(id) } }
    );

    return NextResponse.json({
      success: true,
      message: `영수증 발송 상태 마킹 완료 (ID: ${id})`,
      id,
    });
  } catch (err: any) {
    console.error("[Pending-Receipts-POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
