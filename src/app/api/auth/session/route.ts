export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, getCurrentUserEmail } from "@/lib/auth";

/**
 * GET /api/auth/session
 * NextAuth 세션 조회 표준 엔드포인트 (CLIENT_FETCH_ERROR 원천 차단 및 순수 JSON 보장)
 */
export async function GET(req: NextRequest) {
  try {
    // 1. NextAuth 표준 세션 확인
    let session = await getServerSession(authOptions).catch(() => null);

    // 2. 만약 NextAuth 세션이 비어있다면 이지데스크 쿠키/헤더 기반 이메일 폴백 확인
    if (!session?.user?.email) {
      const email = await getCurrentUserEmail(req).catch(() => null);
      if (email) {
        session = {
          user: {
            name: email.split("@")[0],
            email: email,
            image: "https://lh3.googleusercontent.com/a/default-user=s96-c",
          },
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
      }
    }

    // 3. NextAuth 규격: 세션이 있으면 세션 객체, 없으면 빈 객체 {} 반환 (200 OK)
    return NextResponse.json(session || {}, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: any) {
    console.warn("[Auth-Session] Safe fallback error:", err.message);
    // 어떤 오류가 발생하더라도 HTML이 아닌 순수 JSON 반환
    return NextResponse.json({}, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }
}
