"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Shield,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import {
  startVisitorGoogleLogin,
  getVisitorGoogleStatus,
  signOutVisitorGoogle,
  VISITOR_BASIC_SCOPES,
  VISITOR_WORKSPACE_SCOPES,
  VISITOR_GOOGLE_OAUTH_SCOPES,
} from "@/egdesk-visitor-google";

export default function LoginPage() {
  const [visitorEmail, setVisitorEmail] = useState<string | null>(null);
  const [pendingSheetUrl, setPendingSheetUrl] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // 현재 브라우저에 저장된 방문자(Visitor) 구글 세션 상태 확인 및 래핑 시트 주소 확인
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cb = params.get("callbackUrl");
      const localSheet = localStorage.getItem("pending_sheet_url");
      if (localSheet) {
        setPendingSheetUrl(localSheet);
      } else if (cb && cb.includes("sheetUrl=")) {
        try {
          const match = cb.match(/sheetUrl=([^&]+)/);
          if (match && match[1]) {
            setPendingSheetUrl(decodeURIComponent(match[1]));
          }
        } catch (e) {}
      }
    }

    const checkVisitorStatus = async () => {
      try {
        const status = await getVisitorGoogleStatus();
        if (status?.connected && status?.email) {
          setVisitorEmail(status.email);
        }
      } catch (err) {
        console.warn("Visitor status check error:", err);
      } finally {
        setIsChecking(false);
      }
    };

    void checkVisitorStatus();
  }, []);

  // 로그인 성공 후 돌아갈 타깃 URL 계산
  const getTargetRedirectUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const cb = params.get("callbackUrl");
      if (cb) return cb;
      const localSheet = localStorage.getItem("pending_sheet_url");
      if (localSheet) return `/dashboard?sheetUrl=${encodeURIComponent(localSheet)}`;
    }
    return "/dashboard";
  };

  // SheetBot 자동화를 위한 확장 권한 스코프 (시트 + 드라이브 + Apps Script 프로젝트 생성)
  const SHEETBOT_WORKSPACE_SCOPES = [
    ...VISITOR_WORKSPACE_SCOPES,
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.external_request",
  ];

  // 1. Google 계정으로 로그인 (스프레드시트 및 드라이브/Apps Script 자동화 권한 포함)
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      // 기존 잔류 세션 폐기는 비동기 300ms 타임아웃 제한으로 블로킹 방지
      await Promise.race([
        signOutVisitorGoogle().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);

      // 1차 시도: EGDesk Visitor Google 로그인 (최대 4초 타임아웃 레이스)
      const visitorLoginPromise = startVisitorGoogleLogin({
        next: getTargetRedirectUrl(),
        forceConsent: true,
        scopes: SHEETBOT_WORKSPACE_SCOPES,
      });

      const timeoutPromise = new Promise<{ timeout: boolean }>((resolve) =>
        setTimeout(() => resolve({ timeout: true }), 4000)
      );

      const raceResult = await Promise.race([visitorLoginPromise, timeoutPromise]);

      if (raceResult && (raceResult as any).timeout) {
        console.warn("Visitor Google login timed out, falling back to direct login-start API...");
        // 2차 시도 폴백: 자체 /api/auth/google/login-start 엔드포인트 직접 호출
        const fallbackRes = await apiFetch("/api/auth/google/login-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceConsent: true }),
        }).then((r) => r.json()).catch(() => null);

        if (fallbackRes?.authUrl) {
          window.location.href = fallbackRes.authUrl;
          return;
        }
        setIsLoading(false);
        alert("Google 로그인 응답 시간이 초과되었습니다. 다시 한 번 버튼을 눌러주세요.");
        return;
      }
    } catch (err: any) {
      console.error("Login attempt error:", err);
      // 2차 시도 폴백: 에러 발생 시 자체 엔드포인트로 복구 시도
      try {
        const fallbackRes = await apiFetch("/api/auth/google/login-start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceConsent: true }),
        }).then((r) => r.json()).catch(() => null);

        if (fallbackRes?.authUrl) {
          window.location.href = fallbackRes.authUrl;
          return;
        }
      } catch {}

      setIsLoading(false);
      alert("Google 로그인 시작 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  // 2. 다른 Google 계정으로 변경하여 로그인
  const handleSwitchGoogleAccount = async () => {
    setIsLoading(true);
    try {
      await Promise.race([
        signOutVisitorGoogle().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]);
      setVisitorEmail(null);
      await handleGoogleLogin();
    } catch (err: any) {
      setIsLoading(false);
      alert("Google 계정 전환 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800">
      <div className="w-full max-w-md space-y-6">
        {/* 뒤로가기 링크 */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>홈으로 돌아가기</span>
        </Link>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xl shadow-slate-200/50 space-y-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 mx-auto">
            <Bot className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              SheetBot 로그인
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed break-keep">
              Google 계정으로 로그인하여<br />스프레드시트 Apps Script 자동화를 시작하세요.
            </p>
          </div>

          {/* 🌟 1초 래핑 대기 중인 시트 안내 배너 */}
          {pendingSheetUrl && (
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300/80 rounded-2xl text-left space-y-1.5 shadow-xs animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-black text-xs text-emerald-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>⚡ 1초 래핑 대기 중</span>
                </span>
                <span className="text-[10px] font-bold bg-emerald-200/60 text-emerald-800 px-2 py-0.5 rounded-full">
                  자동 연동
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-mono truncate select-all bg-white/70 px-2 py-1 rounded-lg border border-emerald-100">
                {pendingSheetUrl}
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed break-keep">
                Google 1초 로그인 완료 시 <strong>래핑 브릿지 주소, sk 키, 원클릭 코드 주입 권한</strong>이 즉시 발급됩니다.
              </p>
            </div>
          )}

          {/* 메인 Google 로그인 영역 */}
          <div className="space-y-3 pt-2">
            {visitorEmail ? (
              <>
                {/* 1) 이전에 로그인했던 방문자 계정으로 계속하기 */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-50/80 border-2 border-emerald-500/70 hover:border-emerald-600 text-slate-900 font-extrabold text-sm rounded-2xl flex items-center gap-3.5 transition-all shadow-md shadow-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/15 hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50 group"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 shadow-2xs">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-[13px] font-black text-slate-900 leading-snug">
                      Google 계정으로 계속하기
                    </div>
                    <div className="text-xs text-slate-500 font-medium truncate">
                      {visitorEmail}
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 group-hover:scale-105 transition-transform mr-1" />
                </button>

                {/* 2) 다른 Google 계정으로 로그인 */}
                <button
                  type="button"
                  onClick={handleSwitchGoogleAccount}
                  disabled={isLoading}
                  className="w-full py-2.5 px-3 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>다른 Google 계정으로 로그인</span>
                </button>
              </>
            ) : (
              /* 최초 방문자 구글 로그인 버튼 */
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading || isChecking}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-800 font-bold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-50"
              >
                {isLoading || isChecking ? (
                  <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>
                  {isLoading
                    ? "Google 로그인 페이지로 이동 중..."
                    : isChecking
                    ? "확인 중..."
                    : "Google 계정으로 로그인"}
                </span>
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>회원별 데이터는 My DB로 안전하게 격리 보관됩니다.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
