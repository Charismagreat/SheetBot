"use client";

import { apiFetch } from "@/lib/api";
import {
  exchangeVisitorAuthCode,
  getVisitorGoogleStatus,
  resolveVisitorAppPath,
} from "@/egdesk-visitor-google";

const VISITOR_SESSION_KEY = "egdesk_visitor_session";

export interface VisitorAuthBridgeResult {
  success: boolean;
  sessionId: string;
  email?: string;
  name?: string;
  image?: string;
  error?: string;
}

/**
 * ⚡ [SheetBot 세션 & 지갑 독립 안전 브릿지]
 * egdesk-*.ts 파일은 자동 생성 파일이므로 절대 수정하지 않고,
 * 이 독립 파일(src/lib/visitor-auth-bridge.ts)에서 세션 교환 및 NextAuth 연동을 완전 격리 수행합니다.
 */
export async function safeExchangeAndBridgeVisitorSession(
  code: string
): Promise<VisitorAuthBridgeResult> {
  // 1. 순수 이지데스크 원본 함수로 코드 ➔ 세션 교환 수행 (내부에서 localStorage에 세션 저장함)
  const result = await exchangeVisitorAuthCode(code);
  const sessionId = result?.sessionId;

  if (!sessionId) {
    throw new Error(result?.error || "세션 ID를 발급받지 못했습니다.");
  }

  // 로컬 세션 ID 저장 안전 보장
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(VISITOR_SESSION_KEY, sessionId);
    } catch {}
  }

  // 2. 사용자 정보(이메일, 이름, 프로필 사진) 추출
  let email: string | null =
    result?.email ||
    result?.user?.email ||
    result?.identity?.email ||
    result?.session?.user?.email ||
    result?.profile?.email ||
    null;

  let name = result?.user?.name || result?.name || "";
  let image = result?.user?.image || result?.picture || "";

  // 이메일이 없는 경우 status 도구로 실시간 조회 시도
  if (!email) {
    try {
      const statusRes = await getVisitorGoogleStatus();
      if (statusRes?.connected && statusRes?.email) {
        email = statusRes.email;
        if (!name && statusRes.name) name = statusRes.name;
        if (!image && (statusRes as any).picture) image = (statusRes as any).picture;
      }
    } catch (e) {
      console.warn("[VisitorAuthBridge] Status fallback note:", e);
    }
  }

  // 3. 백엔드 NextAuth 세션 및 지갑 동기화
  if (email) {
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name || cleanEmail.split("@")[0];
    const cleanImage = image || "https://lh3.googleusercontent.com/a/default-user=s96-c";

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sheetbot_user_email", cleanEmail);
        localStorage.setItem("sheetbot_user_name", cleanName);
        localStorage.setItem("sheetbot_user_image", cleanImage);
        sessionStorage.setItem("sheetbot_session_synced", "true");

        const isHttps = window.location.protocol === "https:";
        const maxAge = 30 * 24 * 60 * 60; // 30일
        document.cookie = `sheetbot_user_email=${encodeURIComponent(cleanEmail)}; path=/; max-age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;
        document.cookie = `${VISITOR_SESSION_KEY}=${encodeURIComponent(sessionId)}; path=/; max-age=${maxAge}; SameSite=Lax${isHttps ? "; Secure" : ""}`;
      } catch (e) {
        console.warn("[VisitorAuthBridge] Storage write note:", e);
      }
    }

    try {
      await apiFetch("/api/auth/google/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanName,
          image: cleanImage,
          visitorSessionId: sessionId,
        }),
      });
    } catch (sessionErr) {
      console.warn("[VisitorAuthBridge] Backend NextAuth session sync note:", sessionErr);
    }

    return {
      success: true,
      sessionId,
      email: cleanEmail,
      name: cleanName,
      image: cleanImage,
    };
  }

  return {
    success: true,
    sessionId,
  };
}

export { resolveVisitorAppPath };
