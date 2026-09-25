import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true, message: "Logged out successfully" });

  const cookieNames = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "egdesk_visitor_session",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url",
  ];

  // 가능한 모든 path에 대해 쿠키 파기 헤더 주입
  const paths = ["/", "/t/mcp-server-fxkud1/p/SheetBot", "/api/auth"];

  for (const name of cookieNames) {
    for (const p of paths) {
      // 1. 일반 쿠키 만료
      response.cookies.set(name, "", {
        path: p,
        expires: new Date(0),
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      });
      // 2. Secure 쿠키 만료 (HTTPS)
      response.cookies.set(name, "", {
        path: p,
        expires: new Date(0),
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      });
    }
  }

  return response;
}

