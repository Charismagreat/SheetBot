export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { EGDESK_CONFIG } from "../../../../../../../egdesk.config";

const MOBILE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
];

/**
 * GET /api/user/agent2/google-oauth/start
 * SheetBot Agent 모바일 앱에서 Google Drive/Sheets 권한 동의를 포함한
 * 실제 EGDesk Visitor OAuth 플로우를 시작하고 Google 동의 화면으로 리다이렉트합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref") || "";
    const emailHint = url.searchParams.get("email") || "";

    const siteOrigin = "https://sheetbot.cloud";
    const callbackUrl = new URL("/auth/mobile-callback", siteOrigin);
    if (ref.trim()) {
      callbackUrl.searchParams.set("ref", ref.trim());
    }
    if (emailHint.trim()) {
      callbackUrl.searchParams.set("email", emailHint.trim());
    }

    const apiUrl = getServerEgdeskApiUrl();
    const res = await fetch(`${apiUrl}/visitor-auth/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": EGDESK_CONFIG.apiKey,
        Origin: siteOrigin,
        "X-Visitor-Origin": siteOrigin,
      },
      body: JSON.stringify({
        tool: "start",
        arguments: {
          returnTo: callbackUrl.toString(),
          egdeskPublicUrl: siteOrigin,
          visitorOrigin: siteOrigin,
          forceConsent: true,
          scopes: MOBILE_WORKSPACE_SCOPES,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const json: any = await res.json().catch(() => null);
    const textContent = json?.result?.content?.[0]?.text;
    const parsed = textContent ? JSON.parse(textContent) : json?.result || json;

    if (!parsed?.authUrl) {
      const errMsg = parsed?.error || json?.error || "Google OAuth 인증 URL을 생성하지 못했습니다.";
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
