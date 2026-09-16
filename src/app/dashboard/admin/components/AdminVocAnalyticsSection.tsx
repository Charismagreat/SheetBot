"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  Flame,
  TrendingUp,
  Building2,
  Lightbulb,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  Target,
  RefreshCw,
} from "lucide-react";
import type { VocAnalyticsResult } from "@/lib/voc-analyzer";

interface AdminVocAnalyticsSectionProps {
  totalInquiriesCount: number;
}

export default function AdminVocAnalyticsSection({
  totalInquiriesCount,
}: AdminVocAnalyticsSectionProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [data, setData] = useState<VocAnalyticsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVocData();
  }, []);

  const fetchVocData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      if (forceRefresh) {
        const res = await apiFetch("/api/admin/inquiries/voc-analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceRefresh: true }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.error || "분석 데이터를 불러오지 못했습니다.");
        }
      } else {
        const res = await apiFetch("/api/admin/inquiries/voc-analytics");
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        }
      }
    } catch (err: any) {
      setError(err.message || "통신 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 rounded-2xl border border-slate-800 text-white shadow-lg overflow-hidden transition-all">
      {/* 상단 헤더 & 컨트롤 바 */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                <span>AI VOC & 자동화 기능 수요 히트맵</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Demand Analytics
                </span>
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              전체 {totalInquiriesCount}건의 고객 문의·의뢰 데이터를 AI가 심층 분석한 실시간 제품 수요 및 고충 지도
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {data?.analyzedAt && (
            <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
              최근 분석: {data.analyzedAt}
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchVocData(true)}
            disabled={isRefreshing || loading}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            title="최신 고객 문의 데이터를 기반으로 AI VOC 및 수요 히트맵을 다시 분석합니다"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "AI 심층 분석 중..." : "실시간 AI 재분석"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 transition-colors cursor-pointer"
            title={isOpen ? "대시보드 접기" : "대시보드 펼치기"}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 접이식 본문 컨텐츠 */}
      {isOpen && (
        <div className="p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
              <span>AI가 고객 문의 데이터를 분석하여 수요 히트맵을 추출하고 있습니다...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchVocData()}
                className="underline font-bold hover:text-white"
              >
                다시 시도
              </button>
            </div>
          ) : data ? (
            <>
              {/* 상단 2열 그리드: 핵심 페인포인트 랭킹 + 기능 수요 히트맵 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 1. 핵심 고객 페인포인트 (Pain Points TOP 5) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">🔥 고객 핵심 페인포인트 (고충) TOP 5</h4>
                        <span className="text-[10px] text-slate-400">고객들이 겪는 가장 고통스러운 수작업 및 위험 요인</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {data.topPainPoints.map((item) => (
                      <div
                        key={item.rank}
                        className={`p-3 rounded-xl border transition-all ${
                          item.rank === 1
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-100"
                            : item.rank === 2
                            ? "bg-amber-500/10 border-amber-500/25 text-amber-100"
                            : "bg-white/5 border-white/10 text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${
                                item.rank === 1
                                  ? "bg-rose-500 text-white"
                                  : item.rank === 2
                                  ? "bg-amber-500 text-slate-950"
                                  : "bg-slate-700 text-slate-300"
                              }`}
                            >
                              {item.rank}
                            </span>
                            <span className="font-extrabold text-white truncate text-xs">{item.keyword}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                item.severity === "CRITICAL"
                                  ? "bg-rose-500/30 text-rose-300 border border-rose-500/40"
                                  : item.severity === "HIGH"
                                  ? "bg-amber-500/30 text-amber-300 border border-amber-500/40"
                                  : "bg-slate-700 text-slate-300"
                              }`}
                            >
                              {item.severity === "CRITICAL" ? "심각" : item.severity === "HIGH" ? "높음" : "보통"}
                            </span>
                            <span className="font-mono font-black text-xs text-emerald-400">{item.percentage}%</span>
                          </div>
                        </div>

                        {/* 대표 고객 발언 */}
                        <div className="mt-2 text-[11px] text-slate-300 bg-black/30 p-2 rounded-lg italic border border-white/5 leading-relaxed">
                          &ldquo;{item.sampleQuote}&rdquo;
                        </div>

                        {/* 실질적 비즈니스 피해 */}
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
                          <span className="text-rose-400 font-bold shrink-0">⚠️ 피해 요인:</span>
                          <span className="truncate">{item.impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. 자동화 기능 수요 히트맵 (Feature Demand Heatmap) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">🗺️ 자동화 기능 수요 히트맵 (Demand Heatmap)</h4>
                        <span className="text-[10px] text-slate-400">가장 요청 빈도가 높은 외부 연동 및 맞춤 모듈 수요</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {data.demandHeatmap.map((item, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-indigo-300 border border-white/10 shrink-0">
                              {item.categoryLabel}
                            </span>
                            <span className="font-bold text-white truncate">{item.featureName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-slate-400">{item.requestCount}건 요청</span>
                            <span className="font-mono font-black text-emerald-400 text-xs">{item.demandScore}%</span>
                          </div>
                        </div>

                        {/* 프로그레스 게이지 바 */}
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              idx === 0
                                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                                : idx === 1
                                ? "bg-gradient-to-r from-indigo-500 to-purple-400"
                                : idx === 2
                                ? "bg-gradient-to-r from-cyan-500 to-blue-400"
                                : "bg-gradient-to-r from-slate-500 to-slate-400"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(10, item.demandScore))}%` }}
                          />
                        </div>

                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span className="text-emerald-400 font-bold">기대효과:</span>
                          <span className="truncate">{item.expectedBenefit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 하단 2열 그리드: 업종별 수요 클러스터링 + AI 제품 로드맵 인사이트 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 3. 업종별 AX 도입 수요 클러스터링 */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">🏢 업종별 AX 도입 수요 클러스터링</h4>
                        <span className="text-[10px] text-slate-400">업종별 비중 및 주된 요구 기능·예산 범위</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {data.industryClusters.map((cluster, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white text-xs">{cluster.industryName}</span>
                          <span className="font-mono font-black text-xs text-teal-300">{cluster.ratio}%</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {cluster.primaryNeeds.map((need, nIdx) => (
                            <span
                              key={nIdx}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5"
                            >
                              {need}
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-white/5 flex items-center justify-between">
                          <span>예상 구축 예산:</span>
                          <strong className="text-emerald-400 font-bold">{cluster.avgBudget}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. AI 제품 로드맵 및 고수익 세일즈 제언 */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 space-y-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        <Lightbulb className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">💡 AI 제품 로드맵 & 비즈니스 전략 제언</h4>
                        <span className="text-[10px] text-indigo-300/80">데이터 기반 차기 템플릿 출시 및 세일즈 인사이트</span>
                      </div>
                    </div>
                  </div>

                  {/* 트렌드 요약 */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200 leading-relaxed">
                    <span className="text-emerald-400 font-extrabold block text-[11px] mb-1">📌 시장 트렌드 총평</span>
                    {data.insights.marketTrendSummary}
                  </div>

                  {/* 차기 출시 추천 템플릿 3종 */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-extrabold text-amber-300 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />
                      <span>우선 출시 추천 템플릿 TOP 3</span>
                    </span>
                    <div className="space-y-1">
                      {data.insights.recommendedTemplates.map((tpl, tIdx) => (
                        <div
                          key={tIdx}
                          className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200 flex items-center gap-2"
                        >
                          <span className="w-4 h-4 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {tIdx + 1}
                          </span>
                          <span className="font-semibold truncate">{tpl}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 고수익 수주 제언 & 즉각 액션 아이템 */}
                  <div className="pt-2 border-t border-white/10 space-y-1 text-[11px]">
                    <div className="text-slate-300">
                      <strong className="text-indigo-300">🎯 고수익 수주 전략: </strong>
                      <span>{data.insights.highTicketOpportunity}</span>
                    </div>
                    <div className="text-slate-300">
                      <strong className="text-teal-300">⚡ 실천 액션: </strong>
                      <span>{data.insights.actionItem}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
