export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  resolveVisitorAuthMcpApiUrlForProxyBody,
  resolveVisitorForwardOrigin,
} from "@/lib/visitor-auth-proxy-target";

const API_KEY = process.env.NEXT_PUBLIC_EGDESK_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const apiUrl = resolveVisitorAuthMcpApiUrlForProxyBody(body);
    const targetUrl = `${apiUrl}/visitor-auth/tools/call`;

    const origin = resolveVisitorForwardOrigin(req.headers, req.nextUrl.origin);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Visitor-Origin": origin,
    };
    if (API_KEY) headers["X-Api-Key"] = API_KEY;
    const authorization = req.headers.get("authorization");
    if (authorization) headers.Authorization = authorization;

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to proxy visitor auth";
    console.error("[Visitor Auth Proxy Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
