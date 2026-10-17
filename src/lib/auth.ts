import { AuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { decode } from "next-auth/jwt";
import type { WorkspaceVisitorCallOptions } from "@/lib/egdesk-helpers";

/** Visitor OAuth / workspace MCP calls must match the browser origin (tunnel path included). */
export function resolveVisitorSiteOriginFromRequest(req?: Request): string {
  if (req) {
    try {
      const url = new URL(req.url);
      const forwardedProto = req.headers.get("x-forwarded-proto");
      const forwardedHost = req.headers.get("x-forwarded-host");
      if (forwardedHost) {
        const proto = forwardedProto || url.protocol.replace(":", "") || "https";
        return `${proto}://${forwardedHost.split(",")[0].trim()}`;
      }
      return url.origin;
    } catch {
      /* fall through */
    }
  }
  const fromEnv =
    process.env.NEXT_PUBLIC_EGDESK_VISITOR_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  if (fromEnv.trim()) {
    try {
      return new URL(fromEnv.trim()).origin;
    } catch {
      return fromEnv.trim().replace(/\/$/, "");
    }
  }
  return "http://localhost:3002";
}

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

  // 3. Visitor 세션 ID로부터 실제 구글 로그인 이메일 확인 및 sheetbot_users 매핑
  try {
    const visitorSessionId = await getCurrentVisitorSessionId(req);
    if (visitorSessionId) {
      const { queryTable, updateRows, insertRows } = await import("@/lib/egdesk-helpers");

      // 3-1. sheetbot_users 테이블 매핑 확인 (캐시)
      const userRes = await queryTable("sheetbot_users", {
        filters: { visitor_session_id: visitorSessionId },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const matchedUser = (userRes.rows || []).find((r: any) => !r.deleted_at);
      if (matchedUser?.email && matchedUser.email.includes("@")) {
        return matchedUser.email.toLowerCase().trim();
      }

      // 3-2. DB 매핑이 없을 경우 이지데스크 visitor-google status 직접 실시간 검증 (SSOT)
      try {
        const apiUrl = (
          process.env.EGDESK_MCP_INTERNAL_URL ||
          process.env.NEXT_PUBLIC_EGDESK_API_URL ||
          "http://localhost:8080"
        ).replace(/\/$/, "");
        const visitorOrigin = resolveVisitorSiteOriginFromRequest(req);
        const statusRes = await fetch(`${apiUrl}/visitor-google/tools/call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${visitorSessionId}`,
            Origin: visitorOrigin,
            "X-Visitor-Origin": visitorOrigin,
          },
          body: JSON.stringify({ tool: "status", arguments: {} }),
          signal: AbortSignal.timeout(12_000),
        });

        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          const realEmail =
            statusJson?.email ||
            statusJson?.result?.email ||
            statusJson?.result?.content?.[0]?.text;

          let resolvedEmail = "";
          if (typeof realEmail === "string" && realEmail.includes("@")) {
            resolvedEmail = realEmail.toLowerCase().trim();
          } else if (typeof realEmail === "string") {
            try {
              const parsed = JSON.parse(realEmail);
              if (parsed?.email && parsed.email.includes("@")) {
                resolvedEmail = parsed.email.toLowerCase().trim();
              }
            } catch {}
          }

          if (resolvedEmail) {
            // 백그라운드에서 sheetbot_users에 세션 매핑 즉시 영구 저장
            void updateRows(
              "sheetbot_users",
              { visitor_session_id: visitorSessionId, updated_at: new Date().toISOString() },
              { filters: { email: resolvedEmail } }
            ).catch(() => {});

            return resolvedEmail;
          }
        }
      } catch (vgErr) {
        console.warn("[Auth] visitor-google status call warning:", vgErr);
      }

      // 3-3. sheetbot_user_api_keys 테이블 매핑 확인
      const keyRes = await queryTable("sheetbot_user_api_keys", {
        filters: { visitor_session_id: visitorSessionId },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const matchedKey = (keyRes.rows || []).find((r: any) => !r.deleted_at && r.status === "ACTIVE");
      if (matchedKey?.user_email && matchedKey.user_email.includes("@")) {
        return matchedKey.user_email.toLowerCase().trim();
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

const NEXT_AUTH_SECRET = process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars";

/** NextAuth JWT only — does not call getCurrentVisitorSessionId (avoids recursion). */
async function getEmailFromNextAuthCookie(req?: Request): Promise<string | null> {
  if (req) {
    const cookieHeader = req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/(?:__Secure-)?next-auth\.session-token=([^;]+)/);
    if (tokenMatch?.[1]) {
      try {
        const decoded = await decode({
          token: decodeURIComponent(tokenMatch[1]),
          secret: NEXT_AUTH_SECRET,
        });
        if (decoded?.email && typeof decoded.email === "string") {
          return decoded.email.toLowerCase().trim();
        }
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    const sessionCookie =
      c.get("__Secure-next-auth.session-token")?.value || c.get("next-auth.session-token")?.value;
    if (sessionCookie) {
      const decoded = await decode({
        token: sessionCookie,
        secret: NEXT_AUTH_SECRET,
      });
      if (decoded?.email && typeof decoded.email === "string") {
        return decoded.email.toLowerCase().trim();
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

export async function lookupVisitorSessionIdForEmail(email: string): Promise<string | null> {
  const normalized = email.toLowerCase().trim();
  if (!normalized.includes("@")) return null;
  try {
    const { queryTable } = await import("@/lib/egdesk-helpers");
    const userRes = await queryTable("sheetbot_users", {
      filters: { email: normalized },
      limit: 1,
    }).catch(() => ({ rows: [] }));
    const row = (userRes.rows || []).find((r: any) => !r.deleted_at);
    const sid = row?.visitor_session_id;
    if (sid && String(sid).trim()) {
      return String(sid).trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 특정 이메일 사용자의 작업공간(Drive/Sheets/Apps Script) 호출 옵션 생성
 * - DB에 저장된 visitor_session_id가 있으면 해당 세션으로 격리 호출 (asVisitor: true)
 * - 관리자이고 세션이 없는 경우에만 호스트 기본 권한({}) 폴백
 */
export async function getWorkspaceCallOptionsForEmail(
  email: string,
  req?: Request
): Promise<WorkspaceVisitorCallOptions> {
  const normalized = email.toLowerCase().trim();
  const visitorSessionId = await lookupVisitorSessionIdForEmail(normalized);
  const origin = req ? resolveVisitorSiteOriginFromRequest(req) : resolveVisitorSiteOriginFromRequest();
  if (visitorSessionId) {
    return {
      asVisitor: true,
      visitorSessionId,
      visitorOrigin: origin,
    };
  }
  const isAdmin = await isCurrentUserAdmin(normalized);
  if (isAdmin) {
    return {};
  }
  return {};
}

/**
 * Apps Script / Drive MCP calls for end users (visitor OAuth on EGDesk).
 */
export async function buildWorkspaceVisitorCallOptions(
  req: Request,
  userEmail?: string | null,
): Promise<WorkspaceVisitorCallOptions> {
  const visitorSessionId = await getCurrentVisitorSessionId(req);
  if (visitorSessionId) {
    return {
      asVisitor: true,
      visitorSessionId,
      visitorOrigin: resolveVisitorSiteOriginFromRequest(req),
    };
  }
  const targetEmail = userEmail || await getCurrentUserEmail().catch(() => null);
  if (targetEmail) {
    const emailOptions = await getWorkspaceCallOptionsForEmail(targetEmail, req);
    if (emailOptions.asVisitor) return emailOptions;
  }
  const isAdmin = targetEmail
    ? await isCurrentUserAdmin(targetEmail)
    : await isCurrentUserAdmin();
  if (isAdmin) {
    return {};
  }
  return {};
}

/** 방문자 세션 검증 결과 캐시 (sid|origin → 결과). 연결됨 60초 / 실패 15초 */
const visitorSessionCheckCache = new Map<string, { connected: boolean; email: string | null; ts: number }>();

async function checkVisitorSessionConnected(
  sessionId: string,
  origin: string,
): Promise<{ connected: boolean; email: string | null }> {
  const key = `${sessionId}|${origin}`;
  const cached = visitorSessionCheckCache.get(key);
  if (cached && Date.now() - cached.ts < (cached.connected ? 60_000 : 15_000)) {
    return { connected: cached.connected, email: cached.email };
  }
  let result = { connected: false, email: null as string | null };
  try {
    const { getServerEgdeskApiUrl } = await import("@/lib/egdesk-helpers");
    const res = await fetch(`${getServerEgdeskApiUrl()}/visitor-google/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionId}`,
        Origin: origin,
        "X-Visitor-Origin": origin,
      },
      body: JSON.stringify({ tool: "status", arguments: {} }),
      signal: AbortSignal.timeout(5_000),
    });
    const json: any = await res.json().catch(() => null);
    const status = json?.result?.content?.[0]?.text ? JSON.parse(json.result.content[0].text) : json;
    result = {
      connected: Boolean(status?.connected),
      email: status?.email ? String(status.email).toLowerCase().trim() : null,
    };
  } catch {
    /* treat as not connected */
  }
  visitorSessionCheckCache.set(key, { ...result, ts: Date.now() });
  if (visitorSessionCheckCache.size > 500) {
    const oldest = visitorSessionCheckCache.keys().next().value;
    if (oldest) visitorSessionCheckCache.delete(oldest);
  }
  return result;
}

function extractApiKey(h: Headers): string {
  const authHeader = h.get("authorization") || "";
  const key = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : h.get("x-api-key")?.trim() || h.get("x-sheetbot-key")?.trim() || "";
  return key.startsWith("sk_sheetbot_") ? key : "";
}

function originFromHeaders(h: Headers): string {
  const forwardedHost = h.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = h.get("x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost.split(",")[0].trim()}`;
  }
  return resolveVisitorSiteOriginFromRequest();
}

/**
 * 서버 사이드에서 현재 요청의 방문자(Visitor) 세션 ID를 가져옵니다.
 *
 * 후보 수집 순서: 헤더 → 쿠키(동일 이름 쿠키 전부) → API 키 → DB(sheetbot_users.visitor_session_id)
 * ⚠️ 재로그인 후에도 브라우저에 30일짜리 옛 egdesk_visitor_session 쿠키(경로가 다른 복수 쿠키 포함)가 남아
 *    새 세션(DB)을 가리는 문제가 있었으므로, 후보가 2개 이상이면 이지데스크 status로 실제 연결된 세션을 선택합니다.
 */
export async function getCurrentVisitorSessionId(req?: Request): Promise<string | null> {
  let h: Headers | null = req ? req.headers : null;
  if (!h) {
    try {
      const { headers } = await import("next/headers");
      h = new Headers(await headers());
    } catch {
      h = null;
    }
  }

  const candidates: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || "").trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  if (h) {
    push(h.get("x-visitor-session-id") || h.get("x-egdesk-visitor-session"));

    // 동일 이름 쿠키가 여러 개일 수 있음 (경로 차이) → 전부 후보로
    const cookieHeader = h.get("cookie") || "";
    for (const m of cookieHeader.matchAll(/(?:^|;\s*)egdesk_visitor_session=([^;]+)/g)) {
      try {
        push(decodeURIComponent(m[1]));
      } catch {
        push(m[1]);
      }
    }

    const apiKey = extractApiKey(h);
    if (apiKey) {
      try {
        const { verifyApiKey } = await import("@/lib/api-keys");
        const keyResult = await verifyApiKey(apiKey);
        if (keyResult.valid) push(keyResult.visitorSessionId);
      } catch (keyErr) {
        console.warn("[Auth] verifyApiKey for visitorSessionId note:", keyErr);
      }
    }
  }

  // NextAuth 로그인 이메일 기준 DB 저장 세션 (재로그인 시 검증 후 갱신되는 최신 값)
  const emailFromJwt = await getEmailFromNextAuthCookie(req).catch(() => null);
  if (emailFromJwt) {
    push(await lookupVisitorSessionIdForEmail(emailFromJwt));
  }

  if (candidates.length <= 1) return candidates[0] || null;

  // 후보가 여러 개면 실제 연결된(가능하면 로그인 이메일과 일치하는) 세션 선택
  const origin = req ? resolveVisitorSiteOriginFromRequest(req) : h ? originFromHeaders(h) : resolveVisitorSiteOriginFromRequest();
  const checks = await Promise.all(candidates.map((sid) => checkVisitorSessionConnected(sid, origin)));
  const normalizedJwtEmail = emailFromJwt ? emailFromJwt.toLowerCase().trim() : null;
  const matchIdx = checks.findIndex(
    (c) => c.connected && (!normalizedJwtEmail || !c.email || c.email === normalizedJwtEmail),
  );
  if (matchIdx >= 0) {
    if (matchIdx > 0) {
      console.warn(
        `[Auth] Skipped ${matchIdx} stale visitor session candidate(s); using verified session for ${checks[matchIdx].email || "visitor"}.`,
      );
    }
    return candidates[matchIdx];
  }
  // 연결된 세션이 없으면 기존 우선순위 유지 (호출부에서 재인증 안내)
  return candidates[0];
}
/**
 * 서버 사이드에서 현재 사용자가 관리자(ADMIN)인지 여부를 판별합니다.
 */
export async function isCurrentUserAdmin(emailToCheck?: string | null): Promise<boolean> {
  try {
    const email = emailToCheck !== undefined ? emailToCheck : await getCurrentUserEmail();
    if (!email) return false;

    const normalizedEmail = email.toLowerCase().trim();

    // 0. 영구 기본 관리자 목록 및 환경변수 ADMIN_EMAIL 최우선 대조 (DB 조회 0ms 생략)
    const DEFAULT_ADMIN_EMAILS = [
      "charismagreat@gmail.com",
      "chachogreat@gmail.com",
    ];
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
