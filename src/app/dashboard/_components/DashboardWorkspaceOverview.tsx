"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckSquare,
  Clock,
  Coins,
  Cpu,
  FileCode,
  KeyRound,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { DashboardWalletSummary } from "../_lib/types";

export function DashboardWorkspaceOverview({
  mounted,
  authAdminUser,
  fetchData,
  loading,
  isRealtimeLive,
  projectsCount,
  activeSchedulesCount,
  wallet,
  usageTokens,
  usageCalls,
  usageCostKrw,
  isAdminUser,
  currentModel,
  deviceCount,
  ruleCount,
  onOpenApiKeyModal,
  onOpenNewProjectModal,
}: {
  mounted: boolean;
  authAdminUser: { name?: string } | null | undefined;
  fetchData: (force?: boolean) => void;
  loading: boolean;
  isRealtimeLive: boolean;
  projectsCount: number;
  activeSchedulesCount: number;
  wallet: DashboardWalletSummary | null;
  usageTokens: number;
  usageCalls: number;
  usageCostKrw: number;
  isAdminUser: boolean;
  currentModel: string;
  deviceCount: number;
  ruleCount: number;
  onOpenApiKeyModal: () => void;
  onOpenNewProjectModal: () => void;
}) {
  return (
    <>
        {/* 1. 상단 웰컴 & 통계 헤더 */}
        <div
          className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5"
          data-easybot-hint="워크스페이스 개요: 로그인된 회원의 Apps Script 자동화 프로젝트와 스케줄 전반의 현황을 요약 표시합니다."
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-800 text-base" suppressHydrationWarning>
                  {mounted ? (authAdminUser?.name || "구글 회원") : "구글 회원"}님의 자동화 워크스페이스
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              {/* 실시간 DB 왓처 동기화 뱃지 (클릭 시 수동 즉시 동기화 통합) */}
              <button
                onClick={() => void fetchData(true)}
                disabled={loading}
                suppressHydrationWarning
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100/90 active:bg-slate-200/70 border border-slate-200/90 rounded-xl text-xs font-bold whitespace-nowrap shadow-2xs transition-all cursor-pointer group"
                title="실시간 감시 중 (클릭 시 즉시 수동 동기화)"
                data-easybot-hint="DB 왓처 실시간 동기화: 백엔드 DB 변경을 0초 만에 감지하여 자동 반영합니다. 클릭 시 즉시 수동 동기화를 실행할 수 있습니다."
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRealtimeLive ? "bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20" : "bg-slate-300"}`} />
                <span className={isRealtimeLive ? "text-emerald-700 font-extrabold" : "text-slate-400"}>
                  {isRealtimeLive ? "⚡ DB 왓처 실시간 동기화" : "스트림 연결 중..."}
                </span>
                <RefreshCw className={`w-3 h-3 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0 ${loading ? "animate-spin text-emerald-600" : ""}`} />
              </button>

              {/* 스마트 통합 할 일 허브 바로가기 */}
              <Link
                href="/tasks"
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap cursor-pointer"
                data-easybot-hint="스마트 통합 할 일 허브: 통화 녹음, 부재중 전화, 주문 지연에서 추출된 모든 후속 과업을 한곳에서 관리합니다."
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>할 일 허브</span>
              </Link>

              {/* 에이전트 API 키 */}
              <button
                onClick={onOpenApiKeyModal}
                className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:opacity-95 text-white text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-indigo-500/20 cursor-pointer whitespace-nowrap"
                data-easybot-hint="에이전트 API 키: 안티그라비티 등 외부 AI 에이전트가 내 시트에 자동 접근할 수 있는 개인 API 키를 조회하고 관리합니다."
              >
                <KeyRound className="w-3.5 h-3.5 text-violet-200 shrink-0" />
                <span>에이전트 API 키</span>
              </button>
            </div>
          </div>

          {/* 4대 핵심 자원 & 현황 요약 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 카드 1: 래핑 프로젝트 & 스케줄 */}
            <div
              className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-2xl border border-slate-200/80 transition-all flex flex-col justify-between"
              data-easybot-hint="내 래핑 프로젝트: 현재 내 구글 계정에 등록되어 스프레드시트에 래핑된 Apps Script 프로젝트와 가동 중인 스케줄 현황입니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-500">내 래핑 프로젝트</span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                    <FileCode className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight" suppressHydrationWarning>
                    {mounted ? projectsCount : 0}
                  </span>
                  <span className="text-xs font-bold text-slate-500">개 시트</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>활성 스케줄 <strong className="text-amber-700 font-bold">{activeSchedulesCount}개</strong> 가동</span>
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">자동화 관리</span>
                <button
                  onClick={onOpenNewProjectModal}
                  className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  <span>+ 새 프로젝트</span>
                </button>
              </div>
            </div>

            {/* 카드 2: AI 토큰 지갑 & 충전 */}
            <div
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                wallet && wallet.balanceTokens < 0
                  ? "bg-rose-50/60 hover:bg-rose-50/80 border-rose-300"
                  : "bg-amber-50/40 hover:bg-amber-50/60 border-amber-200/70"
              }`}
              data-easybot-hint="AI 토큰 잔여량: Apps Script 코드 생성 및 AI 대화에 사용되는 보유 크레딧 잔액입니다. 마이너스 잔액 시 다음 충전 시 자동 차감 정산됩니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-xs font-bold ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-900" : "text-amber-900"
                    }`}
                  >
                    {wallet && wallet.balanceTokens < 0 ? "AI 토큰 (초과 사용)" : "AI 토큰 지갑"}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                      wallet && wallet.balanceTokens < 0
                        ? "bg-rose-200/80 text-rose-800"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    suppressHydrationWarning
                    className={`text-2xl font-black tracking-tight ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-700" : "text-amber-900"
                    }`}
                  >
                    {(wallet?.balanceTokens ?? 20000).toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      wallet && wallet.balanceTokens < 0 ? "text-rose-600" : "text-amber-700"
                    }`}
                  >
                    Token
                  </span>
                </div>
                <p
                  className={`text-[11px] font-medium mt-1 flex flex-wrap items-center gap-1.5 ${
                    wallet && wallet.balanceTokens < 0 ? "text-rose-800/90" : "text-amber-800/80"
                  }`}
                >
                  {wallet && wallet.balanceTokens < 0 ? (
                    <span className="px-1.5 py-0.2 bg-rose-200/80 text-rose-900 rounded font-bold text-[10px]">
                      ⚠️ 초과 사용분 (다음 충전 시 자동 상계)
                    </span>
                  ) : (
                    <>
                      <span suppressHydrationWarning className="px-1.5 py-0.2 bg-amber-200/60 text-amber-900 rounded font-bold text-[10px]">
                        {wallet?.tier || "FREE"} 플랜
                      </span>
                      <span>보유 중</span>
                    </>
                  )}
                  {wallet?.totalPurchasedTokens ? (
                    <span className="text-[10px] opacity-80 font-semibold">
                      (총 적립 {wallet.totalPurchasedTokens.toLocaleString()})
                    </span>
                  ) : null}
                </p>
              </div>

              <div
                className={`pt-3 mt-3 border-t flex items-center justify-between text-[11px] ${
                  wallet && wallet.balanceTokens < 0 ? "border-rose-200/80" : "border-amber-200/60"
                }`}
              >
                <span
                  className={`font-medium ${
                    wallet && wallet.balanceTokens < 0 ? "text-rose-700" : "text-amber-700/80"
                  }`}
                >
                  {wallet && wallet.balanceTokens < 0 ? "정산 필요" : "선불형 크레딧"}
                </span>
                <Link
                  href="/dashboard/pricing"
                  prefetch={false}
                  className={`font-bold flex items-center gap-0.5 hover:underline ${
                    wallet && wallet.balanceTokens < 0
                      ? "text-rose-900 hover:text-rose-950 font-black"
                      : "text-amber-800 hover:text-amber-950"
                  }`}
                >
                  <span>{wallet && wallet.balanceTokens < 0 ? "정산 및 충전 ➔" : "토큰 충전 ➔"}</span>
                </Link>
              </div>
            </div>

            {/* 카드 3: AI 사용량 관제 */}
            <div
              className="bg-indigo-50/40 hover:bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200/70 transition-all flex flex-col justify-between"
              data-easybot-hint={
                isAdminUser
                  ? `AI 사용량 관제: 이번 달 호출된 총 AI 토큰과 구글 클라우드에 납부될 순수 API 원가(실비용 ₩${usageCostKrw.toLocaleString()}원)를 모니터링합니다.`
                  : "AI 사용량 관제: 이번 달 스프레드시트 자동화 코드 생성 및 어시스턴트에 사용된 총 AI 토큰과 호출 횟수입니다."
              }
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-indigo-900">당월 AI 사용량</span>
                  <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span suppressHydrationWarning className="text-2xl font-black text-indigo-900 tracking-tight">
                    {usageTokens.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-indigo-700">Token</span>
                </div>
                <div className="text-[11px] text-indigo-800/80 font-medium mt-1 flex flex-wrap items-center gap-1.5">
                  <span suppressHydrationWarning>총 <strong>{usageCalls}회</strong> 자동화 호출</span>
                  {isAdminUser && (
                    <span suppressHydrationWarning className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-200/60 text-indigo-950 font-bold border border-indigo-300/60">
                      API 원가 ₩{usageCostKrw.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-indigo-200/60 flex items-center justify-between text-[11px]">
                <span className="text-indigo-700/80 font-medium">사용량 분석</span>
                <Link
                  href="/dashboard/ai-usage"
                  prefetch={false}
                  className="text-indigo-800 hover:text-indigo-950 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>사용량 관제 ➔</span>
                </Link>
              </div>
            </div>

            {/* 카드 4: AI 모델 환경 설정 */}
            <div
              className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-2xl border border-slate-200/80 transition-all flex flex-col justify-between"
              data-easybot-hint="AI 모델 환경 설정: 코드 생성 및 어시스턴트에 적용되는 Google Gemini 모델과 파라미터를 변경합니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-700">적용 AI 모델</span>
                  <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-slate-800 tracking-tight truncate max-w-full">
                    {currentModel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">Apps Script 코드 특화</span>
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">파라미터 설정</span>
                <Link
                  href="/dashboard/settings"
                  prefetch={false}
                  className="text-slate-700 hover:text-indigo-600 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>모델 설정 ➔</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 구글 메시지 스마트 알림 & 인프라 연결 통합 배너 */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-2xl p-4 sm:p-5 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-extrabold text-sm text-slate-800">
                    시트봇 모바일 에이전트
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    통신비 0원
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                    연동 폰 {deviceCount}대 · 발송 규칙 {ruleCount}개
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  구글 시트 ↔ 스마트폰 양방향 자동화 · 통신비 0원 고객 문자 발송 및 포스 결제 알림 실시간 시트 기록
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-white/80 px-2.5 py-1.5 rounded-xl border border-slate-200/80">
                <span className={`w-2 h-2 rounded-full ${deviceCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                <span className={`font-bold ${deviceCount > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                  {deviceCount > 0 ? "모바일 에이전트 활성" : "에이전트 미연동"}
                </span>
              </div>

              <Link
                href="/dashboard/notifications"
                prefetch={false}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 active:scale-95 cursor-pointer"
                data-easybot-hint="시트봇 모바일 에이전트: 스마트폰을 페어링하여 통신비 0원 고객 문자 발송 및 실시간 결제 수신을 구글 시트와 양방향 자동화합니다."
              >
                <span>시트봇 모바일 에이전트 열기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* 마켓플레이스 3대 핵심 템플릿 추천 배너 */}
          <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-slate-900 rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md shadow-indigo-500/10">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-900 text-[10px] font-black">
                    100% 무료 제공
                  </span>
                  <h4 className="font-black text-sm text-white">
                    SheetBot 공식 검증 5대 킬러 자동화 템플릿
                  </h4>
                </div>
                <p className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                  매장 POS 결제 장부 · 문자 대량 발송 · Gmail 일괄 발송 · 명함/영수증 AI OCR · 통화 녹음 AI 분석 시트를 클릭 1번에 내 구글 드라이브로 복제하세요.
                </p>
              </div>
            </div>

            <Link
              href="/marketplace"
              prefetch={false}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-indigo-950 text-xs font-black rounded-xl shadow-md transition-all shrink-0 active:scale-95 self-end sm:self-center"
              data-easybot-hint="템플릿 마켓플레이스: 실무 검증 4대 시트를 즉시 내 구글 드라이브로 복제합니다."
            >
              <span>템플릿 둘러보기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
    </>
  );
}
