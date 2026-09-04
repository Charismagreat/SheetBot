export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();

    if (!userEmail) {
      return NextResponse.json({ success: true, inquiries: [] });
    }

    const res = await queryTable("sheetbot_inquiries", {
      filters: { user_email: userEmail.toLowerCase().trim() },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 50,
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
    const loggedInEmail = await getCurrentUserEmail();
    const body = await req.json();

    const userEmail = loggedInEmail || body.email;
    const userName = body.name || "시트봇 고객";

    if (!userEmail || !body.title || !body.content) {
      return NextResponse.json(
        { success: false, error: "이메일, 문의 제목 및 내용을 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newId = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newRow = {
      id: newId,
      user_email: userEmail.toLowerCase().trim(),
      user_name: userName,
      category: body.category || "OTHER",
      title: body.title.trim(),
      content: body.content.trim(),
      status: "PENDING",
      answer: null,
      answered_at: null,
      created_at: now,
    };

    await insertRows("sheetbot_inquiries", [newRow]);

    return NextResponse.json({
      success: true,
      message: "문의가 성공적으로 접수되었습니다. 영업일 기준 24시간 내에 답변해 드립니다.",
      inquiry: newRow,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
