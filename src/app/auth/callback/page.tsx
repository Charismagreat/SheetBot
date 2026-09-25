"use client";

/**
 * Visitor Google OAuth callback & NextAuth Session Bridge.
 *
 * EGDesk completes Google/Supabase OAuth, then redirects here with ?code=
 * This page exchanges the code for a visitor session, synchronizes NextAuth session,
 * and safely redirects to the target destination.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import {
  exchangeVisitorAuthCode,
  getVisitorGoogleStatus,
  resolveVisitorAppPath,
} from "@/egdesk-visitor-google";
import { RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, LogIn, Home } from "lucide-react";

export default function VisitorAuthCallbackPage() {
  const [step, setStep] = useState<"exchanging" | "syncing" | "success" | "error" | "timeout">("exchanging");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const attemptLogin = useCallback(async () => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") || "/dashboard";

    if (!code) {
      setStep("error");
      setErrorMessage("유효한 Google 로그인 인증 코드가 누락되었습니다.");
      return;
    }

    setStep("exchanging");
    setErrorMessage("");

    let finished = false;

    // 타임아웃 60초 (네트워크/프록시 토큰 교환 지연 충분한 여유 보장)
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      setStep("timeout");
      setErrorMessage("Google 인증 응답 시간이 초과되었습니다. (60초)");
    }, 60000);

    try {
      // 1단계: EGDesk Visitor Auth 토큰 교환
      const exchangeResult = await exchangeVisitorAuthCode(code);
      if (finished) return;

      // 2단계: 워크스페이스 Google 상태 조회 및 NextAuth 세션 동기화
      setStep("syncing");
      let userEmail = "";
      let userName = "";
      let userImage = "";

      try {
        const googleStatus = await getVisitorGoogleStatus();
        if (googleStatus?.connected && googleStatus.email) {
          userEmail = googleStatus.email;
          userName = (googleStatus as any).name || userEmail.split("@")[0];
          userImage = (googleStatus as any).picture || "https://lh3.googleusercontent.com/a/default-user=s96-c";

          // NextAuth 세션 쿠키 발급
          await signIn("google-login", {
            redirect: false,
            email: userEmail,
            name: userName,
            image: userImage,
          });

          // 로컬 스토리지에 유저 식별자 보존
          localStorage.setItem("sheetbot_user_email", userEmail);
        }
      } catch (syncErr: any) {
        console.warn("[AuthCallback] NextAuth session sync warning:", syncErr?.message);
      }

      // 3단계: 완료 및 대시보드 리다이렉트
      finished = true;
      window.clearTimeout(timer);
      setStep("success");

      const dest = resolveVisitorAppPath(next.startsWith("/") ? next : "/dashboard");
      window.setTimeout(() => {
        window.location.replace(dest);
      }, 500);
    } catch (err: any) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);

      console.error("[AuthCallback] Error during exchange:", err);
      const text = err instanceof Error ? err.message : String(err);

      // 이미 사용된 코드인 경우
      if (text.includes("Invalid or expired") || text.includes("expired")) {
        setStep("error");
        setErrorMessage("이미 처리되었거나 만료된 일회용 로그인 코드입니다. 다시 로그인을 진행해 주세요.");
      } else {
        setStep("error");
        setErrorMessage(text || "로그인 처리 중 네트워크 통신 오류가 발생했습니다.");
      }
    }
  }, []);

  useEffect(() => {
    void attemptLogin();
  }, [attemptLogin, retryCount]);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
  };

  const handleGoLogin = () => {
    window.location.replace("/login");
  };

  const handleGoHome = () => {
    window.location.replace("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200/80 shadow-xl space-y-6 text-center animate-in fade-in zoom-in duration-200">
        {/* 상태 아이콘 */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center">
          {step === "exchanging" && (
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          )}
          {step === "syncing" && (
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          )}
          {step === "success" && (
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-bounce" />
            </div>
          )}
          {(step === "error" || step === "timeout") && (
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
          )}
        </div>

        {/* 텍스트 메시지 */}
        <div className="space-y-2">
          {step === "exchanging" && (
            <>
              <h2 className="text-lg font-black text-slate-900">Google 계정 인증 처리 중</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                안전한 토큰 교환을 진행하고 있습니다.<br />잠시만 기다려 주세요...
              </p>
            </>
          )}

          {step === "syncing" && (
            <>
              <h2 className="text-lg font-black text-slate-900">자동화 워크스페이스 세션 연결 중</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Google 계정 정보를 SheetBot 세션과 동기화하고 있습니다.
              </p>
            </>
          )}

          {step === "success" && (
            <>
              <h2 className="text-lg font-black text-emerald-700">로그인 완료!</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                워크스페이스 대시보드로 이동합니다...
              </p>
            </>
          )}

          {step === "timeout" && (
            <>
              <h2 className="text-lg font-black text-slate-900">인증 응답 시간 초과</h2>
              <p className="text-xs text-rose-600 leading-relaxed font-medium">
                {errorMessage}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                네트워크 지연이나 터널 통신이 지연되었습니다. 아래 버튼을 눌러 다시 시도하세요.
              </p>
            </>
          )}

          {step === "error" && (
            <>
              <h2 className="text-lg font-black text-slate-900">로그인 처리 실패</h2>
              <p className="text-xs text-rose-600 leading-relaxed font-medium">
                {errorMessage}
              </p>
            </>
          )}
        </div>

        {/* 액션 버튼 */}
        {(step === "error" || step === "timeout") && (
          <div className="space-y-2 pt-2">
            <button
              onClick={handleGoLogin}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <LogIn className="w-4 h-4" />
              <span>Google 로그인 다시 시작하기</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleRetry}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>재시도</span>
              </button>
              <button
                onClick={handleGoHome}
                className="py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>홈으로</span>
              </button>
            </div>
          </div>
        )}

        {/* 하단 브랜드 */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <span>SheetBot Cloud Infrastructure</span>
        </div>
      </div>
    </div>
  );
}
