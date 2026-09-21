"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import {
  Bot,
  LogOut,
  User,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  ChevronDown,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Star,
  Menu,
  X,
  Smartphone,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import SheetBotLogo from "@/components/SheetBotLogo";

export default function Navbar() {
  const { data: session, status } = useSession();
  // 기본값: 꺼짐(false)
  const [aiHelpEnabled, setAiHelpEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [supportDropdownOpen, setSupportDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const email = session?.user?.email?.toLowerCase().trim();
    if (!email) {
      setIsAdmin(false);
      return;
    }

    // 기본 관리자 계정 즉시 선제 활성화 (API 호출 전 깜빡임 방지)
    if (email === "chachogreat@gmail.com" || email === "charismagreat@gmail.com") {
      setIsAdmin(true);
    }

    apiFetch("/api/admin/check")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setIsAdmin(Boolean(data.isAdmin));
        }
      })
      .catch(() => {
        if (isMounted && !(email === "chachogreat@gmail.com" || email === "charismagreat@gmail.com")) {
          setIsAdmin(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session?.user?.email]);

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

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSupportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      {/* 🌟 중소기업/소상공인 맞춤 경량 ERP/AX 최상단 슬림 배너 */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white text-[11px] font-bold py-1.5 px-4 text-center border-b border-teal-800/40 flex items-center justify-center gap-2">
        <span className="px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] hidden sm:inline-block">
          정부지원 최대 90%
        </span>
        <span className="truncate break-keep">
          [중소기업·소상공인] 매일 쓰던 엑셀로 1주일 완성 맞춤 경량 ERP/MES 구축 &amp; 무료 AX 진단
        </span>
        <Link
          href="/enterprise"
          className="underline hover:text-teal-300 font-extrabold flex items-center gap-0.5 shrink-0 text-teal-300 ml-1 whitespace-nowrap"
        >
          <span>자세히 보기</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* 로고 & 브랜드 + 중앙 핵심 메뉴 */}
        <div className="flex items-center gap-5 xl:gap-8 shrink-0">
          <Link
            href="/"
            className="group shrink-0 transition-transform active:scale-95"
            data-easybot-hint="홈 로고: SheetBot의 서비스 소개 및 랜딩 페이지로 이동합니다."
          >
            <SheetBotLogo size="md" />
          </Link>

          {/* 중앙 슬림 네비게이션 메뉴 (핵심 3개 + 고객지원 드롭다운) */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-bold text-slate-600 whitespace-nowrap">
            {/* 1. 활용 사례 (33종 레시피) */}
            <Link
              href="/use-cases"
              className="px-3 py-2 rounded-xl hover:text-teal-800 hover:bg-teal-50/70 transition-all whitespace-nowrap flex items-center gap-1.5"
            >
              <span>활용 사례</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                33
              </span>
            </Link>

            {/* 2. 기업 맞춤 AX 구축 (경량 ERP/MES) */}
            <Link
              href="/enterprise"
              className="px-3 py-2 rounded-xl text-teal-800 bg-teal-50/80 hover:bg-teal-100/80 border border-teal-200/80 font-black transition-all whitespace-nowrap flex items-center gap-1.5 shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              <span>기업 맞춤 AX</span>
              <span className="px-1.5 py-0.2 text-[9.5px] bg-teal-600 text-white rounded-md font-extrabold">
                정부지원 90%
              </span>
            </Link>

            {/* 3. 템플릿 마켓 */}
            <Link
              href="/marketplace"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl text-slate-700 hover:text-emerald-700 hover:bg-emerald-50/70 font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>템플릿 마켓</span>
            </Link>

            {/* 4. 고객지원 (모던 드롭다운) */}
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={() => setSupportDropdownOpen(true)}
              onMouseLeave={() => setSupportDropdownOpen(false)}
            >
              <button
                onClick={() => setSupportDropdownOpen(!supportDropdownOpen)}
                className={`px-3 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  supportDropdownOpen
                    ? "bg-slate-100 text-slate-900"
                    : "hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <span>고객지원</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    supportDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* 드롭다운 메뉴 팝업 */}
              {supportDropdownOpen && (
                <div className="absolute top-full left-0 pt-1.5 w-56 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl p-2 space-y-1">
                    <Link
                      href="/guide"
                      onClick={() => setSupportDropdownOpen(false)}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 transition-all group"
                    >
                      <div className="p-1.5 rounded-lg bg-emerald-100/70 text-emerald-700 group-hover:bg-emerald-200 transition-colors">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black">사용 가이드</div>
                        <div className="text-[10.5px] text-slate-400 font-normal">3분 만에 마스터하는 5단계</div>
                      </div>
                    </Link>

                    <Link
                      href="/faq"
                      onClick={() => setSupportDropdownOpen(false)}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 transition-all group"
                    >
                      <div className="p-1.5 rounded-lg bg-indigo-100/70 text-indigo-700 group-hover:bg-indigo-200 transition-colors">
                        <HelpCircle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black">자주 묻는 질문 (FAQ)</div>
                        <div className="text-[10.5px] text-slate-400 font-normal">사용법, 요금 및 보안 정책</div>
                      </div>
                    </Link>

                    <Link
                      href="/reviews"
                      onClick={() => setSupportDropdownOpen(false)}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-amber-50 text-slate-700 hover:text-amber-800 transition-all group"
                    >
                      <div className="p-1.5 rounded-lg bg-amber-100/70 text-amber-700 group-hover:bg-amber-200 transition-colors">
                        <Star className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black">사용 후기</div>
                        <div className="text-[10.5px] text-slate-400 font-normal">실사용 기업 &amp; 소상공인 리뷰</div>
                      </div>
                    </Link>

                    <div className="border-t border-slate-100 my-1 pt-1">
                      <Link
                        href="/contact"
                        onClick={() => setSupportDropdownOpen(false)}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-100 text-slate-800 font-bold transition-all group"
                      >
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition-colors">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black">1:1 문의하기</div>
                          <div className="text-[10.5px] text-slate-400 font-normal">운영팀 다이렉트 지원</div>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* 우측 네비게이션 제어 영역 */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 whitespace-nowrap">
          {/* AI 도움말 컴팩트 토글 버튼 */}
          <button
            onClick={toggleAiHelp}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap shrink-0 cursor-pointer ${
              aiHelpEnabled
                ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-2xs"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/80"
            }`}
            data-easybot-hint="AI 도움말 토글: 화면 주요 요소에 마우스를 올렸을 때 실시간 설명 팝업을 띄울지 켜고 끕니다."
            title="AI 도움말 켜기/끄기"
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${aiHelpEnabled ? "text-amber-500 animate-spin" : "text-slate-400"}`}
            />
            <span className="hidden sm:inline whitespace-nowrap">AI 도움말</span>
            <span
              className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-extrabold whitespace-nowrap ${
                aiHelpEnabled ? "bg-indigo-600 text-white" : "bg-slate-300 text-slate-600"
              }`}
            >
              {aiHelpEnabled ? "ON" : "OFF"}
            </span>
          </button>

          {status === "loading" ? (
            <div className="w-20 h-8 bg-slate-100 animate-pulse rounded-xl" />
          ) : session?.user ? (
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 whitespace-nowrap">
              {/* 내 워크스페이스 바로가기 */}
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-xl transition-all shadow-2xs whitespace-nowrap shrink-0"
                data-easybot-hint="워크스페이스 이동: 내 스프레드시트 자동화 프로젝트, 토큰 지갑, 스케줄 종합 관리 화면으로 이동합니다."
              >
                <Bot className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>내 워크스페이스</span>
              </Link>

              {isAdmin && (
                <>
                  {/* 관리자 전용: 모바일 입금확인기 바로가기 */}
                  <Link
                    href="/dashboard/deposit-agent"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl transition-all shadow-2xs whitespace-nowrap shrink-0"
                    data-easybot-hint="모바일 입금확인기: 안드로이드 스마트폰 전용 APK를 설치하고 QR코드를 스캔하여 24시간 실시간 무통장 입금 감지 및 자동 충전을 가동합니다."
                    title="관리자 전용 무통장 입금 자동확인기 (Android APK)"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>입금확인기</span>
                  </Link>

                  <Link
                    href="/dashboard/admin"
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/60 rounded-xl transition-all whitespace-nowrap shrink-0"
                    data-easybot-hint="관리자 센터: 1:1 고객 문의 답변, 사용 후기 검수, FAQ 편집, 세금계산서 발행을 승인합니다."
                    title="통합 운영 관리자 센터"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span className="hidden lg:inline whitespace-nowrap">관리자</span>
                  </Link>
                </>
              )}

              {/* 유저 프로필 카드 (컴팩트) */}
              <div
                className="flex items-center gap-2 pl-2 border-l border-slate-200 shrink-0 whitespace-nowrap"
                data-easybot-hint="회원 세션: 로그인된 구글 계정 정보입니다."
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    width={30}
                    height={30}
                    unoptimized
                    className="rounded-full border border-slate-200 object-cover shadow-2xs shrink-0"
                    referrerPolicy="no-referrer"
                    title={session.user.email || ""}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200 shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className="hidden xl:block text-left whitespace-nowrap">
                  <div className="text-xs font-bold text-slate-800 leading-tight flex items-center gap-1">
                    <span className="truncate max-w-[90px]">{session.user.name || "구글 회원"}</span>
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
                    const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
                    const prefix = match ? match[1] : "";

                    try {
                      await fetch(`${prefix}/api/auth/force-logout`, { method: "POST" }).catch(() => {});
                    } catch {}

                    try {
                      await signOut({ redirect: false }).catch(() => {});
                    } catch {}

                    try {
                      const sessionCookies = ["next-auth.session-token", "__Secure-next-auth.session-token"];
                      sessionCookies.forEach((name) => {
                        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
                        if (prefix) {
                          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${prefix};`;
                          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${prefix}/;`;
                        }
                      });
                    } catch {}

                    window.location.href = `${prefix}/`;
                  }}
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
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
                data-easybot-hint="로그인: 구글 계정으로 로그인하여 스프레드시트 자동화 기능을 이용합니다."
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Google 로그인</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
              </Link>
            </div>
          )}

          {/* 모바일 햄버거 토글 버튼 */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl md:hidden transition-all cursor-pointer shrink-0"
            title="모바일 메뉴 열기"
            aria-label="메뉴"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* 모바일 반응형 메뉴 드롭다운 (md 미만 화면) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200/80 bg-white px-4 py-4 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
              핵심 솔루션
            </div>
            <Link
              href="/use-cases"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-all"
            >
              <span>활용 사례 (실전 레시피)</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                33종
              </span>
            </Link>
            <Link
              href="/enterprise"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-black text-teal-800 bg-teal-50/70 border border-teal-200/70 hover:bg-teal-100/80 transition-all"
            >
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" />
                <span>기업 맞춤 AX (경량 ERP/MES)</span>
              </div>
              <span className="px-1.5 py-0.2 text-[9.5px] bg-teal-600 text-white rounded-md font-extrabold">
                정부지원 90%
              </span>
            </Link>
            <Link
              href="/marketplace"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>템플릿 마켓</span>
            </Link>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
              고객지원 &amp; 안내
            </div>
            <Link
              href="/guide"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>사용 가이드</span>
            </Link>
            <Link
              href="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              <span>자주 묻는 질문 (FAQ)</span>
            </Link>
            <Link
              href="/reviews"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <Star className="w-4 h-4 text-amber-500" />
              <span>사용 후기</span>
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
            >
              <MessageSquare className="w-4 h-4 text-slate-600" />
              <span>1:1 문의하기</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
