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
  AlertCircle,
  Zap,
  Bot,
  Smartphone,
  Database,
  ShoppingBag,
  Building2,
  GraduationCap,
  Wrench,
  CalendarCheck,
  Vote,
  QrCode,
  Globe,
  ExternalLink,
  Store
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { SheetBotIcon } from "@/components/SheetBotLogo";

// 🔥 대중 반응 폭발 킬러 웹앱 쇼케이스 프리셋 (3x2 그리드 완성)
export const KILLER_WEBAPPS = [
  {
    rank: "🥇 1위",
    title: "0원 모바일 예약 & 웨이팅 접수기",
    target: "식당 · 카페 · 공방 · 1인 미용실 사장님",
    badge: "월정액 0원 • 수수료 0%",
    pain: "캐치테이블/네이버예약 월 3~5만원 수수료 부담",
    solution: "시트에 [이름, 번호, 시간, 인원]만 적으면 감성 예약 웹앱 1초 완성!",
    columns: ["예약자명", "연락처", "일시", "인원수", "요청사항", "확정여부"],
    icon: CalendarCheck,
    color: "from-rose-500 to-pink-600",
    lightColor: "bg-rose-50 border-rose-200 text-rose-700",
    url: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/edit",
    defaultPrompt: "[모바일 예약 웹앱 제작] 이 시트를 기반으로 외부 고객이 스마트폰으로 접속하여 날짜, 시간, 인원을 선택하고 예약을 접수할 수 있는 모바일 반응형 웹앱(Web App)을 배포해줘. 예약 접수 시 시트에 즉시 등록되고 안내 문자가 발송되도록 해줘."
  },
  {
    rank: "🥈 2위",
    title: "인스타 프로필용 '감성 공구 주문서'",
    target: "인스타 셀러 · 블로그 마켓 · 농산물 직거래",
    badge: "네이버 폼 탈피 • 링크트리 일체형",
    pain: "촌스러운 네이버 폼, 복잡한 쇼핑몰 솔루션 구축 비용",
    solution: "링크트리처럼 세련된 모바일 카드 + 수량 선택 + 계좌 복사 일체형 웹앱!",
    columns: ["상품명", "옵션", "판매단가", "주문자명", "배송주소", "입금확인"],
    icon: ShoppingBag,
    color: "from-amber-500 to-orange-600",
    lightColor: "bg-amber-50 border-amber-200 text-amber-700",
    url: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/edit",
    defaultPrompt: "[공구 주문서 웹앱 제작] 이 시트를 기반으로 인스타그램 프로필에 걸 수 있는 세련된 상품 주문서 모바일 웹앱(Web App)을 배포해줘. 고객이 상품과 옵션을 고르고 주소를 입력하면 시트에 실시간 주문이 들어가도록 해줘."
  },
  {
    rank: "🥉 3위",
    title: "전화문의 90% 줄이는 '재고·단가 조회기'",
    target: "도소매 유통 · 부품 대리점 · 쇼핑몰 관리자",
    badge: "원본 시트 100% 보안",
    pain: "하루 50통씩 오는 '재고 있어요? 단가 얼마예요?' 전화",
    solution: "원본 시트는 안전하게 숨김! 품번만 검색하면 재고/단가가 뜨는 전용 검색기!",
    columns: ["상품코드", "상품명", "규격", "현재재고", "도매단가", "창고위치"],
    icon: Search,
    color: "from-blue-500 to-indigo-600",
    lightColor: "bg-blue-50 border-blue-200 text-blue-700",
    url: "https://docs.google.com/spreadsheets/d/1AmOiCgzS2H3FBMJJ8hgSiXprnbUXyKk7sUZmOubEuCY/edit",
    defaultPrompt: "[실시간 재고 조회 웹앱 제작] 이 시트의 원본은 외부에 노출하지 않고, 거래처가 상품코드나 품명을 검색하면 현재 재고 수량과 단가만 안전하게 조회할 수 있는 클라우드 웹앱(Web App)을 배포해줘."
  },
  {
    rank: "🎖️ 4위",
    title: "단톡방 공유용 '점심·회식 실시간 투표기'",
    target: "직장인 막내 · 총무팀 · 동호회 운영진",
    badge: "단톡방 취합 고통 0초 해결",
    pain: "카톡 단톡방에서 '뭐 먹을래요?' 묻고 수동 취합하는 고통",
    solution: "카톡 링크 클릭 한 번으로 투표하고 실시간 득표율 그래프가 짠! 움직이는 웹앱!",
    columns: ["메뉴후보", "득표수", "투표자", "마감시간", "실시간집계"],
    icon: Vote,
    color: "from-teal-500 to-emerald-600",
    lightColor: "bg-teal-50 border-teal-200 text-teal-700",
    url: "NEW_SHEET",
    defaultPrompt: "[실시간 투표 웹앱 제작] 구글 시트에 후보 목록을 두고, 카카오톡 단톡방 링크로 공유할 수 있는 인터랙티브 점심/회식 메뉴 투표 웹앱(Web App)을 배포해줘. 실시간 득표율 그래프가 반영되도록 해줘."
  },
  {
    rank: "🎖️ 5위",
    title: "번호 4자리 '원터치 모바일 출결 키패드'",
    target: "학원 · 스터디룸 · 운동 클래스 · 소모임",
    badge: "출결 기계 0원 대체",
    pain: "매달 수만 원씩 나가는 비싼 지문/얼굴 출결 기계",
    solution: "태블릿이나 폰에 번호 키패드가 뜨고, 뒤 4자리만 누르면 출석 도장 쾅!",
    columns: ["학생명", "전화번호뒤4자리", "출석일자", "출석시간", "지각여부"],
    icon: QrCode,
    color: "from-purple-500 to-indigo-600",
    lightColor: "bg-purple-50 border-purple-200 text-purple-700",
    url: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/edit",
    defaultPrompt: "[원터치 출결 키패드 웹앱 제작] 태블릿이나 모바일 화면에 0~9 번호 키패드가 뜨고, 수강생이 전화번호 뒤 4자리를 입력하면 출석 시간이 시트에 자동 기록되는 출결 웹앱(Web App)을 배포해줘."
  },
  {
    rank: "✨ 맞춤형",
    title: "내 구글 시트로 '나만의 맞춤 웹앱' 만들기",
    target: "사내 특수 업무 · 커스텀 DB · 모든 비즈니스",
    badge: "100% 자율 구성 • 1초 AI 래핑",
    pain: "기성 템플릿에 맞지 않는 복잡한 사내 전용 업무 양식과 시트",
    solution: "내 시트 링크만 넣고 원하는 기능을 적으면 AI가 맞춤형 웹앱을 1초 만에 완성!",
    columns: ["자유 컬럼", "계산 수식", "커스텀 버튼", "원격 배포"],
    icon: Sparkles,
    color: "from-slate-800 to-slate-900",
    lightColor: "bg-slate-100 border-slate-300 text-slate-800",
    url: "NEW_SHEET",
    defaultPrompt: "[맞춤형 웹앱 제작] 이 구글 시트의 데이터를 기반으로 스마트폰과 PC 어디서나 편리하게 조회, 입력, 처리할 수 있는 직관적인 반응형 모바일 웹앱(Web App)을 배포해줘."
  }
];

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
    url: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/edit"
  }
];

export default function LandingPage() {
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

  // 🔥 킬러 웹앱 숏컷 클릭 시 인풋에 주소 & 프롬프트 자동 주입 후 상단 스크롤
  const handleSelectKillerWebApp = (app: typeof KILLER_WEBAPPS[0]) => {
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
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 flex flex-col items-center text-center space-y-16 sm:space-y-20">
        {/* =========================================================================
            1. HERO 섹션: Google 검색창 스타일 시트 주소 래퍼 & 숏컷
           ========================================================================= */}
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

        {/* =========================================================================
            1.5. 🔥 대중 반응 폭발! 구글 시트 킬러 웹앱 쇼케이스 (3x2 완벽 대칭)
           ========================================================================= */}
        <div id="killer-webapps" className="w-full space-y-8 pt-6">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-rose-50 via-amber-50 to-emerald-50 border border-amber-200 text-amber-900 text-xs font-black shadow-xs mx-auto">
              <Sparkles className="w-4 h-4 text-amber-600 animate-bounce" />
              <span>화제의 킬러 기능 • 구글 시트가 1초 만에 웹앱이 되는 마법</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight break-keep">
              "구글 시트 링크 하나로 1초 만에 열리는 킬러 웹앱 6선"
            </h2>
            <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
              비싼 외주 개발비나 월 구독료 없이, 구글 시트에 데이터만 적어두면<br className="hidden sm:inline" />
              스마트폰으로 누구나 접속할 수 있는 모바일 웹앱 링크(URL)를 1초 만에 배포해 드립니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left max-w-6xl mx-auto items-stretch">
            {KILLER_WEBAPPS.map((app, idx) => {
              const IconComp = app.icon;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-3xl border-2 border-slate-200/90 hover:border-emerald-500 hover:shadow-xl transition-all duration-300 p-6 flex flex-col justify-between space-y-5 group relative overflow-hidden h-full"
                >
                  {/* 상단 액센트 그라디언트 바 */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${app.color}`} />

                  <div className="space-y-4 flex-1 flex flex-col">
                    {/* 순위 & 뱃지 */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black px-3 py-1 bg-slate-900 text-white rounded-xl shadow-xs">
                        {app.rank}
                      </span>
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${app.lightColor}`}>
                        {app.badge}
                      </span>
                    </div>

                    {/* 아이콘 & 타이틀 */}
                    <div className="flex items-start gap-3 pt-1">
                      <div className={`p-3 rounded-2xl bg-gradient-to-br ${app.color} text-white shadow-md group-hover:scale-110 transition-transform shrink-0`}>
                        <IconComp className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide truncate">
                          타깃: {app.target}
                        </div>
                        <div className="min-h-[3.25rem] flex items-center mt-0.5">
                          <h3 className="font-black text-base sm:text-[17px] text-slate-900 leading-snug break-keep">
                            {app.title}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Pain vs SheetBot Solution 대비 */}
                    <div className="space-y-2 text-xs min-h-[7rem] flex flex-col justify-between">
                      <div className="p-2.5 bg-rose-50/70 border border-rose-100 rounded-xl text-rose-700 flex items-start gap-2 flex-1">
                        <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                        <span className="leading-relaxed break-keep line-clamp-2">{app.pain}</span>
                      </div>
                      <div className="p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-emerald-900 flex items-start gap-2 font-medium flex-1">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                        <span className="leading-relaxed break-keep"><strong>{app.solution}</strong></span>
                      </div>
                    </div>

                    {/* 시트 컬럼 태그 목록 */}
                    <div className="space-y-1.5 pt-1 min-h-[3.25rem]">
                      <div className="text-[10px] font-bold text-slate-400">필요한 구글 시트 컬럼:</div>
                      <div className="flex flex-wrap gap-1">
                        {app.columns.map((col, cIdx) => (
                          <span
                            key={cIdx}
                            className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md border border-slate-200 whitespace-nowrap"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 하단 생성 버튼 (칼각 정렬) */}
                  <button
                    type="button"
                    onClick={() => handleSelectKillerWebApp(app)}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-2xl shadow-xs transition-all flex items-center justify-center gap-2 group-hover:shadow-md cursor-pointer active:scale-95 mt-auto"
                  >
                    <span>🚀 1초 만에 이 웹앱 래핑하기</span>
                    <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              );
            })}
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
              <h3 className="font-extrabold text-lg text-slate-900 break-keep">1초 시트 래핑</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-keep">
                내 구글 시트 주소(URL)를 시트봇에 입력하기만 하면, AI 및 외부 도구와 통신할 수 있는 안전한 보안 터널과 인프라가 단 1초 만에 래핑됩니다.
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
            2.5. 일반 코딩 AI vs SheetBot 차별점 비교 섹션 (Killer Feature Showcase)
           ========================================================================= */}
        <div className="w-full space-y-8 pt-4">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-[11px] sm:text-xs font-black mx-auto">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>일반 코딩 AI와 무엇이 다른가요?</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
              "ChatGPT는 코드를 복사하라고 하지만,<br className="hidden sm:inline" /> SheetBot은 시트에 직접 꽂아 넣습니다"
            </h2>
            <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
              개발자가 아니어도 괜찮습니다. 복잡한 Apps Script 에디터를 열 필요도,<br className="hidden sm:inline" />
              GCP 콘솔에서 비싼 Vision API 키를 카드로 결제할 필요도 없습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto text-left">
            {/* Diff Card 1: 독립 모바일 웹앱 배포 */}
            <div className="bg-white rounded-3xl border-2 border-emerald-300/80 shadow-md p-6 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-bl-xl tracking-wider uppercase">
                독보적 킬러 기능
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Globe className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">1. 모바일 웹앱(Web App) 배포</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">실제 웹사이트 생성</span>
              </div>
              <div className="space-y-2 text-xs leading-relaxed">
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">일반 AI (ChatGPT / Claude):</span> 시트를 직접 읽지 못해 사용자가 컬럼을 일일이 복붙해야 하며, 코드만 텍스트로 줄 뿐 실제 접속할 수 있는 웹사이트를 만들어주지 못함
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> 시트 링크만 넣으면 <strong>30초 만에 구글 클라우드 공식 웹앱(https://script.google.com/.../exec)으로 즉시 배포</strong>! 인스타나 카톡에 바로 거는 완성형 모바일 웹페이지 링크 제공!
                  </div>
                </div>
              </div>
            </div>

            {/* Diff Card 2: 코드 반영 방식 */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">2. 코드 주입 &amp; 실행 방식</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">배포의 차이</span>
              </div>
              <div className="space-y-2 text-xs leading-relaxed">
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 수백 줄 코드를 텍스트로 받아 사용자가 직접 Apps Script 에디터에 복사·붙여넣고, 매니페스트 권한을 수동 설정해야 함 (초보자 에러 빈번)
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> 시트 URL만 주면 <strong>0초 만에 구글 클라우드에 원격 직접 주입(Direct Push)</strong>. 시트에서 <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[10px] font-mono font-bold shadow-2xs">F5</kbd> 새로고침만 누르면 상단 메뉴 생성 완료!
                  </div>
                </div>
              </div>
            </div>

            {/* Diff Card 3: 명함·영수증 AI 비전 OCR */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <ScanText className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">3. 명함·영수증 AI 비전 분석</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">비전 OCR</span>
              </div>
              <div className="space-y-2 text-xs leading-relaxed">
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 코드만 짜줄 뿐, 실제로 사진을 읽으려면 사용자가 GCP 결제 계좌를 등록하고 유료 Vision API 키를 발급받아 코드에 넣으라고 요구
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>최첨단 Gemini 비전 AI 터널 기본 내장</strong>. 복잡한 API 키 구매 없이, 사이드바에 명함/영수증 사진만 끌어다 놓으면 1초 만에 시트 표로 자동 정리!
                  </div>
                </div>
              </div>
            </div>

            {/* Diff Card 4: 스마트폰 문자(SMS) 실제 발송 */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">4. 스마트폰 SMS 문자 일괄 발송</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">통신 인프라</span>
              </div>
              <div className="space-y-2 text-xs leading-relaxed">
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 문자 통신망이 없어 가짜 시뮬레이션(Mock) 코드를 작성하거나, 유료 문자 대행사(알리고 등) API 키를 충전해서 쓰라고 안내
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>내 스마트폰 원클릭 연동으로 평생 통신비 0원</strong>! 시트에서 체크박스 선택 후 버튼 하나로 실제 수신자에게 무료 실시간 SMS 발송
                  </div>
                </div>
              </div>
            </div>

            {/* Diff Card 5: SQLite DB 백업 & 동시 수정 안전성 */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                    <Database className="w-5 h-5" />
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900">5. 대용량 데이터 보관 &amp; 충돌 방지</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md">데이터 안전</span>
              </div>
              <div className="space-y-2 text-xs leading-relaxed">
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <div>
                    <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 구글 시트 셀 한계(데이터 누적 시 속도 저하, 다른 사람이 덮어써서 유실되는 충돌 문제)를 해결할 외부 DB 인프라 부재
                  </div>
                </div>
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>구글 드라이브 SQLite 양방향 백업</strong> &amp; <strong>낙관적 락킹(동시 수정 충돌 자동 방지)</strong> 기본 탑재로 대용량 데이터도 안전하게 관리!
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            2.8. 구글 시트 3장으로 끝내는 초경량 ERP 파이프라인 (실전 도입 사례 4선)
           ========================================================================= */}
        <div className="w-full space-y-8 pt-4">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/70 border border-teal-300 text-teal-800 text-[11px] sm:text-xs font-black mx-auto">
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              <span>멀티 시트 오케스트레이션 (Multi-Sheet Automation)</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
              "구글 시트 3장으로 끝내는 초경량 ERP 파이프라인"
            </h2>
            <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
              월 수십만 원 Zapier도, 수천만 원짜리 맞춤형 ERP도 필요 없습니다.<br className="hidden sm:inline" />
              A시트 입력 ➔ B시트 자동 가공 ➔ C시트 무료 고객 문자까지 1초 만에 유기적으로 연결됩니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto text-left">
            {/* Pipeline Card 1: 유통 / 쇼핑몰 */}
            <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">사례 01 · 유통 &amp; 쇼핑몰</span>
                    <h3 className="font-extrabold text-base text-slate-900">주문 접수 ➔ 창고 출고 ➔ 배송 안내</h3>
                  </div>
                </div>
                <span className="text-[11px] font-black text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg">일 2시간 절약</span>
              </div>

              {/* Data Flow Visual */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
                  <span>주문 접수처 (스마트스토어/자사몰 신규 주문 인입)</span>
                </div>
                <div className="pl-6 text-[11px] text-teal-600 font-bold flex items-center gap-1">
                  ↓ 박스 규격·창고 위치 자동 연산 &amp; 포장팀으로 실시간 이관
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded font-mono text-[11px] border border-teal-200">B시트</span>
                  <span>창고 출고 대장 (출고 지시서 자동 생성, 매출 시트 보안 격리)</span>
                </div>
                <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  ↓ 송장 번호 입력 시 매핑된 고객 스마트폰 무료 SMS 즉시 발송
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
                  <span>고객 알림 DB ("OO님 주문이 출고되었습니다" 무료 SMS)</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
                <span className="font-bold text-slate-700">💡 핵심 가치:</span>
                <span>창고 직원에게 매출 시트 노출 원천 차단 + 오배송 사고 0건</span>
              </div>
            </div>

            {/* Pipeline Card 2: B2B 기업 / 에이전시 */}
            <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wide">사례 02 · B2B 전문직 &amp; 에이전시</span>
                    <h3 className="font-extrabold text-base text-slate-900">영업 수주 ➔ 회계 정산 ➔ 입금 요청</h3>
                  </div>
                </div>
                <span className="text-[11px] font-black text-indigo-700 bg-indigo-100/70 px-2.5 py-1 rounded-lg">미수금 누락 0%</span>
              </div>

              {/* Data Flow Visual */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
                  <span>영업 수주 대장 (영업팀 계약 체결 및 발주 품목 입력)</span>
                </div>
                <div className="pl-6 text-[11px] text-indigo-600 font-bold flex items-center gap-1">
                  ↓ 공급가액, 세액(10%), 마진율 자동 계산 후 회계 원장 전송
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-800 rounded font-mono text-[11px] border border-indigo-200">B시트</span>
                  <span>회계 미수금 원장 (입금 기한별 정산 원장 기입, 영업팀 차단)</span>
                </div>
                <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  ↓ 결제일 D-3일 전 거래처 경리 담당자 스마트폰으로 무료 SMS
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
                  <span>거래처 경리 DB ("[OO상사] 세금계산서 입금 예정일 안내")</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
                <span className="font-bold text-slate-700">💡 핵심 가치:</span>
                <span>영업·회계팀 간 엑셀 대조 업무 0건 + 미수금 회수 속도 3배 향상</span>
              </div>
            </div>

            {/* Pipeline Card 3: 학원 / 병의원 / 컨설팅 */}
            <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide">사례 03 · 학원 &amp; 병의원 &amp; 상담</span>
                    <h3 className="font-extrabold text-base text-slate-900">상담 신청 ➔ 강사 배정 ➔ 노쇼 방지</h3>
                  </div>
                </div>
                <span className="text-[11px] font-black text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-lg">노쇼율 80% 감소</span>
              </div>

              {/* Data Flow Visual */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
                  <span>신규 상담·예약 접수처 (웹 설문지/홈페이지 신청서 접수)</span>
                </div>
                <div className="pl-6 text-[11px] text-amber-600 font-bold flex items-center gap-1">
                  ↓ 희망 시간대 분석 후 담당 강사/의사별 빈 시간대 자동 배정
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded font-mono text-[11px] border border-amber-200">B시트</span>
                  <span>스케줄 캘린더 대장 (강사·의사별 진료/수업 일정 자동 기입)</span>
                </div>
                <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  ↓ 배정 즉시 확정 안내 및 방문 D-1일 리마인드 무료 SMS 발송
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
                  <span>수강생·환자 DB (약도/준비물 포함 확정 &amp; 리마인드 SMS)</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
                <span className="font-bold text-slate-700">💡 핵심 가치:</span>
                <span>월 10만 원대 예약 솔루션 구독료 0원 + 노쇼(No-Show) 손실 원천 차단</span>
              </div>
            </div>

            {/* Pipeline Card 4: 제조 / 현장 AS */}
            <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-teal-50 text-teal-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-teal-600 uppercase tracking-wide">사례 04 · 제조업 &amp; 현장 AS 센터</span>
                    <h3 className="font-extrabold text-base text-slate-900">고장 접수 ➔ 부품 출고 ➔ 기사 출동</h3>
                  </div>
                </div>
                <span className="text-[11px] font-black text-teal-700 bg-teal-100/70 px-2.5 py-1 rounded-lg">전화 통화 0건</span>
              </div>

              {/* Data Flow Visual */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
                  <span>고객 AS 접수 센터 (장비 모델명 및 고장 증상 접수)</span>
                </div>
                <div className="pl-6 text-[11px] text-teal-600 font-bold flex items-center gap-1">
                  ↓ 수리 소요 부품 본사 재고 자동 차감 &amp; 수리 이력 대장 이관
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded font-mono text-[11px] border border-teal-200">B시트</span>
                  <span>본사 부품 재고 &amp; 수리 대장 (부품 재고 실시간 동기화)</span>
                </div>
                <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  ↓ 지역 관할 현장 기사에게 고객 정보·증상 담긴 출동 SMS 전송
                </div>
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
                  <span>현장 기사 및 고객 DB (출동 지시 SMS &amp; 고객 방문 예정 알림)</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
                <span className="font-bold text-slate-700">💡 핵심 가치:</span>
                <span>현장-창고-기사 간 전화 통화 0건 + 고객 AS 접수 당일 즉시 출동</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. 어떤 Pain을 해결해주나? (Before vs After 킬러 가치 제안 카드)
           ========================================================================= */}
        <div className="w-full space-y-8 pt-6">
          <div className="space-y-3 text-center">
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-600">
              Why SheetBot?
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
              "이런 번거로움, 시트봇 하나로 영구 작별하세요"
            </h2>
            <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
              개발자도 기피하는 복잡한 5대 진입 장벽을 단 0초 만에 해결했습니다.<br className="hidden sm:inline" />
              시트봇과 함께 가장 간편하고 안전하게 업무를 혁신해 보세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {/* Card 1 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
              <div className="space-y-3.5">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-amber-600 uppercase tracking-wide">핵심 해결 01</span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                    복잡한 API 키 &amp; 해외 결제 ZERO
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>해외 콘솔 가입, 달러 결제 카드 등록, 환율 및 수수료 부담</span>
                  </div>
                  <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span><strong>원클릭 시작</strong>: 로그인 즉시 내장 AI 가동, 간편한 국내 원화 결제 &amp; 세금계산서 지원</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
              <div className="space-y-3.5">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wide">핵심 해결 02</span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                    소스코드 키 노출 과금 위험 0%
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>시트 스크립트에 키 평문 노출, 공유 시 유출 및 해킹 과금 위험</span>
                  </div>
                  <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span><strong>특허급 터널 격리</strong>: 시트엔 실행 로직만 주입, API 키는 백엔드 터널로 안전 격리</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
              <div className="space-y-3.5">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-blue-600 uppercase tracking-wide">핵심 해결 03</span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                    구글 앱 연동, 클릭 한 번으로 끝
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>GCP 프로젝트 생성, OAuth 동의 화면 및 복잡한 권한 설정 오류</span>
                  </div>
                  <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span><strong>원클릭 표준 브릿지</strong>: 시트·Gmail·드라이브를 사전 승인 파이프라인으로 5초 완성</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
              <div className="space-y-3.5">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wide">핵심 해결 04</span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                    말 한마디로 끝나는 스마트 스케줄러
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>복잡한 Apps Script 트리거, 별도 웹훅·크론 서버 구축 부담</span>
                  </div>
                  <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span><strong>자연어 스케줄러</strong>: "매일 9시에 요약해 줘" 말 한마디로 자동 데이터 수집 및 예약 완료</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 5 */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
              <div className="space-y-3.5">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
                  <Workflow className="w-6 h-6" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-teal-600 uppercase tracking-wide">핵심 해결 05</span>
                  <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                    수천만 원 외주 개발비 획기적 절감
                  </h3>
                </div>
                <div className="space-y-2.5 pt-1">
                  <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                    <span>단순 데이터 취합·알림에도 수백~수천만 원 외주비와 수개월 소요</span>
                  </div>
                  <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span><strong>0원 문자 &amp; 즉시 가동</strong>: 1인 기업부터 중소기업까지 합리적인 비용으로 당일 즉시 도입</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to Action Box in Grid */}
            <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 p-6 sm:p-7 rounded-3xl shadow-xl text-white flex flex-col justify-between space-y-5 border border-emerald-500/30 relative overflow-hidden group">
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-3.5">
                <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl w-max border border-emerald-400/30 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6 text-amber-300" />
                </div>
                <div className="min-h-[3.25rem] flex flex-col justify-center">
                  <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wide">
                    ⚡ 5초 만에 무료 시작
                  </span>
                  <h3 className="font-black text-base sm:text-lg text-white break-keep mt-0.5 leading-snug">
                    지금 내 구글 시트에 AI를 장착하세요
                  </h3>
                </div>
                <div className="pt-1">
                  <div className="min-h-[4.25rem] flex items-center p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-emerald-100/80 leading-relaxed">
                    복잡한 설정 없이 구글 계정으로 로그인만 하면 모든 자동화 인프라가 준비됩니다.
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Link
                  href={session?.user ? "/dashboard" : "/login"}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold text-xs sm:text-sm rounded-xl text-center shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{session?.user ? "대시보드로 바로 이동하기" : "5초 만에 무료로 시작하기"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/use-cases"
                  className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white/90 font-bold text-xs rounded-xl text-center transition-all flex items-center justify-center gap-1 border border-white/10"
                >
                  <span>📖 1분 만에 끝나는 활용사례 보기</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
