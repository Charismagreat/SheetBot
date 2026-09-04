export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/easybot/messages
 * 현재 로그인된 사용자의 시트봇 AI 대화 내역을 조회합니다.
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();

    if (!userEmail) {
      return NextResponse.json({ success: true, messages: [] });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 최근 100건 조회
    const res = await queryTable("sheetbot_easybot_chats", {
      filters: { user_email: cleanEmail },
      limit: 100,
      orderBy: "id",
      orderDirection: "ASC",
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 프론트엔드 ChatMessage 형식으로 변환
    const formattedMessages = validRows.map((r: any) => {
      let timeStr = "";
      try {
        if (r.created_at) {
          const d = new Date(r.created_at);
          if (!isNaN(d.getTime())) {
            timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
        }
      } catch {}

      return {
        id: String(r.id || ("msg_" + Date.now())),
        role: (r.role === "user" ? "user" : "bot") as "user" | "bot",
        text: String(r.message || ""),
        time: timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
    });

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
      userEmail: cleanEmail,
    });
  } catch (err: any) {
    console.error("[EasyBot-Messages-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/easybot/messages
 * 현재 로그인된 사용자의 시트봇 AI 대화 내역을 일괄 소프트 삭제(초기화)합니다.
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const now = new Date().toISOString();

    // 사용자의 대화 기록 소프트 삭제
    await updateRows("sheetbot_easybot_chats", {
      filters: { user_email: cleanEmail },
      updates: {
        deleted_at: now,
        deleted_by: cleanEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "시트봇 AI 대화 내역이 성공적으로 초기화되었습니다.",
    });
  } catch (err: any) {
    console.error("[EasyBot-Messages-API] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
