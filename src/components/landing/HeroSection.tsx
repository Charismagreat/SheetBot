"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { 
  Sparkles, 
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import { SheetBotIcon } from "@/components/SheetBotLogo";
import { TEMPLATE_SHORTCUTS, KILLER_WEBAPPS } from "@/constants/landing";

export function HeroSection() {
  const { data: session } = useSession();
  const router = useRouter();

  const [inputUrl, setInputUrl] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWrapping, setIsWrapping] = useState(false);

  // [1단계] 추천인 코드(?ref=...) 감지 및 보존
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) {
        try {
          localStorage.setItem("pending_ref", ref);
        } catch (e) {}
      }
    }
  }, []);

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

  const handleKillerWebAppSelected = (app: typeof KILLER_WEBAPPS[0]) => {
    setSelectedTemplate(app.title);
    setErrorMessage(null);
    if (app.url === "NEW_SHEET") {
      setInputUrl("https://docs.google.com/spreadsheets/create");
    } else {
      setInputUrl(app.url);
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
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

    // 선택된 템플릿 또는 킬러 웹앱 메타데이터 추출
    const matchedTpl = TEMPLATE_SHORTCUTS.find((t) => t.id === selectedTemplate || t.url === rawUrl);
    const matchedKiller = KILLER_WEBAPPS.find((k) => k.title === selectedTemplate || k.url === rawUrl);
    const templateName = matchedKiller?.title || matchedTpl?.projectName || (isNewSheet ? "스마트 자동화 시트" : "");
    const presetPrompt = matchedKiller?.defaultPrompt || matchedTpl?.defaultPrompt || "";

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
    <div className="w-full max-w-3xl space-y-8 pt-2 sm:pt-6">
      {/* 구글 감성의 SheetBot 로고 & 타이틀 */}
      <div className="space-y-4">
        {/* 상단 킬러 슬로건 뱃지 */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] sm:text-xs font-black shadow-2xs mx-auto animate-fade-in">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
          <span>구글 시트 링크 하나로 30초 만에 모바일 웹앱 &amp; AI 자동화 배포!</span>
        </div>

        <div className="flex items-center justify-center gap-3 sm:gap-4 select-none">
          <SheetBotIcon size="xl" className="shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/10" />
          <div className="flex items-baseline text-4xl sm:text-6xl font-black tracking-tight">
            <span className="text-emerald-700">Sheet</span>
            <span className="text-slate-900">Bot</span>
            <span className="text-teal-600 font-extrabold text-2xl sm:text-3xl ml-1">.ai</span>
          </div>
        </div>

        {/* 강력한 헤드카피 & 서브카피 */}
        <div className="space-y-2 max-w-2xl mx-auto break-keep">
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 leading-snug tracking-tight">
            <span className="text-emerald-700">
              <a
                href="https://docs.google.com/spreadsheets/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 decoration-emerald-500 hover:text-emerald-900 transition-colors"
              >
                구글시트
              </a>{" "}
              주소를 래핑한 후<br />
              바이브코딩 도구(
              <a
                href="https://antigravity.google/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 decoration-emerald-500 hover:text-emerald-900 transition-colors"
              >
                안티그라비티
              </a>
              )에 붙여넣고 자연어로 자동화 하세요.
            </span>
          </h1>
          <p className="text-xs sm:text-base text-slate-500 leading-relaxed">
            어려운 웹 개발도, 복잡한 GCP 설정도 필요 없습니다.<br />
            랩핑된 시트 링크 하나로 자동화 프로그램이 완성됩니다.
          </p>
        </div>
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
            placeholder="Google 스프레드시트 주소를 입력하세요 (30초 만에 전용 모바일 웹앱·자동화 완성)"
            className="w-full bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-xs sm:text-base font-medium px-2 py-1 sm:py-2"
            autoFocus
          />

          {/* 우측 래핑 & AI 시작 버튼 (Google AI 모드 감성) */}
          <button
            type="submit"
            disabled={isWrapping}
            className="shrink-0 inline-flex items-center justify-center whitespace-nowrap gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-full shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-70"
          >
            {isWrapping ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>1초 AI 래핑 중...</span>
              </>
            ) : (
              <span>1초 AI 래핑</span>
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
  );
}
