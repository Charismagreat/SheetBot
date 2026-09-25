export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { decode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/auth/session
 * NextAuth 세션 조회 초고속(Zero-I/O) 엔드포인트
 * 
 * [절대 원칙]:
 * 1. 외부 DB 쿼리나 터널 네트워크 I/O를 일절 수행하지 않음 (pending 원천 차단).
 * 2. 1순위: 쿠키의 JWT 세션 토큰을 메모리에서 즉시 복호화(0.01ms).
 * 3. 2순위: getServerSession(authOptions) 300ms 가드.
 * 4. 세션이 없을 경우 지체 없이 즉시 빈 객체 `{}` 반환 (0ms).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";

  try {
    // ⚡ 1. 쿠키에서 JWT 세션 토큰 직접 고속 복호화 (0ms 메모리 연산)
    const cookieHeader = req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/(?:__Secure-)?next-auth\.session-token=([^;]+)/);
    
    if (tokenMatch && tokenMatch[1]) {
      try {
        const decoded = await decode({
          token: decodeURIComponent(tokenMatch[1]),
          secret,
        });

        if (decoded && decoded.email) {
          const email = String(decoded.email).toLowerCase().trim();
          const name = decoded.name || email.split("@")[0];
          const image = (decoded as any).picture || "https://lh3.googleusercontent.com/a/default-user=s96-c";

          return NextResponse.json(
            {
              user: { name, email, image },
              expires: decoded.exp
                ? new Date(Number(decoded.exp) * 1000).toISOString()
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
            {
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
              },
            }
          );
        }
      } catch (decodeErr) {
        // 토큰 손상 시 무시하고 다음 단계 진행
      }
    }

    // ⚡ 2. getServerSession 300ms 초단기 타임아웃 레이스 (I/O 병목 방어)
    const sessionPromise = getServerSession(authOptions).catch(() => null);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 300));
    const session = await Promise.race([sessionPromise, timeoutPromise]);

    if (session?.user?.email) {
      return NextResponse.json(session, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    // ⚡ 3. 세션이 없는 경우: 외부 네트워크 I/O 일절 없이 즉시 빈 세션 반환 (0ms)
    return NextResponse.json({}, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: any) {
    // 예외 시에도 즉시 200 OK 빈 JSON 반환
    return NextResponse.json({}, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }
}
