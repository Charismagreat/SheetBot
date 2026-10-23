export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { realtimeHub } from "@/lib/realtime-hub";

/**
 * GET /api/user/dispatch/stream
 * 모바일 시트봇 에이전트(Android Agent) 전용 실시간 발송 대기열 SSE 스트림
 * 
 * 구글 시트 체크박스 클릭 등 신규 발송건 발생 시 0.05초 만에 스마트폰에 알림 전달
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
  const headerEmail = req.headers.get("x-sheetbot-user-email");
  const sessionEmail = await getCurrentUserEmail(req).catch(() => null);

  const userEmail = (queryEmail && queryEmail.includes("@"))
    ? queryEmail.toLowerCase().trim()
    : (headerEmail && headerEmail.includes("@"))
    ? headerEmail.toLowerCase().trim()
    : (sessionEmail || "");

  if (!userEmail) {
    return new Response(JSON.stringify({ error: "userEmail is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      realtimeHub.registerClient(controller, req.signal, {
        userEmail,
        topic: "sms",
        closeOnEvent: true,
        maxLifetimeMs: 25000,
        dedupeByEmailAndTopic: true,
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
