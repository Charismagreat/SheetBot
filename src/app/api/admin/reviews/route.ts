export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

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

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
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
