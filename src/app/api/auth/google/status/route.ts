import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_EGDESK_API_URL || "http://localhost:8080";

    // 1. drive_auth_status 도구 호출
    let driveStatus: any = null;
    try {
      const res = await fetch(`${apiUrl}/drive/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "drive_auth_status",
          arguments: {},
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.result?.content?.[0]?.text;
        if (text) {
          driveStatus = typeof text === "string" ? JSON.parse(text) : text;
        }
      }
    } catch (err) {
      console.warn("drive_auth_status call warning:", err);
    }

    // 2. sheets_auth_status 도구 호출
    let sheetsStatus: any = null;
    try {
      const res = await fetch(`${apiUrl}/sheets/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "sheets_auth_status",
          arguments: {},
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.result?.content?.[0]?.text;
        if (text) {
          sheetsStatus = typeof text === "string" ? JSON.parse(text) : text;
        }
      }
    } catch (err) {
      console.warn("sheets_auth_status call warning:", err);
    }

    // 구글 계정 이메일 추출
    const email =
      sheetsStatus?.actingAsEmail ||
      sheetsStatus?.oauthEmail ||
      driveStatus?.identity?.actingAsEmail ||
      driveStatus?.identity?.oauthEmail ||
      null;

    const connected = Boolean(
      (sheetsStatus && sheetsStatus.connected) ||
      (driveStatus && (driveStatus.connected || driveStatus?.oauth?.hasAccessToken))
    );

    const hasDriveScope = Boolean(driveStatus?.oauth?.hasDriveScope);

    return NextResponse.json({
      success: true,
      connected,
      email,
      name: email ? email.split("@")[0] : null,
      hasDriveScope,
      driveStatus: driveStatus?.status || "unknown",
      provider: "google",
    });
  } catch (err: any) {
    console.error("Google auth status API error:", err);
    return NextResponse.json(
      {
        success: false,
        connected: false,
        email: null,
        error: err.message || "Failed to check Google auth status",
      },
      { status: 500 }
    );
  }
}
