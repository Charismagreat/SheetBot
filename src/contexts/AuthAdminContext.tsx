"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { getVisitorGoogleStatus } from "@/egdesk-visitor-google";

export interface AuthAdminUser {
  email: string;
  name: string;
  image: string;
}

export interface AuthAdminContextValue {
  user: AuthAdminUser | null;
  userEmail: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  session?: any;
  refreshAdminStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const KNOWN_ADMINS = [
  "charismagreat@gmail.com",
  "chachogreat@gmail.com",
];

const AuthAdminContext = createContext<AuthAdminContextValue>({
  user: null,
  userEmail: "",
  isLoggedIn: false,
  isAdmin: false,
  isLoading: true,
  refreshAdminStatus: async () => {},
  logout: async () => {},
});

export function AuthAdminProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // ⚡ 1. 브라우저 캐시에서 즉시 복원하여 화면 깜빡임 0ms 차단
  const [user, setUser] = useState<AuthAdminUser | null>(() => {
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

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const cached = sessionStorage.getItem("sb_is_admin");
      if (cached === "true") return true;
    }
    const currentEmail = user?.email || "";
    return currentEmail ? KNOWN_ADMINS.includes(currentEmail.toLowerCase()) : false;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 관리자 검증 함수 (서버 API 단 1회 안전 검증)
  const refreshAdminStatus = useCallback(async () => {
    const currentEmail = (session?.user?.email || user?.email || "").toLowerCase().trim();
    if (!currentEmail) {
      setIsAdmin(false);
      return;
    }

    if (KNOWN_ADMINS.includes(currentEmail)) {
      setIsAdmin(true);
      if (typeof window !== "undefined") {
        try { sessionStorage.setItem("sb_is_admin", "true"); } catch {}
      }
      return;
    }

    try {
      const res = await apiFetch("/api/admin/check");
      const data = await res.json().catch(() => null);
      const isAdm = Boolean(data?.success && data?.isAdmin);
      setIsAdmin(isAdm);
      if (typeof window !== "undefined" && isAdm) {
        try { sessionStorage.setItem("sb_is_admin", "true"); } catch {}
      }
    } catch {
      setIsAdmin(false);
    }
  }, [session?.user?.email, user?.email]);

  // 세션 상태 동기화
  useEffect(() => {
    if (status === "loading") return;

    if (session?.user?.email) {
      const email = session.user.email.toLowerCase().trim();
      const name = session.user.name || email.split("@")[0];
      const image =
        session.user.image ||
        "https://lh3.googleusercontent.com/a/default-user=s96-c";

      const nextUser: AuthAdminUser = { email, name, image };
      setUser(nextUser);

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("sheetbot_user_email", email);
          localStorage.setItem("sheetbot_user_name", name);
          localStorage.setItem("sheetbot_user_image", image);
        } catch {}
      }

      if (KNOWN_ADMINS.includes(email)) {
        setIsAdmin(true);
        if (typeof window !== "undefined") {
          try { sessionStorage.setItem("sb_is_admin", "true"); } catch {}
        }
      } else {
        void refreshAdminStatus();
      }
      setIsLoading(false);
    } else {
      // NextAuth 세션이 아직 동기화되지 않았더라도 로컬스토리지에 유효한 회원 정보가 있으면 안전하게 유지
      let fallbackEmail: string | null = null;
      if (typeof window !== "undefined") {
        try {
          fallbackEmail = localStorage.getItem("sheetbot_user_email");
        } catch {}
      }

      if (fallbackEmail && fallbackEmail.includes("@")) {
        const email = fallbackEmail.toLowerCase().trim();
        const name =
          (typeof window !== "undefined" && localStorage.getItem("sheetbot_user_name")) ||
          email.split("@")[0];
        const image =
          (typeof window !== "undefined" && localStorage.getItem("sheetbot_user_image")) ||
          "https://lh3.googleusercontent.com/a/default-user=s96-c";

        setUser({ email, name, image });
        if (KNOWN_ADMINS.includes(email)) {
          setIsAdmin(true);
        }
        setIsLoading(false);
      } else {
        // 방문자 세션(egdesk_visitor_session)이 존재하는지 확인하여 즉시 자동 연동
        const visitorSession =
          typeof window !== "undefined"
            ? localStorage.getItem("egdesk_visitor_session")
            : null;

        if (visitorSession) {
          (async () => {
            try {
              const statusRes = await getVisitorGoogleStatus();
              if (statusRes?.connected && statusRes?.email) {
                const email = statusRes.email.toLowerCase().trim();
                const name = (statusRes as any).name || email.split("@")[0];
                const image =
                  (statusRes as any).picture ||
                  "https://lh3.googleusercontent.com/a/default-user=s96-c";

                setUser({ email, name, image });
                if (typeof window !== "undefined") {
                  try {
                    localStorage.setItem("sheetbot_user_email", email);
                    localStorage.setItem("sheetbot_user_name", name);
                    localStorage.setItem("sheetbot_user_image", image);
                  } catch {}
                }

                // NextAuth 세션 쿠키 발급
                await apiFetch("/api/auth/google/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email, name, image, visitorSessionId: visitorSession }),
                }).catch(() => {});

                if (KNOWN_ADMINS.includes(email)) {
                  setIsAdmin(true);
                }
                setIsLoading(false);
                return;
              }
            } catch (vErr) {
              console.warn("Visitor session auto-resolution note:", vErr);
            }
            setUser(null);
            setIsAdmin(false);
            setIsLoading(false);
          })();
          return;
        }

        // 실제 비로그인 게스트인 경우에만 null 처리
        setUser(null);
        setIsAdmin(false);
        setIsLoading(false);
      }
    }
  }, [session, status, refreshAdminStatus]);

  // 안전 로그아웃 핸들러
  const logout = useCallback(async () => {
    setIsLoading(true);
    setUser(null);
    setIsAdmin(false);

    try {
      const { signOutVisitorGoogle } = await import("@/egdesk-visitor-google");
      await signOutVisitorGoogle().catch(() => {});
    } catch {}

    try {
      await signOut({ redirect: false });
    } catch {}

    try {
      await apiFetch("/api/auth/force-logout", { method: "POST" });
    } catch {}

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("sheetbot_user_email");
        localStorage.removeItem("sheetbot_user_name");
        localStorage.removeItem("sheetbot_user_image");
        localStorage.removeItem("egdesk_visitor_session");
        sessionStorage.clear();
      } catch {}
      window.location.href = "/login";
    }
  }, []);

  const value = useMemo<AuthAdminContextValue>(() => {
    const effectiveEmail = user?.email || (session?.user?.email ? session.user.email.toLowerCase().trim() : "");
    return {
      user,
      userEmail: effectiveEmail,
      isLoggedIn: Boolean(effectiveEmail),
      isAdmin,
      isLoading: status === "loading" && isLoading,
      session,
      refreshAdminStatus,
      logout,
    };
  }, [user, session?.user?.email, session, isAdmin, status, isLoading, refreshAdminStatus, logout]);

  return (
    <AuthAdminContext.Provider value={value}>
      {children}
    </AuthAdminContext.Provider>
  );
}

export function useAuthAdmin(): AuthAdminContextValue {
  return useContext(AuthAdminContext);
}
