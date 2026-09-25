"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Trash2,
} from "lucide-react";
import SheetBotLogo from "@/components/SheetBotLogo";
import WithdrawModal from "@/components/WithdrawModal";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const pathname = usePathname();
  const { user, isLoggedIn, isLoading, isAdmin, logout } = useAuth();

  // 기본값: 꺼짐(false)
  const [aiHelpEnabled, setAiHelpEnabled] = useState(false);
  const [supportDropdownOpen, setSupportDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

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
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
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
                        <div className="text-[10.5px] text-slate-400 font-normal">시트봇 100% 활용 노하우</div>
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
                        <div className="text-[10.5px] text-slate-400 font-normal">비용, 보안, 자동화 한계</div>
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
          {isLoading ? (
            <div className="w-20 h-8 bg-slate-100 animate-pulse rounded-xl" />
          ) : isLoggedIn && user ? (
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
                  {/* 관리자 전용: SheetBot Agent M (무통장 입금 자동감지 시스템) 바로가기 */}
                  {pathname !== "/dashboard/notifications" && (
                    <Link
                      href="/dashboard/deposit-agent"
                      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/80 rounded-xl transition-all shadow-2xs whitespace-nowrap shrink-0"
                      data-easybot-hint="SheetBot Agent M: 안드로이드 스마트폰 전용 APK를 연동하여 24시간 실시간 무통장 입금 감지 및 전역 토큰 지갑 자동 충전을 가동합니다."
                      title="관리자 전용 무통장 입금 자동 감지 시스템 (SheetBot Agent M)"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="hidden md:inline">SheetBot Agent M</span>
                      <span className="md:hidden">Agent M</span>
                    </Link>
                  )}

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

              {/* 유저 프로필 카드 & 드롭다운 메뉴 */}
              <div className="relative shrink-0 pl-1 border-l border-slate-200" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-1.5 p-1 rounded-2xl hover:bg-slate-100/80 active:bg-slate-200/60 transition-all border border-transparent hover:border-slate-200/80 cursor-pointer whitespace-nowrap"
                  title="내 계정 정보 및 설정 (클릭 시 메뉴 열기)"
                  data-easybot-hint="회원 세션: 로그인된 구글 계정 정보입니다. 클릭하면 로그아웃 및 계정 삭제 메뉴가 표시됩니다."
                >
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={user.name || "User"}
                      width={28}
                      height={28}
                      unoptimized
                      className="rounded-full border border-slate-200 object-cover shadow-2xs shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200 shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div className="hidden xl:flex items-center gap-1 text-left whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[85px]">
                      {user.name || "구글 회원"}
                    </span>
                    <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  </div>

                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                      profileDropdownOpen ? "rotate-180 text-slate-700" : ""
                    }`}
                  />
                </button>

                {/* 프로필 팝오버 드롭다운 메뉴 */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* 계정 정보 헤더 */}
                    <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-2.5">
                        {user.image ? (
                          <Image
                            src={user.image}
                            alt=""
                            width={32}
                            height={32}
                            unoptimized
                            className="rounded-full border border-slate-200 object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {user.name || "구글 회원"}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate" title={user.email || ""}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg w-fit">
                        <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>Google Workspace 보안 세션</span>
                      </div>
                    </div>

                    {/* 액션 메뉴 */}
                    <div className="p-1 space-y-0.5">
                      {/* 관리자 전용: AI 컨텍스트 도움말 토글 */}
                      {isAdmin && (
                        <div className="pb-1 mb-1 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={toggleAiHelp}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50/80 rounded-xl transition-colors cursor-pointer text-left"
                            title="화면 주요 요소에 마우스를 올렸을 때 실시간 설명 팝업을 띄울지 켜고 끕니다."
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles
                                className={`w-3.5 h-3.5 ${aiHelpEnabled ? "text-indigo-600 animate-spin" : "text-slate-400"}`}
                              />
                              <span>AI 도움말 힌트</span>
                            </div>
                            <span
                              className={`text-[9.5px] px-2 py-0.5 rounded-full font-black tracking-tight ${
                                aiHelpEnabled
                                  ? "bg-indigo-600 text-white shadow-2xs"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {aiHelpEnabled ? "ON" : "OFF"}
                            </span>
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>로그아웃</span>
                      </button>

                      <div className="border-t border-slate-100 my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setIsWithdrawModalOpen(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer text-left group"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500 group-hover:text-rose-600 shrink-0" />
                        <span>계정 삭제 (영구 파기)</span>
                      </button>
                    </div>
                  </div>
                )}
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

          {isLoggedIn && user && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between px-2">
                <div className="text-xs font-bold text-slate-800 truncate">
                  {user.name || user.email}
                </div>
                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Google 인증됨
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await logout();
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>로그아웃</span>
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsWithdrawModalOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>계정 삭제</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ⚠️ 계정 영구 삭제 모달 */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        userEmail={user?.email || ""}
      />
    </header>
  );
}
