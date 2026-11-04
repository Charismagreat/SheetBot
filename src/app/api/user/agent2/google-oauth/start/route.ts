export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { getActiveServerByoHandle } from "@/app/api/auth/gcp-handle/route";
import { EGDESK_CONFIG } from "../../../../../../../egdesk.config";

const MOBILE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/presentations",
];

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

/**
 * GET /api/user/agent2/google-oauth/start
 * SheetBot Agent 모바일 앱 및 모바일 웹에서 Google Drive/Sheets 권한 동의를 포함한
 * 실제 EGDesk Visitor OAuth 플로우(서버에 등록된 BYO GCP 핸들 우선 적용 + 플랫폼 OAuth 자동 폴백)를 시작합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref") || "";
    const emailHint = url.searchParams.get("email") || "";
    const nextPath = url.searchParams.get("next") || "";
    const explicitHandle = url.searchParams.get("handle") || "";
    const mode = url.searchParams.get("mode") || "";

    const siteOrigin = "https://sheetbot.cloud";
    const callbackUrl = new URL("/auth/mobile-callback", siteOrigin);
    if (ref.trim()) {
      callbackUrl.searchParams.set("ref", ref.trim());
    }
    if (emailHint.trim()) {
      callbackUrl.searchParams.set("email", emailHint.trim());
    }
    if (nextPath.trim()) {
      callbackUrl.searchParams.set("next", nextPath.trim());
    }

    const clientIp = resolveClientIp(req);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Api-Key": EGDESK_CONFIG.apiKey,
      Origin: siteOrigin,
      "X-Visitor-Origin": siteOrigin,
    };
    if (clientIp) {
      headers["X-EGDesk-Visitor-Client-Ip"] = clientIp;
      headers["X-Forwarded-For"] = clientIp;
    }

    // 1. 서버 DB 또는 쿼리에 유효한 BYO GCP 핸들이 있으면 우선 사용 (모바일에서도 BYO 자동 적용)
    let activeHandle = explicitHandle.trim();
    if (!activeHandle && mode !== "platform") {
      const serverByo = await getActiveServerByoHandle(req, emailHint).catch(() => null);
      if (serverByo?.registered && serverByo.handle) {
        activeHandle = serverByo.handle;
      }
    }

    const apiUrl = getServerEgdeskApiUrl();
    const callStart = async (useByoHandle?: string) => {
      const startArgs: Record<string, unknown> = {
        returnTo: callbackUrl.toString(),
        egdeskPublicUrl: siteOrigin,
        visitorOrigin: siteOrigin,
        forceConsent: true,
        scopes: MOBILE_WORKSPACE_SCOPES,
      };
      if (useByoHandle) {
        startArgs.gcp = "self";
        startArgs.handle = useByoHandle;
      }

      const res = await fetch(`${apiUrl}/visitor-auth/tools/call`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tool: "start",
          arguments: startArgs,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const json: any = await res.json().catch(() => null);
      const textContent = json?.result?.content?.[0]?.text;
      return textContent ? JSON.parse(textContent) : json?.result || json;
    };

    let parsed: any = null;
    if (activeHandle) {
      parsed = await callStart(activeHandle).catch(() => null);
    }
    if (!parsed?.authUrl) {
      parsed = await callStart(undefined);
    }

    if (!parsed?.authUrl) {
      const errMsg = parsed?.error || "Google OAuth 인증 URL을 생성하지 못했습니다.";
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }

    return NextResponse.redirect(parsed.authUrl);
  } catch (err: any) {
    console.error("[MobileGoogleOAuth-Start] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Google OAuth 시작 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
