export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_SEED_REVIEWS } from "@/app/api/reviews/route";

/**
 * OPTIONS /api/reviews/bootstrap
 * 브라우저 CORS 프리플라이트 대응
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-email, x-admin-key",
    },
  });
}

/**
 * GET /api/reviews/bootstrap
 * ⚡ 후기 페이지 전체 초기 데이터(전체 후기 대장 + 평점 통계 + 본인 작성 후기)를
 * 단 1회의 초고속 HTTP 왕복으로 번들링하여 반환
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req);

    const res = await queryTable("sheetbot_reviews", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 테이블이 비어있는 경우 기본 시드 후기 자동 등록
    if (validRows.length === 0) {
      await insertRows("sheetbot_reviews", DEFAULT_SEED_REVIEWS).catch((e) =>
        console.warn("[Reviews Bootstrap] Failed to seed reviews:", e.message)
      );
      validRows = DEFAULT_SEED_REVIEWS;
    }

    // 평점 통계 및 별점별 분포 계산
    const totalCount = validRows.length;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sumRating = 0;

    for (const r of validRows) {
      const rating = Math.min(5, Math.max(1, Number(r.rating) || 5));
      distribution[rating] = (distribution[rating] || 0) + 1;
      sumRating += rating;
    }

    const avgRating = totalCount > 0 ? (sumRating / totalCount).toFixed(1) : "5.0";

    // 현재 로그인된 사용자의 후기 탐색
    const myReview = userEmail
      ? validRows.find((r: any) => r.user_email?.toLowerCase() === userEmail.toLowerCase()) || null
      : null;

    const response = NextResponse.json({
      success: true,
      reviews: validRows,
      stats: {
        totalCount,
        avgRating,
        distribution,
      },
      myReview,
      canWrite: Boolean(userEmail),
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  } catch (err: any) {
    console.error("[Reviews Bootstrap API Error]:", err);
    const errResponse = NextResponse.json(
      { success: false, error: err.message || "리뷰 번들 조회 실패" },
      { status: 500 }
    );
    errResponse.headers.set("Access-Control-Allow-Origin", "*");
    return errResponse;
  }
}
