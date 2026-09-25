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
  // 공식 이지데스크 onUserDataChanged 브라우저 직접 SSE로 전면 대체됨.
  // 레거시 클라이언트의 소켓 잠식 방지를 위해 즉시 연결 종료 응답을 반환합니다.
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
