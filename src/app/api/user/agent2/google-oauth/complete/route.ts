export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { queryTable, insertRows, updateRows, getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getOrCreateUserWallet, processReferralReward } from "@/lib/token-wallet";
import { syncVisitorSessionToUser } from "@/lib/api-keys";
import { EGDESK_CONFIG } from "../../../../../../../egdesk.config";
import crypto from "crypto";

/**
 * POST /api/user/agent2/google-oauth/complete
 * 모바일 브라우저(/auth/mobile-callback)에서 전달된 1회용 EGDesk OAuth code를
 * visitorSessionId로 교환하고, DB(sheetbot_users, sheetbot_user_api_keys)에 즉시 동기화한 뒤
 * 앱 복귀용 딥링크(sheetbot://pair?...&sid=...)를 반환합니다.
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const refCode = String(body.ref || "").trim();

    if (!code) {
      return NextResponse.json(
        { success: false, error: "인증 코드(code)가 누락되었습니다." },
        { status: 400 }
      );
    }

    const siteOrigin = "https://sheetbot.cloud";
    const apiUrl = getServerEgdeskApiUrl();

    // 1. 1회용 code를 visitorSessionId로 교환
    const exRes = await fetch(`${apiUrl}/visitor-auth/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": EGDESK_CONFIG.apiKey,
        Origin: siteOrigin,
        "X-Visitor-Origin": siteOrigin,
      },
      body: JSON.stringify({
        tool: "exchange",
        arguments: {
          code,
          visitorOrigin: siteOrigin,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const exJson: any = await exRes.json().catch(() => null);
    const exText = exJson?.result?.content?.[0]?.text;
    const exParsed = exText ? JSON.parse(exText) : exJson?.result || exJson;
    const sessionId = String(exParsed?.sessionId || "").trim();

    if (!sessionId) {
      const errMsg = exParsed?.error || exJson?.error || "세션 교환에 실패했습니다.";
      return NextResponse.json({ success: false, error: errMsg }, { status: 400 });
    }

    // 2. visitor-google status로 로그인된 이메일 및 프로필 조회
    const statusRes = await fetch(`${apiUrl}/visitor-google/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionId}`,
        Origin: siteOrigin,
        "X-Visitor-Origin": siteOrigin,
      },
      body: JSON.stringify({ tool: "status", arguments: {} }),
      signal: AbortSignal.timeout(12_000),
    });

    const statusJson: any = await statusRes.json().catch(() => null);
    const statusText = statusJson?.result?.content?.[0]?.text;
    const statusParsed = statusText ? JSON.parse(statusText) : statusJson?.result || statusJson;

    const cleanEmail = String(statusParsed?.email || "").toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Google 계정 이메일을 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    const name = String(statusParsed?.name || cleanEmail.split("@")[0]).trim();
    const image = String(
      statusParsed?.picture || "https://lh3.googleusercontent.com/a/default-user=s96-c"
    ).trim();
    const userId = `google_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const now = new Date().toISOString();

    // 3. sheetbot_users 및 sheetbot_user_api_keys에 visitor_session_id 동기(Synchronous) 저장
    const existingUserRes = await queryTable("sheetbot_users", {
      filters: { email: cleanEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const existingUser = (existingUserRes.rows || []).find((r: any) => !r.deleted_at);
    if (existingUser) {
      await updateRows(
        "sheetbot_users",
        {
          last_login_at: now,
          updated_at: now,
          name: name || existingUser.name,
          visitor_session_id: sessionId,
        },
        { filters: { id: String(existingUser.id) } }
      ).catch((err) => console.warn("[MobileGoogleOAuth] user update warning:", err));
    } else {
      await insertRows("sheetbot_users", [
        {
          id: userId,
          uuid: crypto.randomUUID(),
          email: cleanEmail,
          name,
          role: "USER",
          status: "ACTIVE",
          tier: "FREE",
          created_at: now,
          last_login_at: now,
          updated_at: now,
          visitor_session_id: sessionId,
        },
      ]).catch((err) => console.warn("[MobileGoogleOAuth] user insert warning:", err));
    }

    await syncVisitorSessionToUser(cleanEmail, sessionId).catch(() => {});
    await getOrCreateUserWallet(cleanEmail).catch(() => {});

    if (refCode && refCode.length >= 2) {
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
      await processReferralReward({
        inviterCodeOrEmail: refCode,
        inviteeEmail: cleanEmail,
        deviceId: `mobile_oauth_${cleanEmail}`,
        ipAddress: ip,
        channel: "MOBILE_AGENT",
      }).catch(() => {});
    }

    // 4. 앱 복귀용 페어링 토큰/핀코드 및 sheetbot://pair 딥링크 생성
    const secretKey = process.env.NEXTAUTH_SECRET || "sheetbot-agent2-secret-key-2026";
    const todayStr = new Date().toISOString().slice(0, 10);
    const pairToken = crypto
      .createHmac("sha256", secretKey)
      .update(`${cleanEmail}-${todayStr}`)
      .digest("hex")
      .slice(0, 16);

    const pinHash = crypto.createHash("md5").update(`${cleanEmail}-${pairToken}`).digest("hex");
    const pinCode = "SB-" + ((parseInt(pinHash.slice(0, 6), 16) % 900000) + 100000);

    const deepLinkUri = `sheetbot://pair?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(pairToken)}&pin=${encodeURIComponent(pinCode)}&sid=${encodeURIComponent(sessionId)}`;

    // 5. NextAuth 쿠키도 함께 발급하여 웹 대시보드 접근도 즉시 허용
    const jwtSecret = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";
    const maxAge = 30 * 24 * 60 * 60;
    const sessionToken = await encode({
      token: { id: userId, sub: userId, name, email: cleanEmail, picture: image },
      secret: jwtSecret,
      maxAge,
    });

    const response = NextResponse.json({
      success: true,
      email: cleanEmail,
      name,
      visitorSessionId: sessionId,
      token: pairToken,
      pinCode,
      deepLinkUri,
    });

    const cookieOptions = {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
    };
    response.cookies.set("next-auth.session-token", sessionToken, cookieOptions);
    response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
      ...cookieOptions,
      secure: true,
    });

    return response;
  } catch (err: any) {
    console.error("[MobileGoogleOAuth-Complete] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "모바일 Google 연동 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
