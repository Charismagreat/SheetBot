export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  resolveVisitorAuthMcpApiUrl,
  resolveVisitorForwardOrigin,
} from "@/lib/visitor-auth-proxy-target";

const API_KEY = process.env.NEXT_PUBLIC_EGDESK_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const apiUrl = resolveVisitorAuthMcpApiUrl();
    const targetUrl = `${apiUrl}/visitor-google/tools/call`;
    const body = await req.text();

    const origin = resolveVisitorForwardOrigin(req.headers, req.nextUrl.origin);
    const authHeader = req.headers.get("authorization") || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Visitor-Origin": origin,
    };
    if (API_KEY) headers["X-Api-Key"] = API_KEY;
    if (authHeader) headers.Authorization = authHeader;

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to proxy visitor google";
    console.error("[Visitor Google Proxy Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
