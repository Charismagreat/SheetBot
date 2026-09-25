"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  getVisitorGoogleStatus,
  startVisitorGoogleLogin,
  signOutVisitorGoogle,
} from "@/egdesk-visitor-google";
import { apiFetch, getEgdeskBasePath } from "@/lib/api";

export interface AuthUser {
  email: string;
  name: string;
  image: string;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (options?: { next?: string; forceConsent?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const DEFAULT_ADMIN_EMAILS = [
  "charismagreat@gmail.com",
  "chachogreat@gmail.com",
];

export function useAuth(): UseAuthReturn {
  const { data: session, status: nextAuthStatus } = useSession();

  // ⚡ 1. 브라우저 캐시에서 즉시 복원하여 화면 깜빡임(Flicker) 원천 차단
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const email = localStorage.getItem("sheetbot_user_email");
      if (email && email.includes("@")) {
        const name = localStorage.getItem("sheetbot_user_name") || email.split("@")[0];
        const image =
          localStorage.getItem("sheetbot_user_image") ||
          "https://lh3.googleusercontent.com/a/default-user=s96-c";
        return { email: email.toLowerCase().trim(), name, image };
      }
    } catch {}
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (user?.email && DEFAULT_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return true;
    }
    return false;
  });

  // 관리자 여부 확인 로직
  const checkAdminStatus = useCallback(async (email: string) => {
    const normalized = email.toLowerCase().trim();
    if (DEFAULT_ADMIN_EMAILS.includes(normalized)) {
      setIsAdmin(true);
      return;
    }
    try {
      const res = await apiFetch("/api/admin/check");
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setIsAdmin(Boolean(data.isAdmin));
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // ⚡ 2. 이지데스크 터널 구글 로그인 상태 + NextAuth 세션 종합 동기화
  const refreshAuth = useCallback(async () => {
    try {
      // 1순위: 이지데스크 터널을 통한 구글 로그인 상태 확인
      const statusRes = await getVisitorGoogleStatus();

      if (statusRes?.connected && statusRes.email) {
        const email = statusRes.email.toLowerCase().trim();
        const name = (statusRes as any).name || email.split("@")[0];
        const image =
          (statusRes as any).picture ||
          "https://lh3.googleusercontent.com/a/default-user=s96-c";

        const syncedUser: AuthUser = { email, name, image };
        setUser(syncedUser);

        // 로컬 스토리지 캐시 최신화
        if (typeof window !== "undefined") {
          localStorage.setItem("sheetbot_user_email", email);
          localStorage.setItem("sheetbot_user_name", name);
          localStorage.setItem("sheetbot_user_image", image);

          // 쿠키에도 egdesk_visitor_session 유지
          const sessId = localStorage.getItem("egdesk_visitor_session");
          if (sessId) {
            const isSecure = window.location.protocol === "https:";
            document.cookie = `egdesk_visitor_session=${encodeURIComponent(
              sessId
            )}; path=/; max-age=2592000; SameSite=Lax${isSecure ? "; Secure" : ""}`;
          }
        }

        // NextAuth 세션이 비어있는 경우 백그라운드 무소음 발급 (호환성 유지)
        if (!session?.user?.email) {
          try {
            await signIn("google-login", {
              redirect: false,
              email,
              name,
              image,
            });
          } catch (e) {
            console.warn("[useAuth] Silent NextAuth sign-in note:", e);
          }
        }

        void checkAdminStatus(email);
        setIsLoading(false);
        return;
      }

      // 2순위: NextAuth 세션 확인 (혹시 이지데스크 상태가 일시 지연되었을 때)
      if (session?.user?.email) {
        const email = session.user.email.toLowerCase().trim();
        const name = session.user.name || email.split("@")[0];
        const image =
          session.user.image ||
          "https://lh3.googleusercontent.com/a/default-user=s96-c";

        const nextUser: AuthUser = { email, name, image };
        setUser(nextUser);

        if (typeof window !== "undefined") {
          localStorage.setItem("sheetbot_user_email", email);
          localStorage.setItem("sheetbot_user_name", name);
          localStorage.setItem("sheetbot_user_image", image);
        }

        void checkAdminStatus(email);
        setIsLoading(false);
        return;
      }

      // 3순위: 로컬스토리지에 이메일 정보가 아직 남아있는 경우 (유예)
      if (typeof window !== "undefined") {
        const cachedEmail = localStorage.getItem("sheetbot_user_email");
        if (cachedEmail && cachedEmail.includes("@")) {
          const email = cachedEmail.toLowerCase().trim();
          const name = localStorage.getItem("sheetbot_user_name") || email.split("@")[0];
          const image =
            localStorage.getItem("sheetbot_user_image") ||
            "https://lh3.googleusercontent.com/a/default-user=s96-c";
          setUser({ email, name, image });
          void checkAdminStatus(email);
          setIsLoading(false);
          return;
        }
      }

      // 인증 정보가 전혀 없는 경우
      setUser(null);
      setIsAdmin(false);
    } catch (err) {
      console.warn("[useAuth] refreshAuth warning:", err);
    } finally {
      setIsLoading(false);
    }
  }, [session, checkAdminStatus]);

  useEffect(() => {
    void refreshAuth();

    // 창 포커스 또는 커스텀 이벤트 수신 시 세션 재점검
    const handleAuthChange = () => {
      void refreshAuth();
    };

    window.addEventListener("sheetbot-auth-change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener("sheetbot-auth-change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, [refreshAuth]);

  // ⚡ 3. 단일 구글 로그인 함수 (이지데스크 터널 게이트웨이 호출)
  const login = useCallback(
    async (options?: { next?: string; forceConsent?: boolean }) => {
      const nextPath = options?.next || "/dashboard";
      await startVisitorGoogleLogin({
        next: nextPath,
        forceConsent: options?.forceConsent,
      });
    },
    []
  );

  // ⚡ 4. 단일 통합 로그아웃 함수 (이지데스크 + NextAuth + 쿠키 + 로컬스토리지 일괄 완전 파기)
  const logout = useCallback(async () => {
    setIsLoading(true);
    setUser(null);
    setIsAdmin(false);

    // 1) 이지데스크 세션 해제
    try {
      await signOutVisitorGoogle();
    } catch (e) {
      console.warn("[useAuth] signOutVisitorGoogle note:", e);
    }

    // 2) NextAuth 세션 해제
    try {
      await signOut({ redirect: false });
    } catch (e) {
      console.warn("[useAuth] signOut note:", e);
    }

    // 3) 백엔드 강제 로그아웃 API 호출 (서버 쿠키 파기)
    try {
      await apiFetch("/api/auth/force-logout", { method: "POST" });
    } catch {}

    // 4) 브라우저 로컬 저장소 및 캐시 완전 정리
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("sheetbot_user_email");
        localStorage.removeItem("sheetbot_user_name");
        localStorage.removeItem("sheetbot_user_image");
        localStorage.removeItem("egdesk_visitor_session");
        sessionStorage.clear();
      } catch {}

      // 5) 모든 인증 관련 쿠키 만료 처리
      const cookiesToClear = [
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
        "egdesk_visitor_session",
        "next-auth.callback-url",
        "__Secure-next-auth.callback-url",
      ];
      const basePath = getEgdeskBasePath();
      const paths = ["/", basePath, `${basePath}/`, "/api/auth"].filter(Boolean);

      cookiesToClear.forEach((name) => {
        paths.forEach((p) => {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p};`;
        });
      });

      // 전역 이벤트 알림
      window.dispatchEvent(new CustomEvent("sheetbot-auth-change"));

      // 홈으로 완전히 새로고침하며 강제 이동
      const dest = basePath ? `${basePath}/` : "/";
      window.location.replace(dest);
    }
  }, []);

  const isLoggedIn = Boolean(user && user.email);

  return {
    user,
    isLoggedIn,
    isLoading: isLoading && nextAuthStatus === "loading" && !user,
    isAdmin,
    login,
    logout,
    refreshAuth,
  };
}
