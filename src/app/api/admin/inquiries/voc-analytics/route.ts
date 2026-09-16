export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { generateVocAnalytics, getDefaultVocAnalytics } from "@/lib/voc-analyzer";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // 1. 캐시 조회 시도
    const cacheRes = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_voc_analytics" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (cacheRes.rows || []).filter((r: any) => !r.deleted_at);
    if (validRows.length > 0 && validRows[0].value) {
      try {
        const parsed = JSON.parse(validRows[0].value);
        return NextResponse.json({ success: true, data: parsed, fromCache: true });
      } catch {}
    }

    // 캐시가 없으면 기본 데이터 반환 (빠른 초기 로딩)
    const fallback = getDefaultVocAnalytics(0);
    return NextResponse.json({ success: true, data: fallback, fromCache: false });
  } catch (err: any) {
    console.error("[VocAnalytics GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const forceRefresh = Boolean(body.forceRefresh);

    // 전체 활성 문의 데이터 수집 (기업 견적 + 일반 문의)
    const [genRes, entRes] = await Promise.all([
      queryTable("sheetbot_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_enterprise_inquiries", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),
    ]);

    const allInquiries = [
      ...(genRes.rows || []).filter((r: any) => !r.deleted_at),
      ...(entRes.rows || []).filter((r: any) => !r.deleted_at),
    ];

    const result = await generateVocAnalytics(allInquiries, forceRefresh);

    return NextResponse.json({
      success: true,
      data: result,
      message: "AI VOC 및 기능 수요 히트맵 분석이 최신화되었습니다.",
    });
  } catch (err: any) {
    console.error("[VocAnalytics POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
