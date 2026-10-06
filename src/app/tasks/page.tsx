"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Flame,
  Phone,
  PhoneCall,
  Package,
  MessageSquare,
  FileText,
  Search,
  Plus,
  ExternalLink,
  RefreshCw,
  Trash2,
  Calendar,
  Sparkles,
  ChevronRight,
  Filter,
  Check,
} from "lucide-react";
import { useAuthAdmin } from "@/contexts/AuthAdminContext";

interface TaskItem {
  id: number;
  user_email: string;
  title: string;
  description?: string | null;
  source_type: "CALL_RECORDING" | "MISSED_CALL" | "ORDER_DELAY" | "ORDER" | "KAKAO" | "SMS";
  source_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  due_date?: string | null;
  priority: string;
  status: "PENDING" | "DONE";
  badge_text?: string | null;
  deep_link?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export default function TasksPage() {
  const { isLoggedIn, user, isLoading: authLoading } = useAuthAdmin();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "DONE">("PENDING");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 신규 할 일 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState("HIGH 🟡");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 할 일 목록 불러오기
  const fetchTasks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setIsRefreshing(true);
    try {
      const res = await apiFetch("/api/user/tasks?status=ALL", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        if (data.spreadsheetUrl) {
          setSpreadsheetUrl(data.spreadsheetUrl);
        }
      }
    } catch (err) {
      console.error("[TasksPage] Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchTasks();
    }
  }, [isLoggedIn, fetchTasks]);

  // 실시간 DB Watcher 연동 (SSE)
  useEffect(() => {
    if (typeof window === "undefined" || !isLoggedIn) return;

    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/user/sse?table=sheetbot_tasks");
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "TABLE_CHANGED" || payload.type === "DATA_CHANGED") {
            fetchTasks(true);
          }
        } catch {}
      };
    } catch (err) {
      console.warn("[TasksPage] SSE connection error:", err);
    }

    return () => {
      if (es) es.close();
    };
  }, [isLoggedIn, fetchTasks]);

  // 할 일 상태 토글 (완료 <-> 미완료)
  const handleToggleStatus = async (task: TaskItem) => {
    const nextStatus = task.status === "DONE" ? "PENDING" : "DONE";
    // 낙관적 UI 업데이트
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await apiFetch("/api/user/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: nextStatus }),
      });
    } catch (err) {
      console.error("[TasksPage] Toggle status failed:", err);
      // 실패 시 롤백
      fetchTasks(true);
    }
  };

  // 할 일 삭제 (소프트 삭제)
  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("이 할 일을 삭제하시겠습니까?")) return;

    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await apiFetch(`/api/user/tasks?taskId=${taskId}`, { method: "DELETE" });
    } catch (err) {
      console.error("[TasksPage] Delete task failed:", err);
      fetchTasks(true);
    }
  };

  // 신규 할 일 수동 등록
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/user/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          contactName: newContact.trim() || undefined,
          contactPhone: newPhone.trim() || undefined,
          dueDate: newDueDate || undefined,
          priority: newPriority,
          badgeText: "수동 등록",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewTitle("");
        setNewContact("");
        setNewPhone("");
        setNewDueDate("");
        setShowAddModal(false);
        fetchTasks(true);
      } else {
        alert(data.error || "등록에 실패했습니다.");
      }
    } catch (err: any) {
      alert("할 일 등록 중 오류가 발생했습니다: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 통계 계산
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const pending = tasks.filter((t) => t.status === "PENDING");
    const done = tasks.filter((t) => t.status === "DONE");
    const urgent = pending.filter(
      (t) => t.priority.includes("URGENT") || t.priority.includes("HIGH")
    );
    const dueToday = pending.filter(
      (t) => t.due_date && t.due_date.slice(0, 10) === todayStr
    );

    return {
      total: tasks.length,
      pendingCount: pending.length,
      doneCount: done.length,
      urgentCount: urgent.length,
      dueTodayCount: dueToday.length,
    };
  }, [tasks]);

  // 필터링된 할 일 목록
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. 상태 필터
      if (statusFilter !== "ALL" && task.status !== statusFilter) return false;

      // 2. 출처 필터
      if (sourceFilter !== "ALL" && task.source_type !== sourceFilter) return false;

      // 3. 검색 쿼리
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (task.title || "").toLowerCase().includes(q);
        const contactMatch = (task.contact_name || "").toLowerCase().includes(q);
        const phoneMatch = (task.contact_phone || "").includes(q);
        const badgeMatch = (task.badge_text || "").toLowerCase().includes(q);
        if (!titleMatch && !contactMatch && !phoneMatch && !badgeMatch) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, sourceFilter, searchQuery]);

  // 출처별 아이콘 & 라벨 헬퍼
  const getSourceBadge = (source: string) => {
    switch (source) {
      case "CALL_RECORDING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <PhoneCall className="w-3 h-3 text-emerald-600" /> 통화 녹음
          </span>
        );
      case "MISSED_CALL":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Phone className="w-3 h-3 text-amber-600" /> 부재중 전화
          </span>
        );
      case "ORDER_DELAY":
      case "ORDER":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Package className="w-3 h-3 text-blue-600" /> 주문 지연
          </span>
        );
      case "KAKAO":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-yellow-50 text-yellow-800 border border-yellow-200">
            <MessageSquare className="w-3 h-3 text-yellow-600" /> 카카오톡
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <FileText className="w-3 h-3 text-slate-500" /> 일반 업무
          </span>
        );
    }
  };

  // 상태/안내 뱃지 렌더링
  const renderBadge = (badgeText?: string | null) => {
    if (!badgeText) return null;

    if (badgeText.includes("출고지연")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
          <Flame className="w-3 h-3 text-rose-600" /> {badgeText}
        </span>
      );
    }
    if (badgeText.includes("안내요망")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
          <AlertTriangle className="w-3 h-3 text-orange-600" /> {badgeText}
        </span>
      );
    }
    if (badgeText.includes("안내문자 발송됨")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Check className="w-3 h-3 text-indigo-500" /> (안내문자 발송됨)
        </span>
      );
    }
    if (badgeText.includes("자동해결")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {badgeText}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
        {badgeText}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* 상단 헤더 */}
      <div className="bg-white border-b border-slate-200/80 sticky top-12 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  스마트 통합 할 일 허브
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Zero-Retention
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                통화 녹음, 부재중 전화, 간편 주문 지연에서 AI가 실시간 추출한 모든 비즈니스 후속 과업을 한곳에서 관리합니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTasks()}
                disabled={isRefreshing}
                className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
                title="새로고침"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
              </button>

              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-emerald-700 transition-all shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                  <span>통합 할 일 구글 시트</span>
                </a>
              )}

              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm shadow-emerald-200"
              >
                <Plus className="w-4 h-4" />
                <span>할 일 직접 추가</span>
              </button>
            </div>
          </div>

          {/* 통계 카드 4종 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <div
              onClick={() => setStatusFilter("PENDING")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === "PENDING"
                  ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-500">진행 중인 할 일</div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5">
                {stats.pendingCount}
                <span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </div>
            </div>

            <div
              onClick={() => {
                setStatusFilter("PENDING");
              }}
              className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all cursor-pointer"
            >
              <div className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                <Flame className="w-3 h-3" /> 긴급/높음 과업
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-600 mt-0.5">
                {stats.urgentCount}
                <span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </div>
            </div>

            <div
              onClick={() => {
                setStatusFilter("PENDING");
              }}
              className="p-3 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all cursor-pointer"
            >
              <div className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 오늘 마감 예정
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">
                {stats.dueTodayCount}
                <span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </div>
            </div>

            <div
              onClick={() => setStatusFilter("DONE")}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                statusFilter === "DONE"
                  ? "bg-slate-100 border-slate-300 ring-2 ring-slate-400/20"
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-[11px] font-semibold text-slate-500">완료된 과업</div>
              <div className="text-xl sm:text-2xl font-black text-slate-700 mt-0.5">
                {stats.doneCount}
                <span className="text-xs font-normal text-slate-400 ml-1">건</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {/* 필터 및 검색 바 */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-2xs mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* 상태 탭 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setStatusFilter("PENDING")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === "PENDING"
                  ? "bg-white text-emerald-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              미완료 ({stats.pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter("DONE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === "DONE"
                  ? "bg-white text-slate-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              완료됨 ({stats.doneCount})
            </button>
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === "ALL"
                  ? "bg-white text-slate-800 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              전체 ({stats.total})
            </button>
          </div>

          {/* 출처 필터 칩 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            {[
              { id: "ALL", label: "전체 출처" },
              { id: "CALL_RECORDING", label: "🎙️ 통화 녹음" },
              { id: "MISSED_CALL", label: "📞 부재중 전화" },
              { id: "ORDER_DELAY", label: "📦 주문 지연" },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSourceFilter(chip.id)}
                className={`px-2.5 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all border ${
                  sourceFilter === chip.id
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* 검색 입력 */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="고객명, 내용 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* 할 일 목록 리스트 */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-700">할 일 목록을 실시간 불러오는 중...</div>
            <div className="text-xs text-slate-400 mt-1">통화 녹음 및 부재중 전화 대장을 종합 분석하고 있습니다.</div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-slate-800">
              {statusFilter === "PENDING" ? "모든 할 일이 완료되었습니다! 🎉" : "해당하는 할 일이 없습니다."}
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              새로운 통화 녹음이나 부재중 전화, 간편 주문 지연이 감지되면 AI가 자동으로 이곳에 실시간 등록합니다.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map((task) => {
              const isDone = task.status === "DONE";
              const isUrgent = task.priority.includes("URGENT");
              const isHigh = task.priority.includes("HIGH");

              return (
                <div
                  key={task.id}
                  className={`group bg-white rounded-2xl border transition-all p-4 flex items-start gap-3.5 hover:shadow-sm ${
                    isDone
                      ? "border-slate-200/80 bg-slate-50/50 opacity-75"
                      : isUrgent
                      ? "border-rose-200 hover:border-rose-300 ring-1 ring-rose-500/10"
                      : isHigh
                      ? "border-amber-200 hover:border-amber-300"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {/* 완료 체크박스 버튼 */}
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    title={isDone ? "미완료로 변경" : "완료로 표시"}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Circle className="w-5 h-5 hover:text-emerald-500" />
                    )}
                  </button>

                  {/* 할 일 상세 본문 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {/* 출처 뱃지 */}
                      {getSourceBadge(task.source_type)}

                      {/* 상태/안내 뱃지 (안내문자 발송됨 등) */}
                      {renderBadge(task.badge_text)}

                      {/* 중요도 뱃지 */}
                      {isUrgent && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          긴급 🔴
                        </span>
                      )}
                      {isHigh && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          높음 🟡
                        </span>
                      )}

                      {/* 마감 기한 */}
                      {task.due_date && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium ml-auto">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{task.due_date}</span>
                        </span>
                      )}
                    </div>

                    {/* 할 일 제목 */}
                    <div
                      className={`text-sm font-bold text-slate-900 leading-snug break-keep ${
                        isDone ? "line-through text-slate-400" : ""
                      }`}
                    >
                      {task.title}
                    </div>

                    {/* 관련 고객 정보 및 설명 */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      {task.contact_name && (
                        <div className="flex items-center gap-1 font-medium text-slate-700">
                          <span className="text-slate-400">고객:</span>
                          <span>{task.contact_name}</span>
                        </div>
                      )}

                      {task.contact_phone && (
                        <a
                          href={`tel:${task.contact_phone}`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{task.contact_phone}</span>
                        </a>
                      )}

                      <div className="text-[11px] text-slate-400 ml-auto">
                        등록: {task.created_at.slice(0, 16)}
                      </div>
                    </div>
                  </div>

                  {/* 우측 액션 (삭제) */}
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="할 일 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 신규 할 일 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700">
                  <Plus className="w-4 h-4" />
                </span>
                <h3 className="text-lg font-black text-slate-900">새로운 할 일 등록</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  할 일 내용 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 김대표님 견적서 수정본 메일 발송"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">고객명 / 상호</label>
                  <input
                    type="text"
                    placeholder="예: 김철수"
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">전화번호</label>
                  <input
                    type="tel"
                    placeholder="예: 010-1234-5678"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">마감 기한</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">중요도</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="URGENT 🔴">긴급 🔴</option>
                    <option value="HIGH 🟡">높음 🟡</option>
                    <option value="NORMAL ⚪">보통 ⚪</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm shadow-emerald-200"
                >
                  {isSubmitting ? "등록 중..." : "할 일 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
