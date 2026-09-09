import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const apiUrl = process.env.NEXT_PUBLIC_EGDESK_API_URL || "http://localhost:8080";
    const forceConsent = body.forceConsent !== undefined ? Boolean(body.forceConsent) : true;
    const openWindow = body.openWindow !== undefined ? Boolean(body.openWindow) : true;

    // drive_auth_login 도구 호출
    const res = await fetch(`${apiUrl}/drive/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "drive_auth_login",
        arguments: {
          forceConsent,
          openWindow,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`drive_auth_login call failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    let loginData: any = {};
    const text = json?.result?.content?.[0]?.text;
    if (text) {
      loginData = typeof text === "string" ? JSON.parse(text) : text;
    }

    let authUrl = loginData.authUrl || null;
    if (authUrl) {
      if (authUrl.includes("prompt=consent")) {
        authUrl = authUrl.replace("prompt=consent", "prompt=select_account%20consent");
      } else if (!authUrl.includes("prompt=")) {
        authUrl += "&prompt=select_account%20consent";
      }
    }

    return NextResponse.json({
      success: true,
      authUrl,
      status: loginData.status || "pending",
      openedWindow: loginData.openedWindow || false,
      message: loginData.message || "Google OAuth flow initiated",
    });
  } catch (err: any) {
    console.error("Google auth login-start error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to start Google OAuth flow" },
      { status: 500 }
    );
  }
}
