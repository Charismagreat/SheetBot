export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/quote/[quoteId]
 * 고객 및 외부 열람용 견적서 단건 상세 조회 & 열람 상태 기록
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { quoteId: string } }
) {
  try {
    await setupDatabase();
    const quoteId = params.quoteId;

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

    const rawQuote = res.rows[0];

    // 고객 열람 일시 및 상태 업데이트 (최초 열람 시)
    if (!rawQuote.viewed_at) {
      const now = new Date().toISOString();
      await updateRows("sheetbot_quotes", {
        filters: { id: quoteId },
        updates: {
          viewed_at: now,
          status: rawQuote.status === "ISSUED" ? "VIEWED" : rawQuote.status,
        },
      }).catch(() => {});
    }

    let items = [];
    try {
      items = JSON.parse(rawQuote.items_json || "[]");
    } catch {
      items = [];
    }

    const quoteData = {
      id: rawQuote.id,
      customer_name: rawQuote.customer_name || "고객님",
      customer_phone: rawQuote.customer_phone || "",
      inquiry_text: rawQuote.inquiry_text || "",
      items,
      supply_amount: Number(rawQuote.supply_amount || 0),
      vat_amount: Number(rawQuote.vat_amount || 0),
      total_amount: Number(rawQuote.total_amount || 0),
      status: rawQuote.status || "ISSUED",
      created_at: rawQuote.created_at,
    };

    return NextResponse.json({
      success: true,
      quote: quoteData,
    });
  } catch (err: any) {
    console.error("[QuoteDetail] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
