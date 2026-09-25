"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

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
  refreshAdminStatus: () => Promise<void>;
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
      // 로그아웃 상태이거나 비로그인 게스트
      setUser(null);
      setIsAdmin(false);
      setIsLoading(false);
    }
  }, [session, status, refreshAdminStatus]);

  const value = useMemo<AuthAdminContextValue>(() => {
    const effectiveEmail = user?.email || (session?.user?.email ? session.user.email.toLowerCase().trim() : "");
    return {
      user,
      userEmail: effectiveEmail,
      isLoggedIn: Boolean(effectiveEmail),
      isAdmin,
      isLoading: status === "loading" && isLoading,
      refreshAdminStatus,
    };
  }, [user, session?.user?.email, isAdmin, status, isLoading, refreshAdminStatus]);

  return (
    <AuthAdminContext.Provider value={value}>
      {children}
    </AuthAdminContext.Provider>
  );
}

export function useAuthAdmin(): AuthAdminContextValue {
  return useContext(AuthAdminContext);
}
