export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, deleteRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_inquiries", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    return NextResponse.json({ success: true, inquiries: validRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { inquiryId, answer } = body;

    if (!inquiryId || !answer) {
      return NextResponse.json({ success: false, error: "문의 ID와 답변 내용을 입력해 주세요." }, { status: 400 });
    }

    const now = new Date().toISOString();

    await updateRows("sheetbot_inquiries", {
      filters: { id: inquiryId },
      updates: {
        answer: answer.trim(),
        status: "ANSWERED",
        answered_at: now,
        updated_at: now,
        updated_by: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "답변이 성공적으로 등록되었습니다. 고객 문의 화면에 즉시 노출됩니다.",
    });
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
      return NextResponse.json({ success: false, error: "삭제할 문의 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_inquiries", {
      filters: { id },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({ success: true, message: "문의가 소프트 삭제되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
