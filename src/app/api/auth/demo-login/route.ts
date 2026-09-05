import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || "test.user@sheetbot.dev").toLowerCase().trim();
    const name = body.name || "테스트 유저";
    const id = `demo_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

    const secret = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";

    const token = {
      id,
      sub: id,
      name,
      email,
      picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
    };

    const maxAge = 30 * 24 * 60 * 60; // 30일
    const sessionToken = await encode({
      token,
      secret,
      maxAge,
    });

    const response = NextResponse.json({
      success: true,
      user: { id, name, email },
    });

    const cookieOptions = {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false, // 로컬 및 프록시 환경 모두 호환되도록 일반 쿠키 및 보안 쿠키 모두 제공
    };

    // 일반 및 Secure 세션 쿠키 모두 구워 어떤 환경(HTTP/HTTPS/터널)에서도 인식되도록 보장
    response.cookies.set("next-auth.session-token", sessionToken, cookieOptions);
    response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
      ...cookieOptions,
      secure: true,
    });

    return response;
  } catch (err: any) {
    console.error("Demo login error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create demo session" },
      { status: 500 }
    );
  }
}
