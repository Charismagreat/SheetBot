export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { insertRows, queryTable, updateRows } from "@/lib/egdesk-helpers";
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

      let actionChips = undefined;
      if (r.action_chips) {
        try {
          actionChips = typeof r.action_chips === "string" ? JSON.parse(r.action_chips) : r.action_chips;
        } catch {}
      }

      return {
        id: String(r.id || ("msg_" + Date.now())),
        role: (r.role === "user" ? "user" : "bot") as "user" | "bot",
        text: String(r.message || ""),
        time: timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        actionChips,
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
 * POST /api/easybot/messages
 * 시스템/자율 보고 메시지(브리핑, 경보 등) 또는 사용자 메시지를 영구 저장합니다.
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json();
    const { role, message, actionChips, id } = body;

    if (!message) {
      return NextResponse.json({ success: false, error: "메시지 내용이 비어있습니다." }, { status: 400 });
    }

    const msgId = id || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowTime = new Date().toISOString().replace("T", " ").slice(0, 19);

    await insertRows("sheetbot_easybot_chats", [
      {
        id: msgId,
        user_email: cleanEmail,
        role: role === "user" ? "user" : "bot",
        message: String(message),
        action_chips: actionChips ? JSON.stringify(actionChips) : null,
        created_at: nowTime,
      },
    ]);

    return NextResponse.json({
      success: true,
      messageId: msgId,
    });
  } catch (err: any) {
    console.error("[EasyBot-Messages-API] POST error:", err);
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
