"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bot, LogOut, User, Sparkles, ArrowRight, ShieldCheck, Activity, Settings, Coins } from "lucide-react";

export default function Navbar() {
  const { data: session, status } = useSession();
  // 기본값: 꺼짐(false)
  const [aiHelpEnabled, setAiHelpEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sheetbot_ai_help_enabled");
      setAiHelpEnabled(saved === "true");

      const handleToggle = (e: any) => {
        if (typeof e.detail?.enabled === "boolean") {
          setAiHelpEnabled(e.detail.enabled);
        }
      };

      window.addEventListener("sheetbot-ai-help-toggle", handleToggle);
      return () => {
        window.removeEventListener("sheetbot-ai-help-toggle", handleToggle);
      };
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
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* 로고 & 브랜드 + 주요 안내 메뉴 */}
        <div className="flex items-center gap-4 xl:gap-6 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2.5 group shrink-0"
            data-easybot-hint="홈 로고: SheetBot의 서비스 소개 및 랜딩 페이지로 이동합니다."
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="whitespace-nowrap">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-lg text-slate-800 tracking-tight">SheetBot</span>
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md">
                  SaaS
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block -mt-0.5 whitespace-nowrap">
                Google Apps Script AI 자동화
              </span>
            </div>
          </Link>

          {/* 중앙 안내 네비게이션 메뉴 (글자 줄바꿈 방지) */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600 whitespace-nowrap">
            <Link
              href="/guide"
              className="px-2.5 py-1.5 rounded-xl hover:text-emerald-700 hover:bg-emerald-50/70 transition-all whitespace-nowrap"
            >
              사용 가이드
            </Link>
            <Link
              href="/faq"
              className="px-2.5 py-1.5 rounded-xl hover:text-indigo-700 hover:bg-indigo-50/70 transition-all whitespace-nowrap"
            >
              FAQ
            </Link>
            <Link
              href="/reviews"
              className="px-2.5 py-1.5 rounded-xl hover:text-amber-700 hover:bg-amber-50/70 transition-all whitespace-nowrap"
            >
              사용 후기
            </Link>
            <Link
              href="/contact"
              className="px-2.5 py-1.5 rounded-xl hover:text-slate-900 hover:bg-slate-100 transition-all whitespace-nowrap"
            >
              문의하기
            </Link>
          </nav>
        </div>

        {/* 네비게이션 링크 & 계정 영역 (줄바꿈 원천 차단) */}
        <div className="flex items-center gap-2 xl:gap-2.5 shrink-0 whitespace-nowrap">
          {/* AI 도움말 토글 스위치 */}
          <button
            onClick={toggleAiHelp}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap shrink-0 ${
              aiHelpEnabled
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs"
                : "bg-slate-100 text-slate-500 border-slate-200"
            }`}
            data-easybot-hint="AI 도움말 토글: 화면 주요 요소에 마우스를 올렸을 때 실시간 설명 팝업을 띄울지 켜고 끕니다."
            title="AI 도움말 켜기/끄기"
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${aiHelpEnabled ? "text-amber-500 animate-spin" : "text-slate-400"}`}
            />
            <span className="hidden sm:inline whitespace-nowrap">AI 도움말</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold whitespace-nowrap ${
                aiHelpEnabled ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-600"
              }`}
            >
              {aiHelpEnabled ? "ON" : "OFF"}
            </span>
          </button>

          {status === "loading" ? (
            <div className="w-24 h-8 bg-slate-100 animate-pulse rounded-xl" />
          ) : session?.user ? (
            <div className="flex items-center gap-2 xl:gap-2.5 shrink-0 whitespace-nowrap">
              <Link
                href="/dashboard"
                className="hidden xl:flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-emerald-600 hover:bg-slate-100 rounded-xl transition-all whitespace-nowrap shrink-0"
                data-easybot-hint="대시보드 이동: 내 스프레드시트 자동화 프로젝트 및 스케줄 관리 화면으로 이동합니다."
              >
                <span>내 프로젝트</span>
              </Link>

              <Link
                href="/dashboard/pricing"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300/80 rounded-xl transition-all shadow-2xs whitespace-nowrap shrink-0"
                data-easybot-hint="토큰 충전: 잔여 크레딧을 확인하고 안전한 선불형 결제를 통해 AI 토큰을 충전합니다."
              >
                <Coins className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="whitespace-nowrap">토큰 충전</span>
              </Link>

              <Link
                href="/dashboard/ai-usage"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200/60 rounded-xl transition-all shadow-2xs whitespace-nowrap shrink-0"
                data-easybot-hint="AI 사용료 관제: Gemini API 사용 토큰 및 추정 비용(USD/KRW)을 전체 및 회원별로 실시간 모니터링합니다."
                title="AI 사용료 관제 대시보드"
              >
                <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">AI 사용료</span>
              </Link>

              <Link
                href="/dashboard/settings"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-indigo-600 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-all whitespace-nowrap shrink-0"
                data-easybot-hint="AI 모델 설정: Apps Script 생성기 및 이지봇에 적용될 구글 제미나이(Gemini 3.5 Flash 등) 모델과 파라미터를 설정합니다."
                title="AI 모델 환경 설정"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden md:inline whitespace-nowrap">모델 설정</span>
              </Link>

              {/* 유저 프로필 카드 */}
              <div
                className="flex items-center gap-2 pl-2 border-l border-slate-200 shrink-0 whitespace-nowrap"
                data-easybot-hint="회원 세션: 로그인된 구글 계정 정보입니다. 모든 프로젝트와 스케줄이 이 이메일 단위로 안전하게 격리 보관됩니다."
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover shadow-2xs shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}

                <div className="hidden lg:block text-left whitespace-nowrap">
                  <div className="text-xs font-bold text-slate-800 leading-tight flex items-center gap-1">
                    <span className="truncate max-w-[100px]">{session.user.name || "구글 회원"}</span>
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight truncate max-w-[130px]">
                    {session.user.email}
                  </div>
                </div>

                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer shrink-0"
                  title="로그아웃"
                  data-easybot-hint="로그아웃: 현재 구글 계정 세션을 종료합니다."
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Link
                href="/login"
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                data-easybot-hint="로그인: 테스트 유저로 1초 만에 로그인하여 모든 자동화 기능을 체험합니다."
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>테스트 유저 로그인</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
