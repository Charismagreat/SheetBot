"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, FileCode, Clock, RefreshCw, CheckCircle2, AlertTriangle,
  X, ArrowRight, ExternalLink, Sparkles, Layers, ShieldCheck, Trash2, Smartphone, Edit3,
  Globe, Star, Coins, Activity, Cpu, Settings, FileSpreadsheet, Copy
} from "lucide-react";
import Navbar from "@/components/Navbar";
import nextDynamic from "next/dynamic";

const NewProjectModal = nextDynamic(() => import("@/components/NewProjectModal"));
const EditProjectPromptModal = nextDynamic(() => import("@/components/EditProjectPromptModal"));
const ScheduleManager = nextDynamic(() => import("@/components/ScheduleManager"));
const PromptGalleryModal = nextDynamic(() => import("@/components/PromptGalleryModal"));
const FeedbackModal = nextDynamic(() => import("@/components/FeedbackModal"));

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [projects, setProjects] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 요약 카드용 실시간 계정 자원 상태
  const [wallet, setWallet] = useState<{
    balanceTokens: number;
    totalPurchasedTokens?: number;
    totalUsedTokens?: number;
    tier: string;
  } | null>(null);
  const [usageCostKrw, setUsageCostKrw] = useState<number>(0);
  const [usageTokens, setUsageTokens] = useState<number>(0);
  const [usageCalls, setUsageCalls] = useState<number>(0);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [ruleCount, setRuleCount] = useState<number>(0);
  const [currentModel, setCurrentModel] = useState<string>("Gemini 3.8 Flash");

  // 추천 프롬프트 갤러리 및 피드백 모달 상태
  const [isPromptGalleryOpen, setIsPromptGalleryOpen] = useState(false);
  const [feedbackTargetProject, setFeedbackTargetProject] = useState<any | null>(null);

  // 데이터 로드
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const userParam = session?.user?.email ? `&userEmail=${encodeURIComponent(session.user.email)}` : "";
      const [projRes, schedRes, walletRes, usageRes, devRes, ruleRes, settingsRes] = await Promise.all([
        apiFetch(`/api/projects?_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/schedules?_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/wallet?_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/admin/ai-usage?range=month&limit=1${userParam}&_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/user/devices?_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/user/smart-rules?_t=${now}`).then((r) => r.json()).catch(() => ({})),
        apiFetch(`/api/admin/settings?_t=${now}`).then((r) => r.json()).catch(() => ({})),
      ]);

      if (projRes?.success) setProjects(projRes.projects || []);
      if (schedRes?.success) setSchedules(schedRes.schedules || []);
      if (walletRes?.success && walletRes.wallet) setWallet(walletRes.wallet);
      if (usageRes?.success) {
        setIsAdminUser(!!usageRes.isAdmin);
        if (usageRes.summary) {
          setUsageCostKrw(usageRes.summary.totalCostKrw ?? usageRes.summary.costKrw ?? 0);
          setUsageTokens(usageRes.summary.totalTokens ?? 0);
          setUsageCalls(usageRes.summary.totalCalls ?? 0);
        }
      }
      if (devRes?.success) setDeviceCount((devRes.devices || []).length);
      if (ruleRes?.success) setRuleCount((ruleRes.rules || []).length);
      if (settingsRes?.success && settingsRes.settings?.defaultModel) {
        // 보기 좋은 모델 라벨 정리
        const m = settingsRes.settings.defaultModel;
        setCurrentModel(
          m === "gemini-3.8-flash" ? "Gemini 3.8 Flash" :
          m === "gemini-3.5-flash" ? "Gemini 3.5 Flash" :
          m === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : m
        );
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    if (status === "unauthenticated") {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const match = currentPath.match(/^(\/t\/[^\/]+\/p\/[^\/]+)/);
      const prefix = match ? match[1] : "";
      window.location.href = `${prefix}/login`;
    } else if (status === "authenticated") {
      fetchData();
    }
  }, [status, fetchData]);

  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);
  const [syncingCodeProjectId, setSyncingCodeProjectId] = useState<string | null>(null);

  const showAlert = (msg: { type: "success" | "error"; text: string }) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 5000);
  };

  // 구글 시트에서 직접 수정한 최신 Apps Script 코드를 SheetBot DB로 동기화하는 핸들러
  const handleSyncProjectCode = async (p: any) => {
    setSyncingCodeProjectId(p.id);
    try {
      const res = await apiFetch("/api/projects/sync-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!data?.success) {
        throw new Error(data?.error || "구글 시트 코드 동기화에 실패했습니다.");
      }

      // 로컬 프로젝트 목록의 scriptCode 즉시 갱신
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === p.id
            ? {
                ...proj,
                scriptCode: data.scriptCode,
                script_code: data.scriptCode,
                updatedAt: data.syncedAt,
                updated_at: data.syncedAt,
              }
            : proj
        )
      );

      showAlert({
        type: "success",
        text: `'${p.name}' 구글 시트의 최신 Apps Script 코드(${data.functionNames?.length || 0}개 함수)가 SheetBot DB에 동기화되었습니다.`,
      });
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "코드 동기화 중 오류가 발생했습니다." });
    } finally {
      setSyncingCodeProjectId(null);
    }
  };

  // 구글 시트 원본 제목으로 프로젝트 이름 동기화 핸들러
  const handleSyncProjectTitle = async (p: any) => {
    const urlOrId = p.spreadsheetUrl || p.spreadsheet_url || p.spreadsheetId || p.spreadsheet_id;
    if (!urlOrId) {
      showAlert({ type: "error", text: "연결된 구글 시트 URL 또는 ID 정보가 없습니다." });
      return;
    }

    setSyncingProjectId(p.id);
    try {
      // 1. 최신 시트 원본 제목 조회
      const titleRes = await apiFetch(`/api/sheets/title?url=${encodeURIComponent(urlOrId)}`);
      const titleData = await titleRes.json().catch(() => ({}));

      if (!titleData?.success || !titleData?.title) {
        throw new Error(titleData?.error || "구글 시트 제목을 가져오지 못했습니다.");
      }

      const newTitle = titleData.title.trim();

      // 2. DB 프로젝트 이름 업데이트 및 Apps Script 코드 구글 클라우드 재배포 (PATCH)
      const updateRes = await apiFetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, name: newTitle, redeploy: true }),
      });
      const updateData = await updateRes.json().catch(() => ({}));

      if (!updateData?.success) {
        throw new Error(updateData?.error || "프로젝트 이름 업데이트에 실패했습니다.");
      }

      // 3. 로컬 프로젝트 목록 즉시 갱신
      setProjects((prev) =>
        prev.map((proj) => (proj.id === p.id ? { ...proj, name: newTitle } : proj))
      );

      showAlert({
        type: "success",
        text: `'${newTitle}' 시트명 동기화 및 자동화 코드 클라우드 배포가 완료되었습니다.`,
      });
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "시트 이름 동기화에 실패했습니다." });
    } finally {
      setSyncingProjectId(null);
    }
  };

  const handleDeleteProject = async (p: any) => {
    if (!window.confirm(`'${p.name}' 프로젝트를 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/projects?id=${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showAlert({ type: "success", text: "프로젝트가 성공적으로 삭제되었습니다." });
        fetchData();
      } else {
        showAlert({ type: "error", text: data.error || "삭제 실패" });
      }
    } catch (err: any) {
      showAlert({ type: "error", text: err.message || "통신 오류" });
    }
  };

  if (status === "loading" || (!session?.user && status !== "unauthenticated")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm font-bold">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
          <span>구글 계정 세션 확인 중...</span>
        </div>
      </div>
    );
  }

  const activeSchedulesCount = schedules.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 text-left">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 알림 토스트 */}
        {alertMessage && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-fade-in ${
              alertMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {alertMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{alertMessage.text}</span>
            </div>
            <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
                <h2 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>{session?.user?.name || "구글 회원"}님의 자동화 워크스페이스</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-md flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>회원 전용 보관</span>
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  계정: <span className="font-mono text-slate-600">{session?.user?.email || ""}</span> (이지데스크 백엔드 클라우드와 안전하게 동기화됨)
                </p>
              </div>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer w-max"
              data-easybot-hint="새로고침: 최신 프로젝트 목록 및 스케줄 실행 상태를 My DB에서 다시 동기화합니다."
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-600" : ""}`} />
              <span>새로고침</span>
            </button>
          </div>

          {/* 4대 핵심 자원 & 현황 요약 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 카드 1: 연동 프로젝트 & 스케줄 */}
            <div
              className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-2xl border border-slate-200/80 transition-all flex flex-col justify-between"
              data-easybot-hint="내 연동 프로젝트: 현재 내 구글 계정에 등록되어 스프레드시트에 바인딩된 Apps Script 프로젝트와 가동 중인 스케줄 현황입니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-500">내 연동 프로젝트</span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
                    <FileCode className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-slate-800 tracking-tight">{projects.length}</span>
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
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  <span>+ 새 프로젝트</span>
                </button>
              </div>
            </div>

            {/* 카드 2: AI 토큰 지갑 & 충전 */}
            <div
              className="bg-amber-50/40 hover:bg-amber-50/60 p-4 rounded-2xl border border-amber-200/70 transition-all flex flex-col justify-between"
              data-easybot-hint="AI 토큰 잔여량: Apps Script 코드 생성 및 AI 대화에 사용되는 보유 크레딧 잔액입니다. 클릭하여 토큰을 충전할 수 있습니다."
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-amber-900">AI 토큰 지갑</span>
                  <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-amber-900 tracking-tight">
                    {(wallet?.balanceTokens ?? 20000).toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-amber-700">Token</span>
                </div>
                <p className="text-[11px] text-amber-800/80 font-medium mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="px-1.5 py-0.2 bg-amber-200/60 text-amber-900 rounded font-bold text-[10px]">
                    {wallet?.tier || "FREE"} 플랜
                  </span>
                  <span>보유 중</span>
                  {wallet?.totalPurchasedTokens ? (
                    <span className="text-[10px] text-amber-800/70 font-semibold">
                      (총 적립 {wallet.totalPurchasedTokens.toLocaleString()})
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-amber-200/60 flex items-center justify-between text-[11px]">
                <span className="text-amber-700/80 font-medium">선불형 크레딧</span>
                <Link
                  href="/dashboard/pricing"
                  className="text-amber-800 hover:text-amber-950 font-bold flex items-center gap-0.5 hover:underline"
                >
                  <span>토큰 충전 ➔</span>
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
                  <span className="text-2xl font-black text-indigo-900 tracking-tight">
                    {usageTokens.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-indigo-700">Token</span>
                </div>
                <div className="text-[11px] text-indigo-800/80 font-medium mt-1 flex flex-wrap items-center gap-1.5">
                  <span>총 <strong>{usageCalls}회</strong> 자동화 호출</span>
                  {isAdminUser && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-200/60 text-indigo-950 font-bold border border-indigo-300/60">
                      API 원가 ₩{usageCostKrw.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-indigo-200/60 flex items-center justify-between text-[11px]">
                <span className="text-indigo-700/80 font-medium">사용량 분석</span>
                <Link
                  href="/dashboard/ai-usage"
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
                    스마트 알림 센터 (내 안드로이드 폰 연동)
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    통신비 0원
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                    연동 폰 {deviceCount}대 · 발송 규칙 {ruleCount}개
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  스마트폰을 10초 만에 연동하고, "D열 입금완료 시 고객 감사 문자 발송" 같은 자연어 규칙을 설정해 보세요.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-white/80 px-2.5 py-1.5 rounded-xl border border-emerald-200/60">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-emerald-700">인프라 연동 완료</span>
              </div>

              <Link
                href="/dashboard/notifications"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 active:scale-95"
                data-easybot-hint="스마트 알림 센터: 내 안드로이드 스마트폰을 연동하고 구글 시트 자동 문자 발송 규칙을 관리합니다."
              >
                <span>스마트 알림 센터 열기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* 2. 연동된 Apps Script 프로젝트 목록 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-600" />
              <span>연동된 Apps Script 프로젝트 목록</span>
            </h4>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPromptGalleryOpen(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border border-emerald-200/80 cursor-pointer shadow-2xs active:scale-95"
                data-easybot-hint="추천 프롬프트 갤러리: 실무에서 검증된 우수 프롬프트를 탐색하고 즉시 적용합니다."
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>✨ 추천 프롬프트 갤러리</span>
              </button>

              <button
                onClick={() => setIsNewProjectModalOpen(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                data-easybot-hint="새 프로젝트 추가: 새 구글 스프레드시트 URL을 바인딩하고 AI 프롬프트로 Apps Script를 자동 생성합니다."
              >
                <Plus className="w-3.5 h-3.5" />
                <span>새 프로젝트 추가</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 새 프로젝트 추가 점선 카드 */}
            <div
              onClick={() => setIsNewProjectModalOpen(true)}
              className="p-5 rounded-2xl border-2 border-dashed border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400/90 transition-all cursor-pointer flex flex-col justify-between gap-3 group text-left min-h-[110px]"
              data-easybot-hint="새 프로젝트 생성 카드: 클릭하여 새 구글 시트 자동화 프로젝트 마법사를 시작합니다."
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white text-emerald-600 rounded-xl shadow-xs group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-xs text-emerald-950 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <span>새 프로젝트 추가</span>
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                  </h5>
                  <p className="text-[11px] text-emerald-900/70 leading-relaxed">
                    구글 시트 URL을 입력하고 자연어로 Apps Script 코드를 자동 주입합니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-100/60 flex items-center justify-between text-[11px] font-bold text-emerald-600">
                <span>원스톱 AI 생성 시작하기</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 기존 프로젝트 목록 */}
            {projects.map((p) => {
              const isSyncing = syncingProjectId === p.id;
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl border border-emerald-100 shadow-xs hover:border-emerald-300 bg-white transition-all flex flex-col justify-between gap-3"
                  data-easybot-hint={`프로젝트 카드: '${p.name}' 자동화 프로젝트입니다. 구글 시트 바인딩 및 코드 배포 상태를 확인합니다.`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="font-bold text-xs text-slate-800 truncate max-w-[180px] sm:max-w-[240px]" title={p.name}>
                          {p.name}
                        </h5>
                        <button
                          type="button"
                          onClick={() => handleSyncProjectTitle(p)}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 rounded-md text-[10px] font-bold transition-all border border-slate-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                          title="구글 시트의 원래 최신 제목으로 프로젝트 이름을 동기화합니다."
                          data-easybot-hint="시트명 동기화: 구글 스프레드시트의 원본 제목을 조회하여 이 카드의 프로젝트 이름을 즉시 일치시킵니다."
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                          <span>{isSyncing ? "동기화 중..." : "동기화"}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="shrink-0 font-bold text-slate-500">ID:</span>
                        <span
                          className="truncate max-w-[200px] sm:max-w-[280px] select-all cursor-pointer hover:text-slate-600 transition-colors"
                          title={`전체 ID: ${p.scriptId || p.gasProjectId || p.id} (클릭 시 복사)`}
                          onClick={() => {
                            const fullId = p.scriptId || p.gasProjectId || p.id;
                            if (fullId) {
                              navigator.clipboard.writeText(fullId);
                              showAlert({ type: "success", text: "프로젝트 ID가 클립보드에 복사되었습니다." });
                            }
                          }}
                        >
                          {p.scriptId || p.gasProjectId || p.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>연결 완료</span>
                      </span>

                      <button
                        onClick={() => handleDeleteProject(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="프로젝트 삭제"
                        data-easybot-hint="프로젝트 삭제: 프로젝트를 안전하게 소프트 삭제(휴지통 처리)합니다."
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                {p.summary && (
                  <p className="text-[11px] text-slate-500 line-clamp-1">{p.summary}</p>
                )}

                {/* 프로젝트 카드 하단 액션 영역 (2단 논리 분할 구조로 정돈) */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2 text-[11px]">
                  {/* 1단: 구글 시트 / Apps Script 바로가기 링크 그룹 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 구글 시트 열기 링크 버튼 */}
                      {p.spreadsheetUrl && (
                        <a
                          href={p.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg transition-colors border border-emerald-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="구글 시트 열기: 연결된 실제 구글 스프레드시트 웹 페이지를 새 창에서 엽니다."
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>구글 시트 열기</span>
                          <ExternalLink className="w-3 h-3 text-emerald-600/70 shrink-0" />
                        </a>
                      )}

                      {/* 스크립트 편집기 직접 열기 버튼 */}
                      {(() => {
                        const editorUrl =
                          p.scriptUrl ||
                          (p.scriptId ? `https://script.google.com/d/${p.scriptId}/edit` : (p.gasProjectId ? `https://script.google.com/d/${p.gasProjectId}/edit` : ""));
                        return editorUrl ? (
                          <a
                            href={editorUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors border border-indigo-200/60 shadow-2xs whitespace-nowrap text-xs"
                            data-easybot-hint="스크립트 편집기 열기: 구글 시트의 프로젝트 선택창을 거치지 않고 이 Apps Script 코드 편집 화면으로 1초 만에 바로 진입합니다."
                          >
                            <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>스크립트 편집기</span>
                            <ExternalLink className="w-3 h-3 text-indigo-600/70 shrink-0" />
                          </a>
                        ) : null;
                      })()}

                      {/* 🌐 공개 웹페이지 바로가기 (Web App인 경우) */}
                      {(p.webapp_url || p.webappUrl) && (
                        <a
                          href={p.webapp_url || p.webappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg transition-colors border border-sky-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="공개 웹페이지 열기: 일반 대중에게 배포할 수 있는 실시간 독립 접수/설문 웹페이지를 새 창에서 엽니다."
                          title="일반 대중 배포용 독립 웹페이지 바로가기"
                        >
                          <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>공개 웹 폼</span>
                          <ExternalLink className="w-3 h-3 text-sky-600/70 shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* 2단: 관리 도구 (코드 동기화 / 요구사항 수정 / 만족도 평가) */}
                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100/80 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 🔄 최신 코드 동기화 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleSyncProjectCode(p)}
                        disabled={syncingCodeProjectId === p.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap disabled:opacity-50"
                        title="구글 시트에서 직접 수정한 최신 Apps Script 코드를 SheetBot DB로 가져옵니다."
                        data-easybot-hint="최신 코드 동기화: 사용자가 구글 시트에서 직접 수정한 Apps Script 최신 코드를 즉시 읽어와 SheetBot에 일치시킵니다."
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingCodeProjectId === p.id ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                        <span>{syncingCodeProjectId === p.id ? "동기화 중..." : "코드 동기화"}</span>
                      </button>

                      {/* ✏️ 자연어 요구사항 수정 및 AI 코드 재배포 버튼 */}
                      <button
                        type="button"
                        onClick={() => setEditingProject(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap active:scale-95"
                        data-easybot-hint="요구사항 수정: 기존 프롬프트를 확인하고 수정/추가하여 새 코드를 AI로 재작성 및 구글 시트에 재배포합니다."
                        title="자연어 요구사항을 수정하거나 추가하여 새 코드로 재배포합니다."
                      >
                        <Edit3 className="w-3 h-3 text-slate-500" />
                        <span>요구사항 수정</span>
                      </button>
                    </div>

                    {/* ⭐ 만족도 평가 및 AI 자가 학습 피드백 버튼 */}
                    <button
                      type="button"
                      onClick={() => setFeedbackTargetProject(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg transition-all border border-amber-200/80 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap ml-auto"
                      data-easybot-hint="만족도 평가: AI 생성 코드에 대한 별점과 피드백을 제출하여 AI가 자가 학습하도록 합니다."
                      title="AI 코드 만족도 평가 및 자가 학습 피드백"
                    >
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      <span>만족도 평가</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* 3. 자동화 스케줄 & 트리거 관리 섹션 */}
        <ScheduleManager
          schedules={schedules}
          projects={projects}
          onRefresh={fetchData}
          onShowAlert={showAlert}
        />
      </main>

      {/* 새 프로젝트 생성 모달 */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSuccess={() => {
          fetchData();
          showAlert({ type: "success", text: "새 Apps Script 프로젝트가 성공적으로 생성되었습니다!" });
        }}
      />

      {/* 기존 프로젝트 자연어 요구사항 수정 및 재배포 모달 */}
      <EditProjectPromptModal
        isOpen={!!editingProject}
        project={editingProject}
        onClose={() => setEditingProject(null)}
        onSuccess={() => {
          fetchData();
          showAlert({ type: "success", text: "수정된 요구사항을 바탕으로 스크립트 코드가 성공적으로 갱신 및 재배포되었습니다!" });
        }}
      />

      {/* 추천 프롬프트 갤러리 모달 */}
      <PromptGalleryModal
        isOpen={isPromptGalleryOpen}
        onClose={() => setIsPromptGalleryOpen(false)}
        onSelectPrompt={(tpl) => {
          setIsPromptGalleryOpen(false);
          setIsNewProjectModalOpen(true);
        }}
      />

      {/* 프로젝트 만족도 평가 및 AI 자가 학습 모달 */}
      {feedbackTargetProject && (
        <FeedbackModal
          isOpen={!!feedbackTargetProject}
          project={feedbackTargetProject}
          onClose={() => setFeedbackTargetProject(null)}
          onSuccess={() => {
            showAlert({ type: "success", text: "소중한 만족도 평가가 AI 자가 학습 시스템에 성공적으로 반영되었습니다!" });
          }}
        />
      )}
    </div>
  );
}
