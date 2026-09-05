import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true, message: "Logged out successfully" });

  const expireCookie = (name: string) => {
    response.cookies.set(name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  };

  // NextAuth 세션 토큰만 안전하게 파기 (CSRF 토큰은 보존하여 재로그인 시 충돌 방지)
  response.cookies.set("next-auth.session-token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  response.cookies.set("__Secure-next-auth.session-token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });

  return response;
}
