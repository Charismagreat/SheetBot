export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_SEED_REVIEWS } from "@/app/api/reviews/route";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_reviews", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // DB에 데이터가 없으면 고객 페이지와 동일한 초기 시드 후기를 DB에 실제 등록
    if (validRows.length === 0) {
      await insertRows("sheetbot_reviews", DEFAULT_SEED_REVIEWS).catch((e) =>
        console.warn("Failed to seed reviews for admin:", e.message)
      );
      validRows = DEFAULT_SEED_REVIEWS;
    }

    return NextResponse.json({ success: true, reviews: validRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 후기 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_reviews", {
      filters: { id },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({ success: true, message: "사용 후기가 블라인드(소프트 삭제) 처리되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
