export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { depositStreamHub } from "@/lib/deposit-stream-hub";

/**
 * GET /api/wallet/agent/stream
 * Server-Sent Events (SSE) 실시간 스트림 엔드포인트
 *
 * [핵심 구현 스펙]
 * - Node.js 런타임 & force-dynamic 적용
 * - 단일 공유 업스트림(Single Shared Upstream) 허브 연동으로 이지데스크 연결 팬아웃 최적화
 * - X-Accel-Buffering: no 및 Cache-Control: no-cache, no-transform으로 프록시/Nginx 버퍼링 차단
 * - req.signal 리스너를 통한 즉각적인 클라이언트 자원 회수
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    const sessionEmail = await getCurrentUserEmail(req);
    const userEmail = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : sessionEmail;

    // 관리자 여부 확인 (개발 및 로컬 환경 유연성 보장)
    const isAdmin = userEmail ? await isCurrentUserAdmin(userEmail) : false;

    // 인증 확인: 관리자 권한이거나 유효한 세션인 경우 통과
    if (!userEmail || (!isAdmin && process.env.NODE_ENV === "production" && !sessionEmail)) {
      console.warn(`[Deposit-SSE] 미인가 접근 차단: email=${userEmail}, isAdmin=${isAdmin}`);
      return new Response("Unauthorized", { status: 401 });
    }

    const stream = new ReadableStream({
      start(controller) {
        // 단일 공유 스트림 허브에 클라이언트 등록 (하트비트, 업스트림 연결, cleanup 자동 처리)
        depositStreamHub.registerClient(controller, req.signal, userEmail);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // NGINX / 리버스 프록시 버퍼링 완전 차단
      },
    });
  } catch (err: any) {
    console.error("[Deposit-SSE] GET error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
