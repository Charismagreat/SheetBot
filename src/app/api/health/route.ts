export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

/**
 * GET /api/health
 * Zero-dependency liveness probe (<2ms):
 * - No database / MCP calls
 * - No filesystem reads
 * - No outbound external fetches
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

/**
 * HEAD /api/health
 * Ultra-lightweight 0-byte liveness probe for mobile agents & monitors.
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: NO_STORE_HEADERS,
  });
}
