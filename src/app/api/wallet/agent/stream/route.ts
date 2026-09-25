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
  // 공식 이지데스크 onUserDataChanged 브라우저 직접 SSE로 전면 대체됨.
  // 레거시 클라이언트의 소켓 잠식 방지를 위해 즉시 연결 종료 응답을 반환합니다.
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
