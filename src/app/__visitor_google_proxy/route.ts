export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TUNNEL_URL = "https://tunneling-service.onrender.com/t/mcp-server-fxkud1";
const API_KEY = process.env.NEXT_PUBLIC_EGDESK_API_KEY || "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0";

export async function POST(req: NextRequest) {
  try {
    const tunnelUrl =
      process.env.NEXT_PUBLIC_EGDESK_API_URL ||
      process.env.NEXT_PUBLIC_EGDESK_TUNNEL_URL ||
      DEFAULT_TUNNEL_URL;

    const targetUrl = `${tunnelUrl.replace(/\/$/, "")}/visitor-google/tools/call`;
    const body = await req.json().catch(() => ({}));

    // 클라이언트 헤더 추출 (인증 토큰 및 오리진 보존)
    const origin = req.headers.get("origin") || req.headers.get("x-visitor-origin") || "https://sheetbot.cloud";
    const authHeader = req.headers.get("authorization") || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
      "Origin": origin,
      "X-Visitor-Origin": origin,
    };

    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("[Visitor Google Proxy Error]:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to proxy visitor google" },
      { status: 500 }
    );
  }
}
