"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { 
  Sparkles, 
  Clock, 
  ArrowRight, 
  ShieldCheck, 
  KeyRound, 
  CreditCard, 
  Workflow, 
  Layers, 
  Terminal, 
  CheckCircle2, 
  XCircle,
  FileSpreadsheet,
  Search,
  MessageSquare,
  Mail,
  Cpu,
  ScanText,
  PlusCircle,
  AlertCircle
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { SheetBotIcon } from "@/components/SheetBotLogo";

// 하단 퀵 바로가기 템플릿 프리셋 5종
export const TEMPLATE_SHORTCUTS = [
  {
    id: "new",
    title: "빈 시트로 시작",
    sub: "원클릭 시트 생성",
    projectName: "스마트 자동화 시트",
    defaultPrompt: "내 비즈니스에 맞는 컬럼 구조와 스프레드시트 자동화 함수를 설계하고, 필요한 Apps Script 코드를 주입해줘.",
    icon: PlusCircle,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    url: "NEW_SHEET"
  },
  {
    id: "sms",
    title: "주문 문자 알림",
    sub: "실시간 SMS 발송",
    projectName: "주문 접수 및 실시간 SMS 발송",
    defaultPrompt: "주문 대장 시트에 신규 주문이 추가되거나 발송 체크박스를 선택하면, 고객 연락처로 주문 확인 및 배송 안내 SMS 문자를 자동으로 발송하는 기능을 주입해줘.",
    icon: MessageSquare,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    url: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/edit"
  },
  {
    id: "email",
    title: "Gmail 대량 발송",
    sub: "고객 맞춤 이메일",
    projectName: "Gmail 고객 맞춤 대량 발송",
    defaultPrompt: "고객 명단 시트에서 발송 대상을 선택하고 상단 메뉴를 누르면, 고객 이름과 맞춤 정보를 반영한 정중한 HTML 안내 이메일을 Gmail로 일괄 발송하는 기능을 주입해줘.",
    icon: Mail,
    color: "bg-rose-50 text-rose-600 border-rose-200",
    url: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/edit"
  },
  {
    id: "mes",
    title: "MES·ERP 연동",
    sub: "생산 실적 동기화",
    projectName: "생산 실적 집계 및 MES·ERP 연동",
    defaultPrompt: "생산 라인별 작업 일지와 재고 수량을 집계하고, 일일 마감 통계 및 공정 불량률을 자동으로 산출하여 일일 보고서 탭에 기록하는 기능을 주입해줘.",
    icon: Cpu,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    url: "https://docs.google.com/spreadsheets/d/1AmOiCgzS2H3FBMJJ8hgSiXprnbUXyKk7sUZmOubEuCY/edit"
  },
  {
    id: "ocr",
    title: "명함·영수증 OCR",
    sub: "AI 문서 자동 입력",
    projectName: "명함·영수증 AI 문서 자동 기입",
    defaultPrompt: "구글 시트 사이드바에서 영수증이나 명함 이미지를 업로드하면 AI가 상호명, 금액, 일자, 연락처를 정밀 분석하여 시트 행에 최신순으로 자동 등록하는 기능을 주입해줘.",
    icon: ScanText,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    url: "https://docs.google.com/spreadsheets/d/1SP_wJwYlOsjnJ8Y1soxAhpdm8mlmZVhh6Bj1N7nVIro/edit"
  }
];

export default function LandingPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [inputUrl, setInputUrl] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWrapping, setIsWrapping] = useState(false);

  // 템플릿 숏컷 클릭 시 인풋에 주소 자동 주입
  const handleSelectTemplate = (item: typeof TEMPLATE_SHORTCUTS[0]) => {
    setSelectedTemplate(item.id);
    setErrorMessage(null);
    if (item.url === "NEW_SHEET") {
      setInputUrl("https://docs.google.com/spreadsheets/create");
    } else {
      setInputUrl(item.url);
    }
  };

  // [래핑 & AI 시작] 실행
  const handleStartWrapping = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawUrl = inputUrl.trim();
    // 주소가 비어있으면 기본값으로 'NEW_SHEET'(빈 시트로 즉시 시작) 적용
    const url = rawUrl || "NEW_SHEET";

    const isNewSheet = url === "NEW_SHEET" || url.includes("spreadsheets/create");
    if (!isNewSheet && !url.includes("docs.google.com/spreadsheets")) {
      setErrorMessage("올바른 Google 스프레드시트 주소(https://docs.google.com/spreadsheets/d/...)를 입력해 주세요.");
      return;
    }

    // 선택된 템플릿 메타데이터 추출
    const matchedTpl = TEMPLATE_SHORTCUTS.find((t) => t.id === selectedTemplate || t.url === rawUrl);
    const templateName = matchedTpl?.projectName || (isNewSheet ? "스마트 자동화 시트" : "");
    const presetPrompt = matchedTpl?.defaultPrompt || "";

    setErrorMessage(null);
    setIsWrapping(true);

    // localStorage에 임시 저장하여 OAuth 리다이렉트 중 파라미터 유실 방지
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pending_sheet_url", url);
        if (templateName) localStorage.setItem("pending_template_name", templateName);
        if (presetPrompt) localStorage.setItem("pending_preset_prompt", presetPrompt);
      } catch (e) {
        console.warn("localStorage error:", e);
      }
    }

    // 대시보드 쿼리 스트링 조립
    const queryParams = new URLSearchParams({ sheetUrl: url });
    if (templateName) queryParams.set("templateName", templateName);
    if (presetPrompt) queryParams.set("presetPrompt", presetPrompt);
    const targetUrl = `/dashboard?${queryParams.toString()}`;

    // 타깃 URL 생성 후 이동 (로그인 여부에 따라 리다이렉트)
    setTimeout(() => {
      if (session?.user) {
        router.push(targetUrl);
      } else {
        router.push(`/login?callbackUrl=${encodeURIComponent(targetUrl)}`);
      }
    }, 600);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex flex-col items-center text-center space-y-16 sm:space-y-20">
        {/* =========================================================================
            1. HERO 섹션: Google 검색창 스타일 시트 주소 래퍼 & 숏컷
           ========================================================================= */}
        <div className="w-full max-w-3xl space-y-8 pt-2 sm:pt-6">
          {/* 구글 감성의 SheetBot 로고 & 타이틀 */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 sm:gap-4 select-none">
              <SheetBotIcon size="xl" className="shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/10" />
              <div className="flex items-baseline text-4xl sm:text-6xl font-black tracking-tight">
                <span className="text-emerald-700">Sheet</span>
                <span className="text-slate-900">Bot</span>
                <span className="text-teal-600 font-extrabold text-2xl sm:text-3xl ml-1">.ai</span>
              </div>
            </div>
            <p className="text-xs sm:text-base text-slate-500 max-w-xl mx-auto leading-relaxed break-keep">
              API 키 발급 없이, <strong>시트 주소를 넣고 바이브코딩</strong>으로 완성하는<br className="hidden sm:inline" />
              가장 안전한 구글 시트 AI 자동화
            </p>
          </div>

          {/* 🌟 구글 검색창 형태의 대형 단일 입력 박스 (Pill-shaped Search Bar) */}
          <form onSubmit={handleStartWrapping} className="w-full relative">
            <div className="relative flex items-center w-full bg-white rounded-full border-2 border-slate-200/90 shadow-lg hover:shadow-xl hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100 transition-all duration-300 p-2 sm:p-2.5">
              {/* 좌측 시트 아이콘 */}
              <div className="pl-3 sm:pl-4 pr-2 text-emerald-600 shrink-0">
                <FileSpreadsheet className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>

              {/* 시트 주소 인풋창 */}
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Google 스프레드시트 주소를 입력하세요 (https://docs.google.com/...)"
                className="w-full bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-xs sm:text-base font-medium px-2 py-1 sm:py-2"
                autoFocus
              />

              {/* 우측 래핑 & AI 시작 버튼 (Google AI 모드 감성) */}
              <button
                type="submit"
                disabled={isWrapping}
                className="shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-full shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-70"
              >
                {isWrapping ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>1초 래핑 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
                    <span>⚡ 1초 래핑</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 hidden sm:inline" />
                  </>
                )}
              </button>
            </div>

            {/* 유효성 에러 피드백 */}
            {errorMessage && (
              <div className="absolute -bottom-7 left-4 flex items-center gap-1.5 text-xs text-rose-600 font-semibold animate-shake">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </form>

          {/* 🌟 하단 퀵 숏컷 아이콘 5종 (Google 바로가기 원형 아이콘 스타일) */}
          <div className="pt-3">
            <div className="text-center text-xs font-bold text-slate-400 mb-3 tracking-wide uppercase">
              또는 인기 자동화 시트로 1초 만에 시작하기
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 justify-center max-w-2xl mx-auto">
              {TEMPLATE_SHORTCUTS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = selectedTemplate === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTemplate(item)}
                    className={`flex flex-col items-center text-center p-2.5 rounded-2xl transition-all duration-200 group cursor-pointer ${
                      isSelected ? "bg-emerald-50/80 ring-2 ring-emerald-500" : "hover:bg-slate-100/70"
                    }`}
                  >
                    {/* 원형 아이콘 박스 */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-xs group-hover:scale-105 group-hover:shadow-md transition-transform ${item.color}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    {/* 텍스트 라벨 */}
                    <span className="mt-2 text-xs font-bold text-slate-800 line-clamp-1 group-hover:text-emerald-700">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      {item.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* =========================================================================
            2. 3단계 킬러 워크플로우 (How It Works)
           ========================================================================= */}
        <div id="how-it-works" className="w-full space-y-6 pt-4">
          <div className="space-y-2 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Simple 3-Step Flywheel</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">시트봇 3단계 워크플로우</h2>
            <p className="text-xs sm:text-sm text-slate-500 break-keep">인프라 구축도, API 키 설정도 필요 없는 가장 직관적인 자동화 여정</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Step 1 */}
            <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">STEP 1</span>
                <Layers className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900 break-keep">시트 래핑 (Sheet Wrap)</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
                내 구글 시트 주소(URL)를 시트봇에 입력하기만 하면, AI 및 외부 도구와 통신할 수 있는 안전한 보안 터널과 인프라가 즉시 래핑됩니다.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black px-2.5 py-1 bg-teal-100 text-teal-800 rounded-lg">STEP 2</span>
                <Terminal className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900 break-keep">안티그라비티 &amp; MCP 바이브코딩</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
                개발 지식 없이도 "홈택스 세금계산서 대조해줘", "나라장터 입찰공고 스크랩해줘"처럼 자연어로 대화하면, 안티그라비티와 이지데스크 MCP가 시트에 최적화된 로직을 즉시 바이브코딩합니다.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg">STEP 3</span>
                <Workflow className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900 break-keep">원클릭 코드 주입 & 배포</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
                완성된 코드가 구글 시트에 원클릭으로 직접 주입됩니다. API 키는 소스에 노출되지 않으며, 시트 상단 메뉴와 버튼으로 즉시 자동화가 가동됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. 어떤 Pain을 해결해주나? (Pain vs Solution 카드)
           ========================================================================= */}
        <div className="w-full space-y-8 pt-6">
          <div className="space-y-2 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Why SheetBot?</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">기존 AI 자동화가 막막했던 5가지 이유</h2>
            <p className="text-xs sm:text-sm text-slate-500 break-keep">시트봇은 번거로운 개발 장벽과 보안 걱정을 완전히 없앴습니다.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {/* Pain 1 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-max">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 break-keep">AI API 키 발급 지옥 해결</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5 text-rose-500">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>OpenAI, GCP 콘솔 가입하고 개발자 문서 헤매기</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>Zero-Key</strong>: 키 발급 없이 로그인 즉시 최신 AI 활용</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pain 2 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-max">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 break-keep">복잡한 신용카드 등록 & 과금 불안</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5 text-rose-500">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>해외 결제 카드 등록과 예측 불가능한 요금 폭탄 두려움</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>통합 관리</strong>: 투명한 토큰 감사로 안전하고 예측 가능한 사용</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pain 3 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-max">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 break-keep">API 키 노출 & 탈취 위험 제로</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5 text-rose-500">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>시트 소스코드에 API 키가 그대로 적혀 공유 시 유출 위험</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>완전 보안 격리</strong>: 시트엔 로직만 주입, 키는 백엔드 터널로 안전 격리</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pain 4 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-max">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 break-keep">구글 Workspace 복잡한 설정</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5 text-rose-500">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>시트, 드라이브, 지메일 연동 시 발생하는 복잡한 권한 에러</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>표준 연동 보장</strong>: 100% 사전 검증된 구글 앱스 파이프라인 자동 탑재</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pain 5 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-max">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 break-keep">복잡한 실행 스케줄 & 서버 구축</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5 text-rose-500">
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>정기 실행을 위해 별도 클라우드 크론, 웹훅 서버를 구축하는 번거로움</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><strong>자연어 스케줄러</strong>: "매일 아침 8시 실행" 한마디로 브라우저 & 시트 예약 완성</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to Action Box in Grid */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-6 rounded-3xl shadow-md text-white flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">Start in 1 Minute</span>
                <h3 className="font-black text-lg text-white break-keep">지금 내 구글 시트에 AI 엔진을 장착해 보세요</h3>
                <p className="text-xs text-emerald-100 leading-relaxed break-keep">
                  복잡한 절차 없이 구글 로그인 한 번으로 모든 자동화 인프라가 준비됩니다.
                </p>
              </div>
              <Link
                href={session?.user ? "/dashboard" : "/login"}
                className="w-full py-3 bg-white text-emerald-800 font-extrabold text-xs sm:text-sm rounded-xl text-center shadow-sm hover:bg-emerald-50 transition-all"
              >
                {session?.user ? "대시보드로 이동하기" : "무료로 시작하기"}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
