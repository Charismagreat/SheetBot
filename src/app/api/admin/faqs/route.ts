export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_faqs", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    return NextResponse.json({ success: true, faqs: validRows });
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
    const { category, question, answer, sort_order } = body;

    if (!category || !question || !answer) {
      return NextResponse.json({ success: false, error: "카테고리, 질문, 답변을 모두 입력해 주세요." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const faqId = `faq_${Date.now()}`;

    await insertRows("sheetbot_faqs", [
      {
        id: faqId,
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sort_order: Number(sort_order) || 0,
        created_at: now,
        updated_at: now,
        updated_by: userEmail,
        deleted_at: null,
      },
    ]);

    return NextResponse.json({ success: true, message: "새 FAQ가 등록되었습니다.", faqId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { id, category, question, answer, sort_order } = body;

    if (!id || !category || !question || !answer) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    await updateRows("sheetbot_faqs", {
      filters: { id },
      updates: {
        category: category.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sort_order: Number(sort_order) || 0,
        updated_at: now,
        updated_by: userEmail,
      },
    });

    return NextResponse.json({ success: true, message: "FAQ 항목이 수정되었습니다." });
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
      return NextResponse.json({ success: false, error: "삭제할 FAQ ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_faqs", {
      filters: { id },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({ success: true, message: "FAQ가 소프트 삭제되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
