export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable } from "@/lib/egdesk-helpers";
import { DEFAULT_FAQS } from "@/lib/default-faqs";
import { fetchWithCache } from "@/lib/server-cache";

export async function GET(req: NextRequest) {
  try {
    // ⚡ 캐시(60초) + 최대 2초 타임아웃 레이스로 무한 로딩 원천 차단
    const faqs = await fetchWithCache(
      "public_faqs_list",
      async () => {
        const timeoutPromise = new Promise<{ rows: any[] }>((resolve) =>
          setTimeout(() => resolve({ rows: [] }), 2000)
        );

        const fetchPromise = queryTable("sheetbot_faqs", {
          orderBy: "sort_order",
          orderDirection: "ASC",
          limit: 100,
        }).catch(() => ({ rows: [] }));

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

        if (validRows.length === 0) {
          return DEFAULT_FAQS;
        }

        // 정렬 순서대로 보정
        validRows.sort((a: any, b: any) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
        return validRows;
      },
      60
    );

    return NextResponse.json(
      { success: true, faqs: faqs || DEFAULT_FAQS },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: true, error: err.message, faqs: DEFAULT_FAQS },
      { status: 200 }
    );
  }
}
