"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Cpu,
  Activity,
  DollarSign,
  Users,
  Clock,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart3,
  Bot,
  FileCode,
  HelpCircle,
  TrendingUp,
} from "lucide-react";
import Navbar from "@/components/Navbar";

export default function AiUsageMonitorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [range, setRange] = useState<"today" | "week" | "month" | "all">("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        range,
        userEmail: selectedUser,
        page: String(page),
        limit: "15",
      });

      const res = await fetch(`/api/admin/ai-usage?${query.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("AI usage fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [range, selectedUser, page]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchStats();
    }
  }, [status, router, fetchStats]);

  const summary = data?.summary || {
    totalCalls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    totalCostKrw: 0,
    activeUsersCount: 0,
  };

  const userStats = data?.userStats || [];
  const purposeStats = data?.purposeStats || [];
  const recentLogs = data?.recentLogs || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 text-left">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 상단 네비게이션 & 타이틀 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 transition-colors shadow-2xs"
                title="대시보드로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-emerald-600 flex items-center justify-center text-white shadow-sm">
                <Cpu className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                AI API 호출 및 사용료 관제 센터
              </h2>
            </div>
            <p className="text-xs text-slate-500 pl-8">
              SheetBot에서 호출된 이지데스크 AI Caller의 실시간 토큰 사용량과 과금액을 전체 및 회원별로 분석·모니터링합니다.
            </p>
          </div>

          {/* 기간 필터 & 새로고침 버튼 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-1 text-xs font-bold">
              {(
                [
                  { id: "today", label: "오늘" },
                  { id: "week", label: "최근 7일" },
                  { id: "month", label: "최근 30일" },
                  { id: "all", label: "전체 기간" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setRange(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    range === tab.id
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchStats}
              disabled={loading}
              className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* 회원 필터 배너 (필터 활성화 시) */}
        {selectedUser !== "all" && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold text-indigo-900">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-600" />
              <span>
                현재 <strong>[{selectedUser}]</strong> 회원의 AI 사용 내역만 필터링하여 보고 있습니다.
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedUser("all");
                setPage(1);
              }}
              className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors border border-indigo-200 cursor-pointer"
            >
              전체 회원 보기로 복귀
            </button>
          </div>
        )}

        {/* 1. 상단 핵심 4대 지표 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 총 추정 요금 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>총 추정 사용료</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-2xl font-black text-emerald-600 tracking-tight">
                ₩ {summary.totalCostKrw.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400 font-semibold font-mono">
                $ {summary.totalCostUsd.toFixed(4)} USD
              </div>
            </div>
          </div>

          {/* 총 API 호출 건수 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>총 API 호출 수</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-2xl font-black text-indigo-700 tracking-tight">
                {summary.totalCalls.toLocaleString()} <span className="text-sm font-bold text-slate-500">회</span>
              </div>
              <div className="text-[11px] text-slate-400 font-semibold">
                성공률 100% (이지데스크 경유)
              </div>
            </div>
          </div>

          {/* 총 소모 토큰 수 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>소모된 총 토큰</span>
              <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                <BarChart3 className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-2xl font-black text-violet-700 tracking-tight">
                {summary.totalTokens.toLocaleString()} <span className="text-sm font-bold text-slate-500">tokens</span>
              </div>
              <div className="text-[11px] text-slate-400 font-semibold">
                입력 {summary.totalPromptTokens.toLocaleString()} / 출력 {summary.totalCompletionTokens.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 활성 이용 회원 수 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>AI 이용 회원 수</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-2xl font-black text-amber-700 tracking-tight">
                {summary.activeUsersCount} <span className="text-sm font-bold text-slate-500">명</span>
              </div>
              <div className="text-[11px] text-slate-400 font-semibold">
                멀티 유저 격리 통계
              </div>
            </div>
          </div>
        </div>

        {/* 2. 회원별(User-by-User) AI 사용료 관제 대장 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <span>회원별 AI API 사용료 및 점유율 대장</span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-md">
                    {userStats.length}명 이용 중
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  회원별 소모 토큰과 비용을 실시간 비교하고, 회원을 클릭하여 개별 로그를 관제할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 회원 선택 드롭다운 */}
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setPage(1);
              }}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none"
            >
              <option value="all">전체 회원 보기</option>
              {userStats.map((u: any) => (
                <option key={u.userEmail} value={u.userEmail}>
                  {u.userEmail} ({u.userName}) - ₩{u.costKrw.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {userStats.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">
              선택한 기간 동안 기록된 회원별 AI 호출 내역이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold">
                    <th className="py-2.5 px-3">회원 이메일</th>
                    <th className="py-2.5 px-3">사용자명</th>
                    <th className="py-2.5 px-3 text-center">호출 횟수</th>
                    <th className="py-2.5 px-3 text-right">총 소모 토큰</th>
                    <th className="py-2.5 px-3 text-right">추정 요금</th>
                    <th className="py-2.5 px-3 text-center">점유율</th>
                    <th className="py-2.5 px-3 text-center">최근 사용일시</th>
                    <th className="py-2.5 px-3 text-center">제어</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userStats.map((u: any, idx: number) => {
                    const isCurrentFilter = selectedUser === u.userEmail;

                    return (
                      <tr
                        key={u.userEmail}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCurrentFilter ? "bg-indigo-50/50" : ""
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="text-slate-400 text-[10px] w-4">{idx + 1}.</span>
                          <span>{u.userEmail}</span>
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-600">{u.userName}</td>
                        <td className="py-3 px-3 text-center font-bold text-indigo-700">
                          {u.calls.toLocaleString()} 회
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-600">
                          {u.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600">
                          ₩ {u.costKrw.toLocaleString()}
                          <span className="block text-[10px] text-slate-400 font-mono">
                            ${u.costUsd.toFixed(4)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                                style={{ width: `${Math.min(u.percentage, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 w-8 text-right">
                              {u.percentage}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-400 text-[11px]">
                          {u.lastCalledAt ? u.lastCalledAt.replace("T", " ").substring(0, 16) : "-"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedUser(isCurrentFilter ? "all" : u.userEmail);
                              setPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              isCurrentFilter
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600"
                            }`}
                          >
                            {isCurrentFilter ? "해제" : "필터"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. 서비스 목적별 & 모델별 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 서비스 목적별 */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>서비스 기능별 사용료 비중</span>
            </h4>
            <div className="space-y-2.5 pt-1">
              {purposeStats.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">데이터 없음</div>
              ) : (
                purposeStats.map((p: any) => (
                  <div key={p.purpose} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-slate-700">{p.purpose}</span>
                      <span className="text-emerald-700">
                        ₩ {p.costKrw.toLocaleString()} ({p.calls}회)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(p.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 모델별 통계 */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>활용 LLM 모델 분포</span>
            </h4>
            <div className="space-y-2 pt-1">
              {data?.modelStats?.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">데이터 없음</div>
              ) : (
                data?.modelStats?.map((m: any) => (
                  <div
                    key={m.model}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs font-bold"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-mono text-slate-800">{m.model}</span>
                    </div>
                    <div className="text-slate-600">
                      <span>{m.calls}회 호출</span>
                      <span className="text-slate-400 text-[10px] ml-2 font-mono">
                        ({m.tokens.toLocaleString()} tok)
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 4. 실시간 상세 호출 감사 로그 대장 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>실시간 AI API 호출 상세 감사 로그</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                총 {pagination.total}건
              </span>
            </h4>
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">기록된 상세 호출 로그가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold">
                    <th className="py-2 px-3">일시</th>
                    <th className="py-2 px-3">회원 계정</th>
                    <th className="py-2 px-3">목적</th>
                    <th className="py-2 px-3">모델</th>
                    <th className="py-2 px-3 text-right">토큰</th>
                    <th className="py-2 px-3 text-right">비용</th>
                    <th className="py-2 px-3">요청 요약</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] font-mono whitespace-nowrap">
                        {log.created_at ? log.created_at.replace("T", " ").substring(0, 19) : "-"}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {log.user_email}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                          {log.purpose}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {log.model}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                        {log.total_tokens?.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                        ₩{Number(log.estimated_cost_krw || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={log.prompt_preview}>
                        {log.prompt_preview || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>
                {pagination.page} / {pagination.totalPages} 페이지 (총 {pagination.total}건)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages || loading}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
