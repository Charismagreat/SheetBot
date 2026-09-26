"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuthAdmin } from "@/contexts/AuthAdminContext";
import { onUserDataChanged } from "@/lib/egdesk-helpers";
import {
  DEFAULT_GUIDE_STEPS,
  DEFAULT_RECIPES,
  type GuideStep,
  type GuideRecipe,
} from "@/lib/default-guide-data";
import {
  BookOpen,
  Sparkles,
  Play,
  FileSpreadsheet,
  Clock,
  Zap,
  ArrowRight,
  ShieldCheck,
  Code,
  FileCode,
  CheckCircle2,
  HelpCircle,
  Copy,
  ChevronRight,
  Smartphone,
  Bot,
  MessageSquare,
  Move,
  Coins,
  QrCode,
  Send,
  Layers,
  UploadCloud,
  FileUp,
  RefreshCw,
  FolderPlus,
  KeyRound,
  Terminal,
  Database,
  Search,
  Mail,
  Contact,
  Landmark,
  Scale,
  PhoneCall,
  Printer,
  Building2,
  Crown,
  User,
} from "lucide-react";

// 아이콘 이름 맵
const ICON_MAP: Record<string, any> = {
  Smartphone,
  Mail,
  Bot,
  UploadCloud,
  FolderPlus,
  Contact,
  Sparkles,
  Clock,
  Zap,
  MessageSquare,
  FileSpreadsheet,
  KeyRound,
  FileCode,
  Code,
  Database,
  Search,
  Landmark,
  Scale,
  PhoneCall,
  Printer,
};

export default function GuidePage() {
  // ⚡ [인헤릿 최상위 상속] NextAuth 세션 및 관리자 정보 즉시 상속 (로딩 대기 0ms)
  const { session, userEmail, isAdmin } = useAuthAdmin();

  // ⚡ [SWR 통합 번들 캐시 복원] 세션 스토리지에서 이전 가이드 번들 즉시 복원 (0초 렌더링)
  const [cachedBundle] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sb_guide_bundle");
        return saved ? JSON.parse(saved) : null;
      } catch {}
    }
    return null;
  });

  const [steps, setSteps] = useState<GuideStep[]>(() => cachedBundle?.steps || DEFAULT_GUIDE_STEPS);
  const [examples, setExamples] = useState<GuideRecipe[]>(() => cachedBundle?.recipes || DEFAULT_RECIPES);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const isFetchingRef = useRef<boolean>(false);

  // ⚡ [가이드 통합 번들 단일 조회 헬퍼] /api/guide/bootstrap 호출로 실전 레시피 대장 수집
  const fetchGuideBootstrap = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!silent) setLoading(true);
      const res = await apiFetch("/api/guide/bootstrap");
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.steps) && data.steps.length > 0) setSteps(data.steps);
        if (Array.isArray(data.recipes) && data.recipes.length > 0) setExamples(data.recipes);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("sb_guide_bundle", JSON.stringify(data));
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[Guide Bootstrap] 조회 오류:", e);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  // ⚡ [부트스트랩 & 0초 실시간 DB 왓처] 마운트 시 1회 최신화 및 DB 프롬프트 등록 실시간 반영
  useEffect(() => {
    void fetchGuideBootstrap(Boolean(cachedBundle?.recipes?.length));

    // ⚡ [0초 실시간 감시] sheetbot_prompt_templates 테이블 변경 이벤트 수신 시 0초 화면 갱신
    const unsub = onUserDataChanged((event) => {
      setIsRealtimeLive(true);
      if (!event.tableName || event.tableName === "sheetbot_prompt_templates") {
        void fetchGuideBootstrap(true);
      }
    });

    return () => {
      unsub();
    };
  }, [fetchGuideBootstrap, cachedBundle?.recipes?.length]);

  const handleCopy = (text: string, id: string) => {
    // 로그인된 회원이면 프롬프트 내의 플레이스홀더를 스마트하게 치환
    let finalText = text;
    if (userEmail) {
      finalText = finalText.replace("help@company.com", userEmail);
    }
    navigator.clipboard.writeText(finalText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20 text-left">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* 상단 타이틀 배너 */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-300 text-xs font-bold border border-white/10">
                <BookOpen className="w-3.5 h-3.5" />
                <span>사용 가이드 &amp; 업무 자동화 마스터 레시피</span>
              </div>
              {userEmail && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 backdrop-blur-md rounded-full text-emerald-200 text-xs font-bold border border-emerald-400/30 animate-fade-in">
                  <User className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{session?.user?.name || userEmail.split("@")[0]} 님</span>
                </div>
              )}
              {isAdmin && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 backdrop-blur-md rounded-full text-amber-200 text-xs font-bold border border-amber-400/30 animate-fade-in">
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>관리자 프리패스</span>
                </div>
              )}
              {isRealtimeLive && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-300 text-[11px] font-bold border border-white/10 animate-fade-in">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>0초 실시간</span>
                  <button
                    type="button"
                    onClick={() => fetchGuideBootstrap(false)}
                    disabled={loading}
                    className="ml-1 text-emerald-300 hover:text-white p-0.5 rounded cursor-pointer disabled:opacity-50"
                    title="최신 레시피 새로고침"
                  >
                    <Clock className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight break-keep">
              SheetBot 완벽 가이드:<br />
              구글 시트 자동화부터 통신비 0원 문자 발송까지
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed break-keep">
              복잡한 코딩이나 통신사 유료 API 계약 없이도 충분합니다.
              Google Apps Script(GAS) 자동 생성, 정기 스케줄 실행, 내 폰을 통한 무료 문자 자동 발송, 
              그리고 이전 대화를 기억하는 시트봇 AI까지 누구나 3분 만에 시작할 수 있는 실전 가이드를 확인하세요.
            </p>
            <div className="pt-3 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
              >
                <span>{userEmail ? "내 대시보드로 이동" : "내 워크스페이스 시작하기"}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/notifications"
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-emerald-300" />
                <span>스마트폰 연동 &amp; 무료 문자 설정</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 5단계 시작 가이드 */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Step-by-Step Roadmap</span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight break-keep">
              누구나 3분 만에 마스터하는 5단계 자동화 여정
            </h2>
            <p className="text-xs text-slate-500 break-keep">
              구글 계정 로그인부터 스마트폰 연동, AI 비서 협업까지 직관적인 단계로 구성되어 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs flex items-center justify-center border border-emerald-200/60">
                      {s.step}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-extrabold">
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900 leading-snug break-keep">{s.title}</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed break-keep">{s.desc}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10.5px] text-slate-600">
                  <strong className="text-slate-800">💡 팁:</strong> {s.tip}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 스마트 알림(SMS) 심층 가이드 섹션 */}
        <section className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-3xl p-6 sm:p-10 border border-emerald-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black">
                <Smartphone className="w-3.5 h-3.5" />
                <span>신규 기능: 통신 비용 0원 문자 자동화</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 break-keep">
                내 안드로이드 폰을 SheetBot Agent2로 연동하는 방법
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed break-keep">
                시중의 알림톡/문자 대행 서비스(건당 15~40원) 대신, 내가 사용하는 안드로이드 스마트폰(요금제 기본 제공 무제한 문자)에 
                SheetBot Agent2를 설치해 연동하여 구글 시트 이벤트 발생 시 0원으로 문자를 자동 발송하고 수신 문자를 기록할 수 있습니다.
              </p>
            </div>

            <Link
              href="/dashboard/notifications"
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 self-start md:self-auto"
            >
              <span>스마트 알림 센터 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">0초 QR코드 스캔 페어링</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                스마트폰의 <strong>SheetBot Agent2 앱 ➔ [QR 페어링]</strong>을 누르고, 화면의 QR코드를 비추면 0초 만에 즉시 연동됩니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">자연어 규칙 한 줄 입력</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                "입금완료로 바뀌면 고객 연락처로 안내 문자 발송"이라고 입력하면, AI가 발송 조건과 메시지 템플릿을 자동으로 구조화해 등록합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-teal-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">스프레드시트 실시간 발송</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                시트에서 행 데이터가 수정되거나 추가되면 AI가 조건을 판별하여 내 스마트폰을 통해 고객 또는 나에게 문자를 실시간 발송합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 신규 기능: AI 에이전트 원격 브릿지 & 견적서·보고서 양식 완성 가이드 */}
        <section className="bg-gradient-to-r from-violet-50 via-slate-50 to-indigo-50 rounded-3xl p-6 sm:p-10 border border-violet-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-700 text-white rounded-full text-xs font-black">
                <Bot className="w-3.5 h-3.5" />
                <span>핵심 업그레이드: 개인 API 키 기반 원스톱 자동화 &amp; 안티그라비티 연동</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 break-keep">
                안티그라비티(Antigravity)와 시트봇의 100% 완전 자동화 연동
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed break-keep">
                시트봇 대시보드에 일일이 들어와 프로젝트를 만들지 않아도 됩니다. 
                로그인 즉시 자동 발급된 <strong>내 개인 API 키(sk_sheetbot_...)</strong>와 구글 시트 주소만 안티그라비티에 던지면, 
                프로젝트 생성부터 10행 헤더/데이터 분석, Apps Script 코드 작성, 구글 클라우드 원클릭 배포까지 단 한 번의 대화로 완성됩니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-auto">
              <Link
                href="/dashboard"
                className="px-5 py-3 bg-violet-900 hover:bg-violet-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-violet-300" />
                <span>대시보드에서 내 API 키 확인</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 2가지 연동 방식 비교 배너 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-white/90 border border-violet-200 shadow-2xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 font-extrabold text-[10px]">
                  방식 A (강력 추천!)
                </span>
                <h4 className="font-extrabold text-xs text-slate-900 break-keep">개인 API 키 원스톱 자동 생성 &amp; 배포</h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                대시보드 상단 <strong>[🔑 에이전트 API 키]</strong>를 복사한 후, 안티그라비티에게 "내 API 키는 sk_...이고, 이 시트 주소로 프로젝트 만들어서 배포해줘"라고만 하세요. 프로젝트 생성부터 배포까지 알아서 끝냅니다.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/90 border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-extrabold text-[10px]">
                  방식 B
                </span>
                <h4 className="font-extrabold text-xs text-slate-900 break-keep">프로젝트별 브릿지 URL 복사 &amp; 주입</h4>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                이미 생성된 프로젝트가 있다면 카드 우측의 <strong>[🤖 AI 연동 주소 복사]</strong>를 눌러 고유 브릿지 웹 주소(gas-bridge?token=...)를 AI 채팅창에 전달하여 대화형으로 코드를 수정하고 주입할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 4단계 프로세스 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-violet-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">개인 API 키 자동 확인</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                시트봇 회원가입 즉시 20,000 웰컴 토큰과 함께 고유 개인 API 키(sk_sheetbot_...)가 자동 발급됩니다. 워크스페이스 상단에서 클릭 한 번으로 복사할 수 있습니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">안티그라비티 원격 프로젝트 생성</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                안티그라비티에게 키와 시트 주소만 주면 AI가 시트봇 API를 호출하여 시트 구조(탭, 10행 헤더, 샘플 데이터)를 자동 분석하고 프로젝트를 원격 등록합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">10행 헤더 &amp; SQLite DB 연동</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                견적서 고정 셀/하단 =SUM 수식 보존은 물론, "내 PC의 SQLite DB에서 발주 내역 뽑아서 시트에 채워줘"와 같은 복합 자동화 로직도 Apps Script로 완성합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">구글 클라우드 원클릭 배포</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                안티그라비티가 완성된 코드를 브릿지 URL로 전송하면 구글 스프레드시트에 즉시 자동 배포되며, 상단 메뉴 등록 및 주기적 정기 스케줄까지 자율 가동됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* 신규 기능: Google Drive SQLite 양방향 연동 & 시트/사이드바 수정·삭제(CRUD) & AI 자연어 검색 가이드 */}
        <section className="bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 rounded-3xl p-6 sm:p-10 border border-emerald-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-700 text-white rounded-full text-xs font-black">
                <Database className="w-3.5 h-3.5" />
                <span>엔터프라이즈 신기능: Google Drive SQLite 양방향 동기화 &amp; 풀 CRUD</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 break-keep">
                구글 드라이브 SQLite 연동: 데이터 전송·조회·수정·삭제(CRUD)
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed break-keep">
                스프레드시트의 방대한 데이터를 구글 드라이브의 SQLite DB 파일(<strong>SheetBot_Databases/파일명.sqlite</strong>)로 안전하게 아카이빙하고,
                정밀 조건 검색과 <strong>Gemini AI 자연어(Text-to-SQL)</strong>를 통해 원하는 데이터만 시트에 즉시 추출합니다.
                추출된 데이터는 시트에서 직접 수정하거나 사이드바 폼을 통해 SQLite DB와 양방향으로 실시간 동기화할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 3대 핵심 메뉴 및 CRUD 아키텍처 안내 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-5 rounded-2xl bg-white border border-emerald-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                  메뉴 [1] 데이터 전송
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">구글 드라이브 SQLite 자동 동기화</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                시트에서 미전송 상태인 주문/거래 내역을 원클릭으로 구글 드라이브 지정 폴더의 SQLite DB 파일로 안전하게 전송합니다. 전송된 행은 초록색 완료 라벨이 마킹되어 중복 전송이 방지됩니다.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-indigo-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-extrabold text-[10px]">
                  메뉴 [2] 데이터 조회
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">조건 필터 &amp; AI 자연어 (Text-to-SQL)</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                기간, 상호, 금액 등 상세 조건 검색뿐만 아니라, "지난달 주문금액 상위 5건"처럼 일상어로 질문하면 AI가 SQL로 즉시 변환하여 시트에 자동 서식과 합계 행을 구성해 추출합니다.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-teal-100 shadow-2xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-extrabold text-[10px]">
                  메뉴 [3] 수정·삭제 (CRUD)
                </span>
              </div>
              <h4 className="font-extrabold text-xs text-slate-900 break-keep">시트 직접 편집 &amp; 사이드바 폼 제어</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed break-keep">
                'SQLite_조회결과' 탭에서 수량/금액을 바꾸거나 상태를 '삭제'로 변경한 뒤 메뉴 [3]을 누르면 DB에 일괄 반영됩니다. 사이드바 [행 수정/삭제] 탭에서 개별 건을 불러와 정밀 수정·삭제도 가능합니다.
              </p>
            </div>
          </div>

          {/* 2중 안전장치 배너 */}
          <div className="bg-white/80 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-700">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span><strong>A열 SQLite ID 완벽 보호:</strong> 시트 날짜 서식 오염을 방지하는 정수 서식 강제 및 날짜 오인식 역산 2중 방어 코드가 적용되어 대량 데이터도 안전하게 동기화됩니다.</span>
            </div>
          </div>
        </section>

        {/* 실전 업무 자동화 프롬프트 템플릿 6종 */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Best Recipes</span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight break-keep">
                복사해서 바로 쓰는 실전 자동화 프롬프트 레시피
              </h2>
            </div>
            <span className="text-xs text-slate-400">클릭 시 프롬프트 문구가 클립보드에 바로 복사됩니다.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {examples.map((ex) => {
              const IconComp = (ex as any).icon || ICON_MAP[ex.iconName] || Sparkles;
              return (
                <div
                  key={ex.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-md transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 ${ex.color}`}>
                        <IconComp className="w-3 h-3" />
                        <span>{ex.tag}</span>
                      </span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-snug break-keep">{ex.title}</h3>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-[11px] text-slate-700 leading-relaxed select-all">
                      "{ex.prompt}"
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopy(ex.prompt, ex.id)}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {copiedId === ex.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-extrabold">복사 완료! 생성기/규칙창에 붙여넣으세요</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>프롬프트 복사하기</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 시트봇 AI 비서 100% 활용 팁 섹션 */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-xl space-y-6 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-amber-300 rounded-full text-xs font-bold border border-white/10">
              <Bot className="w-3.5 h-3.5" />
              <span>우측 하단 플로팅 비서</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight break-keep">
              시트봇 AI (SheetBot AI) 100% 활용 꿀팁
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed break-keep">
              화면 우측 하단의 시트봇 AI는 단순한 챗봇이 아닙니다. 내 구글 시트 작업을 옆에서 지켜보며 코드를 작성해 주는 1:1 페어 프로그래머입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10 pt-2 text-xs">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Move className="w-4 h-4" />
                <span>마우스 드래그 &amp; 8방향 크기 조절</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed break-keep">
                상단 바를 잡고 원하는 위치로 이동하거나 테두리를 당겨 자유롭게 창 크기를 조절할 수 있으며, 설정한 위치와 크기는 브라우저에 자동 기억됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>회원별 대화 내용 클라우드 영구 기억</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed break-keep">
                로그인된 계정으로 과거 나눈 대화가 안전하게 영구 저장되어, 페이지를 새로고침(F5)하거나 다른 PC에서 접속해도 대화 맥락이 그대로 복원됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-bold">
                <Coins className="w-4 h-4" />
                <span>관리자(ADMIN) 전액 면제 &amp; 토큰 충전</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed break-keep">
                관리자 계정은 대화 토큰이 무제한 무료로 제공되며, 일반 회원은 내 워크스페이스 요약 카드의 [토큰 충전] 버튼에서 1회성 선불형으로 부담 없이 이용할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 추가 가이드 및 문의 배너 */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-50 to-indigo-50 border border-amber-200/60 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="text-base font-black text-slate-900 break-keep">더 궁금한 점이 있으신가요?</h3>
            <p className="text-xs text-slate-600 break-keep">
              우측 하단 <strong>시트봇 AI</strong>에게 실시간으로 질문하시거나, 1:1 고객 문의 게시판을 통해 언제든 운영팀의 지원을 받으세요!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/faq"
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all shadow-2xs shrink-0"
            >
              FAQ 둘러보기
            </Link>
            <Link
              href="/contact"
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0"
            >
              1:1 운영팀 문의하기
            </Link>
          </div>
        </div>

        {/* 기업 전용 맞춤 경량 ERP 및 AX 구축 안내 배너 */}
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-800/40 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-teal-400/20 text-teal-300 text-[11px] font-bold border border-teal-400/30">
              <Building2 className="w-3.5 h-3.5" />
              <span>중소기업·소상공인 전용 턴키 구축</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black break-keep">
              직접 개발하기엔 전산 인력이 부족하신가요?
            </h3>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed break-keep">
              사내 개발팀 없이도 <strong>1~2주 안에 대표님 회사 전용 경량 ERP / MES</strong>를 완벽히 구축해 드립니다. (정부지원금 최대 90% 매칭)
            </p>
          </div>
          <Link
            href="/enterprise"
            className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 active:scale-95"
          >
            <span>기업 맞춤 AX 구축 상담 신청</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
