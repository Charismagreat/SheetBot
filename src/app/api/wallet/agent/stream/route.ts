export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { depositEventBus, DepositEventPayload } from "@/lib/deposit-events";

/**
 * GET /api/wallet/agent/stream
 * Server-Sent Events (SSE) 실시간 스트림 엔드포인트
 * 15초 폴링을 대체하여 입금 감지 및 기기 상태 변경 시 0초 만에 브라우저로 실시간 푸시
 */
export async function GET(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    const isAdmin = await isCurrentUserAdmin(userEmail);

    if (!userEmail || !isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // 1. 최초 연결 성공 메시지 전송
        const welcomeData = `data: ${JSON.stringify({
          type: "CONNECTED",
          message: "⚡ 실시간 입금 감시 스트림이 정상 연결되었습니다.",
          timestamp: new Date().toISOString(),
        })}\n\n`;
        controller.enqueue(encoder.encode(welcomeData));

        // 2. 이벤트 리스너 등록
        const onEvent = (payload: DepositEventPayload) => {
          try {
            const chunk = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          } catch (err) {
            console.warn("[Deposit-SSE] Error enqueuing chunk:", err);
          }
        };

        depositEventBus.on("deposit_change", onEvent);

        // 3. 25초 주기 킵얼라이브 핑 (프록시/로드밸런서 타임아웃 방지)
        const keepAliveTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive ping\n\n"));
          } catch {
            clearInterval(keepAliveTimer);
          }
        }, 25000);

        // 4. 클라이언트 연결 종료 시 정리
        req.signal.addEventListener("abort", () => {
          depositEventBus.off("deposit_change", onEvent);
          clearInterval(keepAliveTimer);
          try {
            controller.close();
          } catch {}
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // NGINX 버퍼링 비활성화
      },
    });
  } catch (err: any) {
    console.error("[Deposit-SSE] GET error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
