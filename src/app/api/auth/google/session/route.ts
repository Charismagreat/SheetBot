export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { queryTable, insertRows, updateRows, getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getOrCreateUserWallet } from "@/lib/token-wallet";
import { resolveVisitorSiteOriginFromRequest } from "@/lib/auth";

/** 이지데스크 visitor-google status로 세션이 실제 연결 상태이며 동일 이메일인지 검증 */
async function verifyVisitorSession(sessionId: string, email: string, siteOrigin: string): Promise<boolean> {
  try {
    const res = await fetch(`${getServerEgdeskApiUrl()}/visitor-google/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionId}`,
        Origin: siteOrigin,
        "X-Visitor-Origin": siteOrigin,
      },
      body: JSON.stringify({ tool: "status", arguments: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await res.json().catch(() => null);
    const status = json?.result?.content?.[0]?.text ? JSON.parse(json.result.content[0].text) : json;
    return Boolean(
      status?.connected && String(status?.email || "").toLowerCase().trim() === email.toLowerCase().trim(),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let email = body.email ? String(body.email).toLowerCase().trim() : "";
    let name = body.name ? String(body.name).trim() : "";
    let image = body.image ? String(body.image).trim() : "";
    let visitorSessionId = body.visitorSessionId ? String(body.visitorSessionId).trim() : "";

    // 이메일 유효성 검증
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "유효한 Google 계정 이메일을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    if (!name) {
      name = email.split("@")[0];
    }
    if (!image) {
      image = "https://lh3.googleusercontent.com/a/default-user=s96-c";
    }

    const userId = `google_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const now = new Date().toISOString();

    // ⚡ 1. NextAuth JWT 세션 토큰 초고속 생성 (0ms 메모리 연산)
    const secret = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";
    const token = {
      id: userId,
      sub: userId,
      name,
      email,
      picture: image,
    };

    const maxAge = 30 * 24 * 60 * 60; // 30일
    const sessionToken = await encode({
      token,
      secret,
      maxAge,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: userId, name, email, image },
    });

    const cookieOptions = {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
    };

    // 일반 및 Secure 세션 쿠키 모두 설정 (터널링 / HTTPS / 로컬 모두 지원)
    response.cookies.set("next-auth.session-token", sessionToken, cookieOptions);
    response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
      ...cookieOptions,
      secure: true,
    });

    // ⚡ 2. 회원 동기화 및 지갑 확보는 백그라운드 비동기로 안전하게 처리 (HTTP 응답 블로킹 차단)
    const siteOrigin = resolveVisitorSiteOriginFromRequest(req);
    void (async () => {
      try {
        await setupDatabase();

        // 🛡️ 클라이언트가 보낸 방문자 세션 ID는 이지데스크에서 실제 연결 + 동일 이메일임이 확인된 경우에만 저장
        //    (만료된 세션 저장 방지 + 타 회원 세션 덮어쓰기 차단)
        if (visitorSessionId) {
          const verified = await verifyVisitorSession(visitorSessionId, email, siteOrigin);
          if (!verified) {
            console.warn(`[GoogleSession] visitorSessionId not verified for ${email} (origin=${siteOrigin}); not persisting.`);
            visitorSessionId = "";
          }
        }

        const existingUserRes = await queryTable("sheetbot_users", {
          filters: { email },
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
              ...(visitorSessionId ? { visitor_session_id: visitorSessionId } : {}),
            },
            { filters: { id: String(existingUser.id) } }
          ).catch((err) => console.warn("Update user login time error:", err));
        } else {
          await insertRows("sheetbot_users", [
            {
              id: userId,
              uuid: crypto.randomUUID(),
              email,
              name,
              role: "USER",
              status: "ACTIVE",
              tier: "FREE",
              created_at: now,
              last_login_at: now,
              updated_at: now,
              visitor_session_id: visitorSessionId || null,
            },
          ]).catch((err) => console.warn("Insert new user error:", err));
        }

        if (visitorSessionId) {
          const { syncVisitorSessionToUser } = await import("@/lib/api-keys");
          await syncVisitorSessionToUser(email, visitorSessionId);
        }

        await getOrCreateUserWallet(email).catch((err) =>
          console.warn("Wallet creation warning:", err)
        );
      } catch (dbErr) {
        console.warn("Background DB user sync non-fatal error:", dbErr);
      }
    })();

    // 클라이언트에는 0.05초 만에 세션 쿠키를 즉시 반환하여 무한 pending 원천 차단!
    return response;
  } catch (err: any) {
    console.error("Google session creation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create Google session" },
      { status: 500 }
    );
  }
}
