export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { realtimeHub, RealtimeTopic } from "@/lib/realtime-hub";

/**
 * GET /api/realtime/stream
 * SheetBot 전역 실시간 Server-Sent Events (SSE) 엔드포인트
 *
 * Query Params:
 * - topic: 'all' | 'sms' | 'schedules' | 'projects' | 'wallet' | 'deposit' (기본값: 'all')
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryTopic = (url.searchParams.get("topic") || "all") as RealtimeTopic;
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    const sessionEmail = await getCurrentUserEmail(req);
    const userEmail = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : sessionEmail;

    if (!userEmail && process.env.NODE_ENV === "production") {
      return new Response("Unauthorized", { status: 401 });
    }

    const effectiveEmail = userEmail || "anonymous@sheetbot.local";

    const stream = new ReadableStream({
      start(controller) {
        realtimeHub.registerClient(controller, req.signal, {
          userEmail: effectiveEmail,
          topic: queryTopic,
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // NGINX 및 리버스 프록시 버퍼링 차단
      },
    });
  } catch (err: any) {
    console.error("[Realtime-SSE] GET error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
