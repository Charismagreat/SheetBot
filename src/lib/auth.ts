import { AuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { decode } from "next-auth/jwt";

export const authOptions: AuthOptions = {
  providers: [
    // 1. 실제 구글 계정 OAuth 로그인
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "dummy-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy-client-secret",
    }),
    // 2. EGDesk Google OAuth 통합 로그인
    CredentialsProvider({
      id: "google-login",
      name: "Google Account",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
        image: { label: "Image", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const email = credentials.email.toLowerCase().trim();
        const name = credentials.name || email.split("@")[0];
        const image = credentials.image || "https://lh3.googleusercontent.com/a/default-user=s96-c";
        return {
          id: `google_${email.replace(/[^a-zA-Z0-9]/g, "_")}`,
          name,
          email,
          image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // 상대 경로일 경우 원본 경로 유지 (NextAuth 기본 fallback으로 localhost:3000이 붙는 것을 방지)
      if (url.startsWith("/")) {
        return url;
      }
      // 터널링 서비스 및 신뢰할 수 있는 도메인 허용
      try {
        const parsed = new URL(url);
        if (
          parsed.origin === baseUrl ||
          parsed.hostname.includes("tunneling-service.onrender.com") ||
          parsed.hostname.includes("localhost") ||
          parsed.hostname.includes("127.0.0.1")
        ) {
          return url;
        }
      } catch {}
      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        if (user.image) token.picture = user.image;
        if (user.name) token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id || token.sub;
        session.user.email = token.email || session.user.email;
        if (token.name) session.user.name = token.name;
        if (token.picture) session.user.image = token.picture;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars",
};

/**
 * 서버 사이드에서 현재 로그인된 사용자의 이메일을 가져옵니다.
 * 터널링/역방향 프록시/서브패스 환경에서 세션 쿠키 유실을 방지하기 위해 다층 폴백을 제공합니다:
 * 1) getServerSession
 * 2) 직접 JWT 복호화 (next-auth.session-token 및 __Secure-next-auth.session-token)
 * 3) 요청 헤더 (x-sheetbot-user-email, x-user-email)
 * 4) 쿼리 파라미터 (userEmail)
 * 5) Visitor 세션 ID 매핑 (sheetbot_users 테이블)
 */
export async function getCurrentUserEmail(req?: Request): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";

  // 1. 전달된 Request 객체에서 쿼리 파라미터 및 헤더 초고속 확인 (0ms 즉시 반환)
  if (req) {
    try {
      const url = new URL(req.url);
      const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
      if (queryEmail && queryEmail.includes("@")) {
        return queryEmail.toLowerCase().trim();
      }
    } catch {}

    const headerEmail = req.headers.get("x-sheetbot-user-email") || req.headers.get("x-user-email");
    if (headerEmail && headerEmail.includes("@")) {
      return headerEmail.toLowerCase().trim();
    }

    // 쿠키에서 JWT 세션 토큰 직접 디코딩 (로컬 연산 0ms)
    const cookieHeader = req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/(?:__Secure-)?next-auth\.session-token=([^;]+)/);
    if (tokenMatch && tokenMatch[1]) {
      try {
        const decoded = await decode({
          token: decodeURIComponent(tokenMatch[1]),
          secret,
        });
        if (decoded?.email && typeof decoded.email === "string") {
          return decoded.email.toLowerCase().trim();
        }
      } catch (decodeErr) {
        console.warn("[Auth] Direct JWT decode error from req cookie:", decodeErr);
      }
    }
  }

  // 2. next/headers를 통한 헤더 및 JWT 쿠키 직접 디코딩 (로컬 연산 0ms)
  try {
    const { cookies, headers } = await import("next/headers");
    const h = await headers();
    const hEmail = h.get("x-sheetbot-user-email") || h.get("x-user-email");
    if (hEmail && hEmail.includes("@")) {
      return hEmail.toLowerCase().trim();
    }

    const c = await cookies();
    const sessionCookie =
      c.get("__Secure-next-auth.session-token")?.value ||
      c.get("next-auth.session-token")?.value;

    if (sessionCookie) {
      try {
        const decoded = await decode({
          token: sessionCookie,
          secret,
        });
        if (decoded?.email && typeof decoded.email === "string") {
          return decoded.email.toLowerCase().trim();
        }
      } catch (decodeErr) {
        console.warn("[Auth] Direct JWT decode error from cookies():", decodeErr);
      }
    }
  } catch {}

  // 3. Visitor 세션 ID로부터 sheetbot_users 매핑 이메일 확인
  try {
    const visitorSessionId = await getCurrentVisitorSessionId(req);
    if (visitorSessionId) {
      const { queryTable } = await import("@/lib/egdesk-helpers");
      const userRes = await queryTable("sheetbot_users", {
        filters: { visitor_session_id: visitorSessionId },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const matchedUser = (userRes.rows || []).find((r: any) => !r.deleted_at);
      if (matchedUser?.email && matchedUser.email.includes("@")) {
        return matchedUser.email.toLowerCase().trim();
      }
    }
  } catch {}

  // 4. 마지막 폴백: 쿠키가 존재할 때만 500ms 타임아웃 제한 하에 getServerSession 시도
  try {
    const sessionPromise = getServerSession(authOptions);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
    const session = await Promise.race([sessionPromise, timeoutPromise]);
    if (session?.user?.email) {
      return session.user.email.toLowerCase().trim();
    }
  } catch {}

  return null;
}

/**
 * 서버 사이드에서 현재 요청의 방문자(Visitor) 세션 ID를 가져옵니다.
 * Request 객체가 전달되면 요청 헤더/쿠키에서, 없으면 next/headers에서 추출합니다.
 */
export async function getCurrentVisitorSessionId(req?: Request): Promise<string | null> {
  // 1. 전달된 Request 객체가 있는 경우 헤더와 쿠키에서 추출
  if (req) {
    const fromHeader = req.headers.get("x-visitor-session-id") || req.headers.get("x-egdesk-visitor-session");
    if (fromHeader) return fromHeader.trim();

    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/egdesk_visitor_session=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }

    // API Key (Authorization: Bearer sk_sheetbot_... 또는 x-api-key)가 있는 경우 DB에서 visitorSessionId 자동 추출
    const authHeader = req.headers.get("authorization") || "";
    let apiKey = "";
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else {
      apiKey = req.headers.get("x-api-key")?.trim() || req.headers.get("x-sheetbot-key")?.trim() || "";
    }

    if (apiKey && apiKey.startsWith("sk_sheetbot_")) {
      try {
        const { verifyApiKey } = await import("@/lib/api-keys");
        const keyResult = await verifyApiKey(apiKey);
        if (keyResult.valid && keyResult.visitorSessionId) {
          return keyResult.visitorSessionId;
        }
      } catch (keyErr) {
        console.warn("[Auth] verifyApiKey for visitorSessionId note:", keyErr);
      }
    }
  }

  // 2. next/headers를 통한 서버 컴포넌트/라우트 핸들러 추출
  try {
    const { cookies, headers } = await import("next/headers");
    const h = await headers();
    const headerVal = h.get("x-visitor-session-id") || h.get("x-egdesk-visitor-session");
    if (headerVal) return headerVal.trim();

    const c = await cookies();
    const cookieVal = c.get("egdesk_visitor_session")?.value;
    if (cookieVal) return decodeURIComponent(cookieVal).trim();

    // 헤더에 API Key가 있는지 확인
    const authHeader = h.get("authorization") || "";
    let apiKey = "";
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else {
      apiKey = h.get("x-api-key")?.trim() || h.get("x-sheetbot-key")?.trim() || "";
    }

    if (apiKey && apiKey.startsWith("sk_sheetbot_")) {
      const { verifyApiKey } = await import("@/lib/api-keys");
      const keyResult = await verifyApiKey(apiKey);
      if (keyResult.valid && keyResult.visitorSessionId) {
        return keyResult.visitorSessionId;
      }
    }
  } catch {}

  return null;
}

/**
 * 서버 사이드에서 현재 사용자가 관리자(ADMIN)인지 여부를 판별합니다.
 */
export async function isCurrentUserAdmin(emailToCheck?: string | null): Promise<boolean> {
  try {
    const email = emailToCheck !== undefined ? emailToCheck : await getCurrentUserEmail();
    if (!email) return false;

    const normalizedEmail = email.toLowerCase().trim();

    // 0. 영구 기본 관리자 목록 (chachogreat@gmail.com 등) 및 환경변수 ADMIN_EMAIL 최우선 대조 (DB 조회 0ms 생략)
    const DEFAULT_ADMIN_EMAILS = ["chachogreat@gmail.com", "charismagreat@gmail.com"];
    const envAdminEmail = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";
    const adminList = [
      ...DEFAULT_ADMIN_EMAILS,
      ...envAdminEmail.split(",").map((e) => e.toLowerCase().trim()).filter(Boolean),
    ];
    if (adminList.includes(normalizedEmail)) {
      return true;
    }

    // 1. sheetbot_users 및 sheetbot_settings DB 확인 (1.5초 타임아웃 안전망 적용하여 무한 행 차단)
    const dbCheckPromise = (async () => {
      const { queryTable } = await import("@/lib/egdesk-helpers");

      // 유저 테이블 role === 'ADMIN' 확인
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: normalizedEmail },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (userRes.rows && userRes.rows.length > 0) {
        const user = userRes.rows[0];
        if (user.role === "ADMIN") return true;
      }

      // 관리자 설정(sheetbot_smtp_settings) 대조
      const settingsRes = await queryTable("sheetbot_settings", {
        limit: 10,
      }).catch(() => ({ rows: [] }));

      for (const r of settingsRes.rows || []) {
        if (r.key === "sheetbot_smtp_settings" && r.value) {
          try {
            const parsed = JSON.parse(r.value);
            if (parsed.adminEmail && parsed.adminEmail.toLowerCase().trim() === normalizedEmail) return true;
            if (parsed.user && parsed.user.toLowerCase().trim() === normalizedEmail) return true;
          } catch {}
        }
      }
      return false;
    })();

    const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500));
    return await Promise.race([dbCheckPromise, timeoutPromise]);
  } catch (err) {
    console.warn("isCurrentUserAdmin check warning:", err);
  }
  return false;
}

/**
 * 현재 요청 사용자가 관리자 권한을 가졌는지 일괄 검증하는 편의 헬퍼
 */
export async function verifyAdminSession(): Promise<{ authorized: boolean; email: string | null }> {
  const email = await getCurrentUserEmail();
  if (!email) return { authorized: false, email: null };
  const isAdmin = await isCurrentUserAdmin(email);
  return { authorized: isAdmin, email };
}
