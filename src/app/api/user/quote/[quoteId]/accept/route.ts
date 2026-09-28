export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/quote/[quoteId]/accept
 * 고객이 모바일 견적서 화면에서 [이 견적으로 접수 / 예약 확정]을 눌렀을 때 처리
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ quoteId: string }> }
) {
  try {
    await setupDatabase();
    const { quoteId } = await context.params;

    if (!quoteId) {
      return NextResponse.json({ success: false, error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    const res = await queryTable("sheetbot_quotes", {
      filters: { id: quoteId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ success: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_quotes", {
      filters: { id: quoteId },
      updates: {
        status: "ACCEPTED",
        updated_at: now,
      },
    });

    return NextResponse.json({
      success: true,
      message: "견적 접수 및 예약 확정이 성공적으로 접수되었습니다.",
      status: "ACCEPTED",
    });
  } catch (err: any) {
    console.error("[QuoteAccept] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
