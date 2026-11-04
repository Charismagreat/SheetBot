export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  resolveVisitorAuthMcpApiUrlForProxyBody,
  resolveVisitorForwardOrigin,
} from "@/lib/visitor-auth-proxy-target";
import {
  getCachedVisitorCodeExchange,
  recordVisitorCodeExchange,
} from "@/app/api/user/agent2/google-oauth/complete/route";

const API_KEY = process.env.NEXT_PUBLIC_EGDESK_API_KEY || "";

function resolveClientIp(req: NextRequest): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tool = String(body.tool || body.op || "").trim();
    const args =
      body.arguments && typeof body.arguments === "object"
        ? (body.arguments as Record<string, unknown>)
        : body;
    const code = tool === "exchange" ? String(args.code || "").trim() : "";

    if (code) {
      const cachedSid = getCachedVisitorCodeExchange(code);
      if (cachedSid) {
        return NextResponse.json({
          success: true,
          sessionId: cachedSid,
          audience: "https://sheetbot.cloud",
        });
      }
    }

    const apiUrl = resolveVisitorAuthMcpApiUrlForProxyBody(body);
    const targetUrl = `${apiUrl}/visitor-auth/tools/call`;

    const origin = resolveVisitorForwardOrigin(req.headers, req.nextUrl.origin);
    const clientIp = resolveClientIp(req);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Visitor-Origin": origin,
    };
    if (API_KEY) headers["X-Api-Key"] = API_KEY;
    const authorization = req.headers.get("authorization");
    if (authorization) headers.Authorization = authorization;
    if (clientIp) headers["X-EGDesk-Visitor-Client-Ip"] = clientIp;

    let res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let data: any = await res.json().catch(() => ({}));

    if (tool === "exchange" && (!res.ok || data?.success === false) && clientIp) {
      const noIpHeaders = { ...headers };
      delete noIpHeaders["X-EGDesk-Visitor-Client-Ip"];
      const retryRes = await fetch(targetUrl, {
        method: "POST",
        headers: noIpHeaders,
        body: JSON.stringify(body),
      });
      const retryData: any = await retryRes.json().catch(() => ({}));
      if (retryRes.ok && retryData?.sessionId) {
        res = retryRes;
        data = retryData;
      }
    }

    if (code && res.ok && data?.sessionId) {
      recordVisitorCodeExchange(code, String(data.sessionId));
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to proxy visitor auth";
    console.error("[Visitor Auth Proxy Error]:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
