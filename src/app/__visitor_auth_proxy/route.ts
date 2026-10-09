export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TUNNEL_URL = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1";
const API_KEY = process.env.NEXT_PUBLIC_EGDESK_API_KEY || "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0";

function resolveVisitorAuthUrl(): string {
  const tunnel = process.env.NEXT_PUBLIC_EGDESK_TUNNEL_URL;
  if (tunnel && tunnel.trim()) return tunnel.replace(/\/$/, "");

  const publicApi = process.env.NEXT_PUBLIC_EGDESK_API_URL;
  if (publicApi && publicApi.trim() && !publicApi.includes("localhost") && !publicApi.includes("127.0.0.1")) {
    return publicApi.replace(/\/$/, "");
  }

  return DEFAULT_TUNNEL_URL;
}

export async function POST(req: NextRequest) {
  try {
    const tunnelUrl = resolveVisitorAuthUrl();
    const targetUrl = `${tunnelUrl}/visitor-auth/tools/call`;
    const body = await req.json().catch(() => ({}));

    // 클라이언트 오리진 헤더 추출
    const origin = req.headers.get("origin") || req.headers.get("x-visitor-origin") || "https://sheetbot.cloud";

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY,
        "Origin": origin,
        "X-Visitor-Origin": origin,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[Visitor Auth Proxy Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to proxy visitor auth" },
      { status: 500 }
    );
  }
}
