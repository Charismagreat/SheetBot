"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, FileCode, Clock, RefreshCw, CheckCircle2, AlertTriangle,
  X, ArrowRight, ExternalLink, Sparkles, Layers, ShieldCheck, Trash2, Smartphone, Edit3,
  Globe, Star
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

  // 추천 프롬프트 갤러리 및 피드백 모달 상태
  const [isPromptGalleryOpen, setIsPromptGalleryOpen] = useState(false);
  const [feedbackTargetProject, setFeedbackTargetProject] = useState<any | null>(null);

  // 데이터 로드
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, schedRes] = await Promise.all([
        apiFetch("/api/projects").then((r) => r.json()).catch(() => ({})),
        apiFetch("/api/schedules").then((r) => r.json()).catch(() => ({})),
      ]);

      if (projRes?.success) setProjects(projRes.projects || []);
      if (schedRes?.success) setSchedules(schedRes.schedules || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const showAlert = (msg: { type: "success" | "error"; text: string }) => {
    setAlertMessage(msg);
    setTimeout(() => setAlertMessage(null), 5000);
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60"
              data-easybot-hint="연동 프로젝트 수: 현재 내 구글 계정에 등록되어 구글 시트에 바인딩된 Apps Script 프로젝트 총 건수입니다."
            >
              <span className="text-xs font-bold text-slate-400 block mb-1">내 연동 프로젝트</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-800 tracking-tight">{projects.length}</span>
                <span className="text-xs font-bold text-slate-500">개</span>
              </div>
            </div>

            <div
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60"
              data-easybot-hint="활성 스케줄 수: 현재 정기 실행(시간 기반) 또는 이벤트 트리거로 작동 중인 자동화 개수입니다."
            >
              <span className="text-xs font-bold text-slate-400 block mb-1">활성 실행 스케줄</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-600 tracking-tight">{activeSchedulesCount}</span>
                <span className="text-xs font-bold text-slate-500">개 가동 중</span>
              </div>
            </div>

            <div
              className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60"
              data-easybot-hint="인프라 연결: 이지데스크 Apps Script MCP 도구 및 My DB, AI Caller와의 통신 상태를 나타냅니다."
            >
              <span className="text-xs font-bold text-slate-400 block mb-1">인프라 연결 상태</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-emerald-600 text-xs">
                  EGDesk Apps Script & My DB 연동 완료
                </span>
              </div>
            </div>
          </div>

          {/* 구글 메시지 스마트 알림 센터 바로가기 배너 */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-2xl p-4 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-slate-800">
                    내 안드로이드 폰 연동 & 자연어 구글 시트 스마트 알림
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                    통신비 0원
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  내 스마트폰을 10초 만에 연동하고, "D열 입금완료 시 고객 감사 문자 발송" 같은 자연어 규칙을 설정해 보세요.
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/notifications"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 self-start sm:self-auto"
            >
              <span>스마트 알림 센터 열기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
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
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        ID: {p.scriptId || p.gasProjectId || p.id}
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

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
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
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-indigo-200/60 shadow-2xs"
                          data-easybot-hint="스크립트 편집기 열기: 구글 시트의 프로젝트 선택창을 거치지 않고 이 Apps Script 코드 편집 화면으로 1초 만에 바로 진입합니다."
                        >
                          <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>스크립트 편집기 열기</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-400 text-[10px]">연결 시트:</span>
                      );
                    })()}

                    {/* 🌐 공개 웹페이지 바로가기 (Web App인 경우) */}
                    {(p.webapp_url || p.webappUrl) && (
                      <a
                        href={p.webapp_url || p.webappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-sky-200/80 shadow-2xs"
                        data-easybot-hint="공개 웹페이지 열기: 일반 대중에게 배포할 수 있는 실시간 독립 접수/설문 웹페이지를 새 창에서 엽니다."
                        title="일반 대중 배포용 독립 웹페이지 바로가기"
                      >
                        <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>공개 웹페이지</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                      </a>
                    )}

                    {/* 자연어 요구사항 수정 및 AI 코드 재배포 버튼 */}
                    <button
                      type="button"
                      onClick={() => setEditingProject(p)}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 font-bold rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200/80 hover:border-indigo-200 cursor-pointer shadow-2xs active:scale-95"
                      data-easybot-hint="요구사항 수정: 기존 프롬프트를 확인하고 수정/추가하여 새 코드를 AI로 재작성 및 구글 시트에 재배포합니다."
                      title="자연어 요구사항을 수정하거나 추가하여 새 코드로 재배포합니다."
                    >
                      <Edit3 className="w-3 h-3 text-slate-500" />
                      <span>요구사항 수정</span>
                    </button>

                    {/* ⭐ 만족도 평가 및 AI 자가 학습 피드백 버튼 */}
                    <button
                      type="button"
                      onClick={() => setFeedbackTargetProject(p)}
                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg flex items-center gap-1 transition-colors border border-amber-200/80 cursor-pointer shadow-2xs text-[11px]"
                      data-easybot-hint="만족도 평가: AI 생성 코드에 대한 별점과 피드백을 제출하여 AI가 자가 학습하도록 합니다."
                      title="AI 코드 만족도 평가 및 자가 학습 피드백"
                    >
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      <span>만족도 평가</span>
                    </button>
                  </div>

                  {/* 구글 시트 열기 버튼 */}
                  {p.spreadsheetUrl && (
                    <a
                      href={p.spreadsheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 font-semibold text-xs"
                      data-easybot-hint="구글 시트 열기: 연결된 실제 구글 스프레드시트 웹 페이지를 새 창에서 엽니다."
                    >
                      <span>구글 시트 열기</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
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
