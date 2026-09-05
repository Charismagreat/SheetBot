"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Bot, ArrowLeft, Sparkles, CheckCircle2, Shield, UserCheck, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [customEmail, setCustomEmail] = useState("test.user@sheetbot.dev");
  const [customName, setCustomName] = useState("테스트 유저");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoadingGoogle(true);
    // 현재 URL의 터널링 경로 prefix 감지
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
    const prefix = match ? match[1] : "";
    await signIn("google", { callbackUrl: `${prefix}/dashboard` });
  };

  const handleTestUserLogin = async (email?: string, name?: string) => {
    setIsLoadingTest(true);
    const targetEmail = email || customEmail || "test.user@sheetbot.dev";
    const targetName = name || customName || "테스트 유저";

    // 현재 터널링 경로 prefix 감지
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
    const prefix = match ? match[1] : "";

    try {
      // 1. 직접 안정적인 demo-login 엔드포인트 호출 (터널링 환경 CSRF 토큰 충돌 완벽 방지)
      const directRes = await fetch(`${prefix}/api/auth/demo-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, name: targetName }),
      });

      const data = await directRes.json().catch(() => ({}));

      if (data.success) {
        // NextAuth 클라이언트 세션 캐시 동기화를 위해 백그라운드로 signIn 가볍게 트리거
        signIn("demo-login", {
          email: targetEmail,
          name: targetName,
          redirect: false,
        }).catch(() => {});

        // 대시보드로 이동
        window.location.href = `${prefix}/dashboard`;
        return;
      }

      // 2. 만약 직접 발급 실패 시 기존 signIn fallback
      const res = await signIn("demo-login", {
        email: targetEmail,
        name: targetName,
        redirect: false,
      });

      if (res?.ok && !res?.url?.includes("csrf=true")) {
        window.location.href = `${prefix}/dashboard`;
      } else {
        setIsLoadingTest(false);
        alert("로그인 처리 중 문제가 발생했습니다: " + (res?.error || "세션 생성 실패"));
      }
    } catch (err: any) {
      setIsLoadingTest(false);
      alert("로그인 중 오류가 발생했습니다: " + (err?.message || "네트워크 오류"));
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
            <p className="text-xs text-slate-500 leading-relaxed">
              Google Apps Script 자동화 프로젝트와 스케줄을 손쉽게 생성하고 관리하세요.
            </p>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-indigo-50/80 border border-indigo-200/80 rounded-2xl flex items-center gap-2.5 text-left text-xs text-indigo-900 font-semibold">
            <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>현재 구글 OAuth 설정 전이므로 아래의 <strong>테스트 유저 로그인</strong>을 이용해 즉시 모든 기능을 체험하실 수 있습니다.</span>
          </div>

          <div className="space-y-3 pt-1">
            {/* 1. 테스트 유저 로그인 버튼 (가장 강조) */}
            <button
              onClick={() => handleTestUserLogin()}
              disabled={isLoadingTest || isLoadingGoogle}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:via-teal-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              <span>{isLoadingTest ? "로그인 세션 생성 중..." : "🚀 테스트 유저로 1초 로그인하기"}</span>
            </button>

            {/* 다른 이메일로 테스트하기 토글 */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer underline underline-offset-2"
              >
                {showCustomInput ? "▲ 기본 계정으로 접기" : "▼ 다른 테스트 이메일로 로그인하기"}
              </button>
            </div>

            {showCustomInput && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">테스트 이메일</label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="tester@sheetbot.dev"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 block">표시 이름</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="테스트 유저"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <button
                  onClick={() => handleTestUserLogin(customEmail, customName)}
                  disabled={isLoadingTest}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  이 계정으로 로그인
                </button>
              </div>
            )}

            {/* 구분선 */}
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] font-bold text-slate-400">구글 계정 연동</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* 2. 구글 계정으로 로그인 */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoadingGoogle || isLoadingTest}
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer opacity-70 hover:opacity-100"
              title="현재 구글 OAuth 연동 설정 중입니다"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
              <span>Google 계정으로 로그인 (준비 중)</span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>회원별 데이터는 이지데스크 My DB로 안전하게 격리 보관됩니다.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
