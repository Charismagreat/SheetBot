"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import { SessionProvider } from "next-auth/react";

function getInitialBasePath() {
  if (typeof window !== "undefined") {
    const match = window.location.pathname.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
    if (match) {
      return `${match[1]}/api/auth`;
    }
  }
  return "/api/auth";
}

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  const [basePath, setBasePath] = useState(getInitialBasePath);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
      if (match) {
        const detected = `${match[1]}/api/auth`;
        if (basePath !== detected) {
          setBasePath(detected);
        }
      }
    }
  }, [basePath]);

  // 플러그인이 발급한 이지데스크 Visitor 세션을 확인하여 NextAuth 세션과 자동 동기화 (탭당 1회 한정)
  useEffect(() => {
    let isMounted = true;

    const syncVisitorSession = async () => {
      try {
        if (typeof window === "undefined") return;
        // 이미 이번 브라우저 탭 세션에서 동기화가 완료되었거나 로컬스토리지에 visitor 세션이 없으면 네트워크 호출 0건 처리
        const alreadySynced = sessionStorage.getItem("sheetbot_session_synced");
        const hasVisitorSession = typeof window !== "undefined" && !!localStorage.getItem("egdesk_visitor_session");
        if (alreadySynced || !hasVisitorSession) {
          return;
        }

        const { getVisitorGoogleStatus } = await import("@/egdesk-visitor-google");
        const status = await getVisitorGoogleStatus();

        if (status?.connected && status?.email && isMounted) {
          sessionStorage.setItem("sheetbot_session_synced", "true");
          // 백그라운드에서 NextAuth 세션 쿠키 발급 및 회원 동기화
          await apiFetch("/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: status.email,
              name: status.email.split("@")[0],
            }),
          }).catch((err) => console.warn("Visitor session sync warning:", err));
        }
      } catch (err) {
        // 비로그인 방문자이거나 오류 시 무시
      }
    };

    void syncVisitorSession();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <SessionProvider
      basePath={basePath}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  );
}
