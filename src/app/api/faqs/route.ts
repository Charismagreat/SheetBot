export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_FAQS } from "@/lib/default-faqs";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const res = await queryTable("sheetbot_faqs", {
      orderBy: "sort_order",
      orderDirection: "ASC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 테이블이 비어있는 경우 기본 8개 FAQ를 DB에 실제 영구 등록
    if (validRows.length === 0) {
      const now = new Date().toISOString();
      const seedRows = DEFAULT_FAQS.map((faq) => ({
        id: faq.id,
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        sort_order: faq.sort_order,
        created_at: now,
        updated_at: now,
        updated_by: "system_seed",
        deleted_at: null,
      }));

      await insertRows("sheetbot_faqs", seedRows).catch((e) =>
        console.warn("Failed to seed faqs:", e.message)
      );
      validRows = seedRows;
    } else {
      // 정렬 순서대로 보정
      validRows.sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    }

    return NextResponse.json({ success: true, faqs: validRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, faqs: DEFAULT_FAQS }, { status: 500 });
  }
}
