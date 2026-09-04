"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bot, LogOut, User, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

export default function Navbar() {
  const { data: session, status } = useSession();
  const [aiHelpEnabled, setAiHelpEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sheetbot_ai_help_enabled");
      setAiHelpEnabled(saved !== "false");
    }
  }, []);

  const toggleAiHelp = () => {
    const nextVal = !aiHelpEnabled;
    setAiHelpEnabled(nextVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("sheetbot_ai_help_enabled", String(nextVal));
      window.dispatchEvent(
        new CustomEvent("sheetbot-ai-help-toggle", { detail: { enabled: nextVal } })
      );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* 로고 & 브랜드 */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          data-easybot-hint="홈 로고: SheetBot의 서비스 소개 및 랜딩 페이지로 이동합니다."
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg text-slate-800 tracking-tight">SheetBot</span>
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md">
                SaaS
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium block -mt-0.5">
              Google Apps Script AI 자동화
            </span>
          </div>
        </Link>

        {/* 네비게이션 링크 & 계정 영역 */}
        <div className="flex items-center gap-3">
          {/* AI 도움말 토글 스위치 */}
          <button
            onClick={toggleAiHelp}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              aiHelpEnabled
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs"
                : "bg-slate-100 text-slate-400 border-slate-200"
            }`}
            data-easybot-hint="AI 도움말 토글: 화면 주요 요소에 마우스를 올렸을 때 실시간 설명 팝업을 띄울지 켜고 끕니다."
            title="AI 도움말 켜기/끄기"
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${aiHelpEnabled ? "text-amber-500 animate-spin" : "text-slate-400"}`}
            />
            <span className="hidden sm:inline">AI 도움말</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                aiHelpEnabled ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-600"
              }`}
            >
              {aiHelpEnabled ? "ON" : "OFF"}
            </span>
          </button>

          {status === "loading" ? (
            <div className="w-24 h-8 bg-slate-100 animate-pulse rounded-xl" />
          ) : session?.user ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-all"
                data-easybot-hint="대시보드 이동: 내 스프레드시트 자동화 프로젝트 및 스케줄 관리 화면으로 이동합니다."
              >
                <span>내 프로젝트 대시보드</span>
              </Link>

              {/* 유저 프로필 카드 */}
              <div
                className="flex items-center gap-2.5 pl-3 border-l border-slate-200"
                data-easybot-hint="회원 세션: 로그인된 구글 계정 정보입니다. 모든 프로젝트와 스케줄이 이 이메일 단위로 안전하게 격리 보관됩니다."
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover shadow-2xs"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200">
                    <User className="w-4 h-4" />
                  </div>
                )}

                <div className="hidden md:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight flex items-center gap-1">
                    <span>{session.user.name || "구글 회원"}</span>
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight truncate max-w-[160px]">
                    {session.user.email}
                  </div>
                </div>

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                  title="로그아웃"
                  data-easybot-hint="로그아웃: 현재 구글 계정 세션을 종료합니다."
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
                data-easybot-hint="로그인: 테스트 유저로 1초 만에 로그인하여 모든 자동화 기능을 체험합니다."
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>테스트 유저 로그인</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
