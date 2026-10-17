"use client";

import { apiFetch } from '@/lib/api';
import { getNextAuthBasePath } from '@/lib/next-auth-base-path';
import React, { useState, useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { AuthAdminProvider } from "@/contexts/AuthAdminContext";

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  const [authBasePath, setAuthBasePath] = useState("/api/auth");

  useEffect(() => {
    setAuthBasePath(getNextAuthBasePath());
  }, []);

  // 플러그인이 발급한 이지데스크 Visitor 세션을 확인하여 NextAuth 세션과 자동 동기화 (탭당 1회 한정)
  useEffect(() => {
    let isMounted = true;

    const syncVisitorSession = async () => {
      try {
        if (typeof window === "undefined") return;
        // 방문자 세션 ID 기준으로 동기화 (재로그인으로 ID가 바뀌면 다시 동기화)
        const visitorSid = localStorage.getItem("egdesk_visitor_session");
        const alreadySyncedSid = sessionStorage.getItem("sheetbot_session_synced");
        if (!visitorSid || alreadySyncedSid === visitorSid) {
          return;
        }

        const { getVisitorGoogleStatus } = await import("@/egdesk-visitor-google");
        const status = await getVisitorGoogleStatus();

        if (status?.connected && status?.email && isMounted) {
          sessionStorage.setItem("sheetbot_session_synced", visitorSid);
          // 백그라운드에서 NextAuth 세션 쿠키 발급 및 회원 동기화
          // ⚠️ visitorSessionId 누락 시 서버 DB에 만료된 옛 세션이 남아 Workspace 호출이 실패합니다.
          await apiFetch("/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: status.email,
              name: status.email.split("@")[0],
              visitorSessionId: visitorSid,
            }),
          })
            .then((res) => {
              if (res.ok) localStorage.setItem("sheetbot_synced_visitor_sid", visitorSid);
            })
            .catch((err) => console.warn("Visitor session sync warning:", err));
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
      basePath={authBasePath}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      <AuthAdminProvider>
        {children}
      </AuthAdminProvider>
    </SessionProvider>
  );
}
