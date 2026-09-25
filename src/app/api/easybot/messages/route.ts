export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { insertRows, queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

const timeoutRace = <T>(promise: Promise<T>, fallback: T, ms = 3500): Promise<T> => {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timeout]);
};

/**
 * GET /api/easybot/messages
 * 현재 로그인된 사용자의 시트봇 AI 대화 내역을 조회합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    let userEmail: string | null = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : null;

    if (!userEmail) {
      userEmail = await getCurrentUserEmail(req).catch(() => null);
    }

    if (!userEmail) {
      return NextResponse.json({ success: true, messages: [] });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // ⚡ 3.5초 타임아웃 가드로 무한 대기 원천 차단
    const res = await timeoutRace(
      queryTable("sheetbot_easybot_chats", {
        filters: { user_email: cleanEmail },
        limit: 100,
        orderBy: "id",
        orderDirection: "ASC",
      }).catch(() => ({ rows: [] })),
      { rows: [] }
    );

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
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: any) {
    console.warn("[EasyBot-Messages-API] GET note:", err.message);
    return NextResponse.json({ success: true, messages: [] });
  }
}

/**
 * POST /api/easybot/messages
 * 시스템/자율 보고 메시지(브리핑, 경보 등) 또는 사용자 메시지를 영구 저장합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req).catch(() => null);

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const { role, message, actionChips, id } = body;

    if (!message) {
      return NextResponse.json({ success: false, error: "메시지 내용이 비어있습니다." }, { status: 400 });
    }

    const msgId = id || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowTime = new Date().toISOString().replace("T", " ").slice(0, 19);

    // ⚡ 저장은 백그라운드 비동기로 안전하게 실행하여 HTTP 응답 즉시 반환
    void timeoutRace(
      insertRows("sheetbot_easybot_chats", [
        {
          id: msgId,
          user_email: cleanEmail,
          role: role === "user" ? "user" : "bot",
          message: String(message),
          action_chips: actionChips ? JSON.stringify(actionChips) : null,
          created_at: nowTime,
        },
      ]).catch((err) => console.warn("[EasyBot-Messages-API] Insert warn:", err)),
      null,
      3000
    );

    return NextResponse.json({
      success: true,
      messageId: msgId,
    }, { status: 200 });
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
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    let userEmail: string | null = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : null;

    if (!userEmail) {
      userEmail = await getCurrentUserEmail(req).catch(() => null);
    }

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const now = new Date().toISOString();

    // ⚡ 소프트 삭제 처리는 백그라운드 비동기로 위임하여 HTTP 응답 0초 즉시 반환 (소켓 블로킹 원천 차단)
    void timeoutRace(
      updateRows("sheetbot_easybot_chats", {
        filters: { user_email: cleanEmail },
        updates: {
          deleted_at: now,
          deleted_by: cleanEmail,
        },
      }).catch((err) => console.warn("[EasyBot-Messages-API] DELETE soft-delete note:", err)),
      null,
      3000
    );

    return NextResponse.json({
      success: true,
      message: "시트봇 AI 대화 내역이 성공적으로 초기화되었습니다.",
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: any) {
    console.error("[EasyBot-Messages-API] DELETE error:", err);
    // 오류가 나더라도 클라이언트 화면은 이미 초기화되었으므로 200 OK 반환
    return NextResponse.json({
      success: true,
      message: "시트봇 AI 대화 내역이 초기화되었습니다.",
    }, { status: 200 });
  }
}
