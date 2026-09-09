import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getOrCreateUserWallet } from "@/lib/token-wallet";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let email = body.email ? String(body.email).toLowerCase().trim() : "";
    let name = body.name ? String(body.name).trim() : "";
    let image = body.image ? String(body.image).trim() : "";

    // 이메일이 전달되지 않은 경우 에러 반환 (방문자 로그인에서 소유자 drive_auth_status fallback 차단)
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

    // 1. DB 초기화 및 회원 대장(sheetbot_users) 등록/갱신
    try {
      await setupDatabase();
      const existingUserRes = await queryTable("sheetbot_users", {
        filters: { email },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const existingUser = (existingUserRes.rows || []).find((r: any) => !r.deleted_at);

      if (existingUser) {
        // 기존 회원이면 last_login_at 갱신
        await updateRows(
          "sheetbot_users",
          {
            last_login_at: now,
            updated_at: now,
            name: name || existingUser.name,
          },
          { ids: [Number(existingUser.id) || existingUser.id] }
        ).catch((err) => console.warn("Update user login time error:", err));
      } else {
        // 신규 회원이면 등록
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
          },
        ]).catch((err) => console.warn("Insert new user error:", err));
      }

      // 2. 토큰 지갑 확보 (신규 시 웰컴 토큰 지급)
      await getOrCreateUserWallet(email).catch((err) =>
        console.warn("Wallet creation warning:", err)
      );
    } catch (dbErr) {
      console.warn("DB user sync non-fatal error:", dbErr);
    }

    // 3. NextAuth JWT 세션 토큰 생성
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

    return response;
  } catch (err: any) {
    console.error("Google session creation error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create Google session" },
      { status: 500 }
    );
  }
}
