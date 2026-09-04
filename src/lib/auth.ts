import { AuthOptions, getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: AuthOptions = {
  providers: [
    // 1. 실제 구글 계정 OAuth 로그인
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "dummy-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "dummy-client-secret",
    }),
    // 2. 개발 및 빠른 체험용 1초 데모 계정 로그인
    CredentialsProvider({
      id: "demo-login",
      name: "Demo Account",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "demo@example.com" },
        name: { label: "Name", type: "text", placeholder: "데모 사용자" },
      },
      async authorize(credentials) {
        const email = credentials?.email || "demo.user@gmail.com";
        const name = credentials?.name || "데모 사용자";
        return {
          id: `demo_${email.replace(/[^a-zA-Z0-9]/g, "_")}`,
          name,
          email,
          image: "https://lh3.googleusercontent.com/a/default-user=s96-c",
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id || token.sub;
        session.user.email = token.email || session.user.email;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "sheetbot_secret_2026_default_key_32chars",
};

/**
 * 서버 사이드에서 현재 로그인된 사용자의 이메일을 가져옵니다.
 * 비로그인 시 null을 반환합니다.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      return session.user.email;
    }
  } catch (err) {
    console.warn("getServerSession note:", err);
  }
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

    // 1. sheetbot_users 테이블에서 role === 'ADMIN' 여부 확인
    const { queryTable } = await import("@/lib/egdesk-helpers");
    const userRes = await queryTable("sheetbot_users", {
      filters: { email: normalizedEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (userRes.rows && userRes.rows.length > 0) {
      const user = userRes.rows[0];
      if (user.role === "ADMIN") return true;
    }

    // 2. 관리자 설정(sheetbot_sms_settings, sheetbot_smtp_settings)의 adminPhone / adminEmail 대조
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

    // 3. 환경변수 ADMIN_EMAIL 대조 (설정된 경우)
    const envAdminEmail = process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    if (envAdminEmail && envAdminEmail.toLowerCase().trim() === normalizedEmail) {
      return true;
    }
  } catch (err) {
    console.warn("isCurrentUserAdmin check warning:", err);
  }
  return false;
}
