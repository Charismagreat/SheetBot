export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { getCurrentUserEmail } from "@/lib/auth";

/**
 * GET /api/user/agent2/sms-queue
 * 
 * 시트봇 모바일 에이전트(스마트폰)가 백그라운드에서 주기적으로 호출하여
 * 자신에게 배정된 외부 서비스(FileToSheet 등)의 발송 대기 문자를 수신합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryEmail = searchParams.get("userEmail");
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);

    const userEmail = (queryEmail && queryEmail.includes("@"))
      ? queryEmail.toLowerCase().trim()
      : (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : (sessionEmail || ""));

    const limit = Math.min(parseInt(searchParams.get("limit") || "5", 10), 10);

    // 1. 발송 대기(PENDING) 항목 조회
    const res = await queryTable("sheetbot_sms_dispatch_queue", {
      filters: { status: "PENDING" },
      limit: 20,
      orderBy: "id",
      orderDirection: "ASC",
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => {
      if (r.deleted_at || r.status !== "PENDING") return false;
      if (!userEmail) return true;
      return !r.user_email || r.user_email.toLowerCase() === userEmail;
    }).slice(0, limit);

    if (validRows.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        items: [],
      });
    }

    const nowIso = new Date().toISOString();
    const items = validRows.map((r: any) => ({
      id: r.id,
      uuid: r.uuid,
      sourceService: r.source_service || "FileToSheet",
      recipient: r.recipient_phone,
      message: r.message_text,
      senderPhone: r.sender_phone,
      callbackUrl: r.callback_url,
      createdAt: r.created_at,
    }));

    // 2. 조회된 항목들의 상태를 중복 발송 방지를 위해 'PROCESSING'으로 원자적 변경
    try {
      for (const item of items) {
        await updateRows(
          "sheetbot_sms_dispatch_queue",
          {
            filters: { id: String(item.id) },
            updates: {
              status: "PROCESSING",
              updated_at: nowIso,
              updated_by: "agent-fetch",
            },
          }
        );
      }
    } catch (e: any) {
      console.warn("[SmsQueueFetch] Status update warning:", e?.message || e);
    }

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error: any) {
    console.error("[SmsQueueFetch] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "대기열 조회 중 오류 발생" },
      { status: 500 }
    );
  }
}
