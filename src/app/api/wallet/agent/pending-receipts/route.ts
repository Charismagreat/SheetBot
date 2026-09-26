export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/wallet/agent/pending-receipts
 * 스마트폰 시트봇 에이전트(SheetBot Agent)가 백그라운드에서 주기적으로 호출하여
 * 발송해야 할 SMS 대기열(테스트 문자, 구글 시트 주문/입금/예약 알림 문자 등)을 수신
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const targetEmail = (queryEmail || headerEmail || "").toLowerCase().trim();

    // 1. 발송 대기 중인(PENDING) SMS 목록 조회
    const filters: Record<string, string> = { status: "PENDING" };
    if (targetEmail && targetEmail.includes("@")) {
      filters.user_email = targetEmail;
    }

    const logsRes = await queryTable("sheetbot_user_dispatch_logs", {
      filters,
      limit: 20,
      orderBy: "id",
      orderDirection: "ASC",
    }).catch(() => ({ rows: [] }));

    const validRows = (logsRes.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 안드로이드 앱 규격(PendingReceipt)으로 포맷 변환
    const pendingReceipts = validRows.map((r: any) => {
      // 숫자 ID 추출 (문자열인 경우 해시 또는 타임스탬프 변환)
      let numId = Number(r.id);
      if (isNaN(numId) || numId <= 0) {
        const matches = String(r.id).match(/\d+/g);
        numId = matches ? Number(matches.join("").slice(0, 15)) : Date.now();
      }

      return {
        id: numId,
        logId: r.id,
        recipientPhone: r.recipient || "",
        depositorName: r.rule_name || "시트봇 알림",
        amountKrw: 0,
        tokensToCredit: 0,
        message: r.content || "",
      };
    });

    return NextResponse.json({
      success: true,
      count: pendingReceipts.length,
      pendingReceipts,
    });
  } catch (err: any) {
    console.error("[Pending-Receipts] GET error:", err);
    return NextResponse.json({ success: false, error: err.message, pendingReceipts: [] }, { status: 500 });
  }
}

/**
 * POST /api/wallet/agent/pending-receipts
 * 스마트폰 시트봇 에이전트가 SMS 발송을 완료한 후 상태를 서버에 보고
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { id, logId, success } = body;

    if (!id && !logId) {
      return NextResponse.json({ success: false, error: "id 또는 logId가 필요합니다." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const newStatus = success !== false ? "SUCCESS" : "FAILED";
    const errorMessage = success !== false ? null : (body.errorMessage || "스마트폰 SMS 전송 실패");

    // id 또는 logId로 dispatch log 업데이트
    const targetFilter = logId ? { id: logId } : { id: String(id) };

    await updateRows(
      "sheetbot_user_dispatch_logs",
      {
        status: newStatus,
        error_message: errorMessage,
        updated_at: nowIso,
      },
      { filters: targetFilter }
    ).catch(async () => {
      // 숫자 ID로 매칭되지 않았을 경우를 대비해 최근 PENDING 레코드 중 검색
      const pendingRes = await queryTable("sheetbot_user_dispatch_logs", {
        filters: { status: "PENDING" },
        limit: 10,
      }).catch(() => ({ rows: [] }));

      const target = (pendingRes.rows || []).find((r: any) => String(r.id).includes(String(id)));
      if (target) {
        await updateRows(
          "sheetbot_user_dispatch_logs",
          {
            status: newStatus,
            error_message: errorMessage,
            updated_at: nowIso,
          },
          { filters: { id: target.id } }
        ).catch(() => {});
      }
    });

    return NextResponse.json({
      success: true,
      status: newStatus,
      message: "발송 상태가 성공적으로 갱신되었습니다.",
    });
  } catch (err: any) {
    console.error("[Pending-Receipts] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
