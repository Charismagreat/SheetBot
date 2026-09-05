"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  Save,
  Lock,
  ArrowUpRight,
  ShieldCheck,
  Cpu,
  Layers,
  Percent,
} from "lucide-react";
import { PricingCostConfig, ModelPricingDetail } from "@/lib/ai-settings";

interface PackageSimulation {
  id: string;
  name: string;
  priceKrw: number;
  netSalesKrw: number;
  vatKrw: number;
  pgFeeKrw: number;
  totalTokens: number;
  primaryModelName: string;
  primaryEstimatedCostKrw: number;
  primaryRealProfitKrw: number;
  primaryRealMarginPercent: number;
  legacyModelName: string;
  legacyEstimatedCostKrw: number;
  legacyRealProfitKrw: number;
  legacyRealMarginPercent: number;
}

export default function AdminPricingCostTab() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [config, setConfig] = useState<PricingCostConfig | null>(null);
  const [simulations, setSimulations] = useState<PackageSimulation[]>([]);

  // 1. 원가 및 마진율 설정 불러오기
  const fetchPricingCost = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/pricing-cost");
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSimulations(data.packageSimulations || []);
      } else {
        setMessage({ type: "error", text: data.error || "원가 설정 로드 실패" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: "원가 설정 조회 오류: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingCost();
  }, []);

  // 2. 제미나이 공식 사이트 요율 실시간 동기화 버튼 핸들러
  const handleSyncOfficial = async () => {
    if (!confirm("Google 공식 AI Studio / Vertex AI 공시 요율로 실시간 업데이트하시겠습니까?")) return;
    setSyncing(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/admin/pricing-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_official" }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setMessage({ type: "success", text: data.message });
        fetchPricingCost(); // 시뮬레이션 재계산
      } else {
        setMessage({ type: "error", text: data.error || "동기화 실패" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: "동기화 통신 오류: " + err.message });
    } finally {
      setSyncing(false);
    }
  };

  // 3. 관리자 수동 저장 핸들러
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/admin/pricing-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setMessage({ type: "success", text: data.message });
        fetchPricingCost(); // 시뮬레이션 재계산
      } else {
        setMessage({ type: "error", text: data.error || "저장 실패" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: "저장 통신 오류: " + err.message });
    } finally {
      setSaving(false);
    }
  };

  // 모델별 단가 변경 핸들러
  const handleModelChange = (index: number, field: keyof ModelPricingDetail, value: any) => {
    if (!config) return;
    const newModels = [...config.models];
    newModels[index] = {
      ...newModels[index],
      [field]: value,
    };
    setConfig({
      ...config,
      models: newModels,
    });
  };

  if (loading || !config) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm font-semibold">AI 원가 및 마진율 분석 데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-left">
      {/* 알림 메시지 배너 */}
      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. 상단 컨트롤 패널: 공식 요율 동기화 + 마진율 요약 카드 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>실제 LLM 원가 및 비즈니스 마진율 관제 엔진</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              구글 제미나이(Gemini) 공식 원가 실시간 동기화 &amp; 마진 방어
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              최신 Gemini 3.8 / 3.5 Flash 및 Pro 모델의 100만 토큰당 실제 API 원가를 추적하고, 사용자의 선택적 모델 사용에 따른 
              <strong> 토큰 차감 가중치(Multiplier)</strong>와 <strong>목표 운영 마진율(%)</strong>을 안전하게 통제합니다.
            </p>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 pt-1">
              <span>최종 공식 동기화: {new Date(config.lastSyncedAt).toLocaleString("ko-KR")}</span>
            </div>
          </div>

          {/* 제미나이 공식 사이트 요율 실시간 업데이트 버튼 */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
            <button
              onClick={handleSyncOfficial}
              disabled={syncing}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="Google 공식 AI Studio / Vertex AI 공시 요율을 즉시 가져와 테이블을 갱신합니다."
            >
              <Globe className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "공식 요율 동기화 중..." : "🌐 제미나이 공식 사이트 원가 실시간 업데이트"}</span>
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveConfig} className="space-y-8">
        {/* 2. 전역 재무 및 기본 모델 파라미터 (기본 모델, 환율, 부가세, PG수수료, 목표 마진율, 회원 선택) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* 기본 제공 모델 지정 */}
          <div className="bg-white p-5 rounded-3xl border-2 border-indigo-200/80 shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span className="text-indigo-950 font-black">기본 제공 표준 모델</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <select
                value={config.defaultModel || "gemini-3.8-flash"}
                onChange={(e) => setConfig({ ...config, defaultModel: e.target.value })}
                className="w-full px-2.5 py-2 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs font-black text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 truncate"
              >
                {config.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === "gemini-3.8-flash" ? "⭐" : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              신규 프로젝트 및 기본 적용 표준 AI 엔진
            </p>
          </div>

          {/* 기준 환율 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>기준 환율 (USD/KRW)</span>
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-base font-black text-slate-800">₩</span>
              <input
                type="number"
                value={config.exchangeRate}
                onChange={(e) => setConfig({ ...config, exchangeRate: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1000"
                max="2000"
                step="10"
                required
              />
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              인보이스 청구 환율 (1,400원 권장)
            </p>
          </div>

          {/* 부가가치세율 (VAT) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>부가가치세율 (VAT)</span>
              <Percent className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={config.vatRate ?? 10}
                onChange={(e) => setConfig({ ...config, vatRate: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                min="0"
                max="30"
                step="1"
                required
              />
              <span className="text-base font-black text-sky-700">%</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              국세청 납부 세액 (기본 10%, 예수금)
            </p>
          </div>

          {/* PG 결제 대행 수수료율 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>PG 결제 수수료율</span>
              <Percent className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={config.pgFeeRate ?? 3.3}
                onChange={(e) => setConfig({ ...config, pgFeeRate: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                min="0"
                max="10"
                step="0.1"
                required
              />
              <span className="text-base font-black text-amber-700">%</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              카드/간편결제 대행 수수료 (통상 3.3%)
            </p>
          </div>

          {/* 목표 운영 마진율 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>목표 운영 마진율</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={config.targetMarginRate}
                onChange={(e) => setConfig({ ...config, targetMarginRate: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                min="10"
                max="95"
                step="5"
                required
              />
              <span className="text-base font-black text-emerald-700">%</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              실질 순매출(공급가) 대비 목표 마진
            </p>
          </div>

          {/* 회원 모델 선택 허용 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
              <span>회원 AI 모델 선택권</span>
              <Cpu className="w-4 h-4 text-violet-600" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-extrabold text-slate-800">
                {config.allowUserModelSelection ? "선택 허용" : "기본 고정"}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowUserModelSelection}
                  onChange={(e) => setConfig({ ...config, allowUserModelSelection: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              프로젝트별 모델 변경 권한 부여
            </p>
          </div>
        </div>

        {/* 3. 모델별 실제 원가 및 토큰 차감 가중치(Multiplier) 매트릭스 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Gemini 모델별 실제 원가 및 사용자 토큰 차감 배율(Multiplier)
                </h3>
                <p className="text-xs text-slate-500">
                  사용자가 고성능 모델을 고를 때 지갑에서 차감될 토큰 배율을 지정하여 원가 역전을 방지합니다.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400">총 {config.models.length}개 모델 등록됨</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 font-bold border-y border-slate-100 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">모델명 (Model ID)</th>
                  <th className="py-3 px-3">분류</th>
                  <th className="py-3 px-3">입력 원가 ($/1M)</th>
                  <th className="py-3 px-3">출력 원가 ($/1M)</th>
                  <th className="py-3 px-3">100만 토큰 원화 원가</th>
                  <th className="py-3 px-4 text-indigo-700 bg-indigo-50/50">차감 가중치 (Multiplier)</th>
                  <th className="py-3 px-4">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.models.map((model, idx) => (
                  <tr key={model.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* 모델명 */}
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        {model.isOfficialLatest && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black">
                            LATEST
                          </span>
                        )}
                        <span>{model.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 block mt-0.5">{model.id}</span>
                    </td>

                    {/* 카테고리 */}
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        model.category === "pro"
                          ? "bg-purple-100 text-purple-700"
                          : model.category === "flash_lite"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}>
                        {model.category.toUpperCase()}
                      </span>
                    </td>

                    {/* 입력 원가 ($/1M) */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 font-mono">$</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={model.inputCostUsdPerMillion}
                          onChange={(e) => handleModelChange(idx, "inputCostUsdPerMillion", parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </td>

                    {/* 출력 원가 ($/1M) */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 font-mono">$</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={model.outputCostUsdPerMillion}
                          onChange={(e) => handleModelChange(idx, "outputCostUsdPerMillion", parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </td>

                    {/* 100만 토큰 원화 원가 (자동 산출) */}
                    <td className="py-3 px-3 font-bold text-slate-700 font-mono">
                      ₩ {model.estimatedKrwPerMillion?.toLocaleString()}
                    </td>

                    {/* 차감 가중치 Multiplier */}
                    <td className="py-3 px-4 bg-indigo-50/30">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="10"
                          value={model.tokenMultiplier}
                          onChange={(e) => handleModelChange(idx, "tokenMultiplier", parseFloat(e.target.value) || 1.0)}
                          className="w-16 px-2 py-1 bg-white border border-indigo-200 rounded-lg text-xs font-black text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        />
                        <span className="text-xs font-extrabold text-indigo-600">x</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {model.tokenMultiplier < 1 ? "할인 차감" : model.tokenMultiplier === 1 ? "표준 차감" : `${model.tokenMultiplier}배 차감`}
                      </span>
                    </td>

                    {/* 설명 */}
                    <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs">
                      {model.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. 토큰 요금제 패키지별 실시간 손익 시뮬레이션 표 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-slate-900 text-sm">
                토큰 판매 패키지별 실질 손익 &amp; 운영 마진율(영업이익률) 시뮬레이션
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              * 회계 산정: 결제액에서 <strong>VAT(10%) 제외한 순매출(공급가)</strong> 및 <strong>PG 수수료(3.3%)</strong> 차감 반영
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
            {simulations.map((sim) => (
              <div
                key={sim.id}
                className="p-5 rounded-2xl bg-gradient-to-b from-slate-50/80 to-white border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">{sim.name}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                      {sim.totalTokens.toLocaleString()} 토큰
                    </span>
                  </div>

                  {/* 결제 금액 및 회계 순매출 분해 */}
                  <div className="mt-3 space-y-1.5 border-b border-slate-100 pb-3">
                    <div className="flex items-baseline justify-between">
                      <div className="text-2xl font-black text-slate-900">
                        ₩ {sim.priceKrw.toLocaleString()}
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold">결제액 (VAT 포함)</span>
                    </div>
                    
                    {/* 공급가액 및 정산 내역 */}
                    <div className="bg-slate-100/70 rounded-xl p-2.5 space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>순매출 (공급가액):</span>
                        <span className="font-mono font-bold text-slate-800">₩ {sim.netSalesKrw.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-400 text-[10px]">
                        <span>- 부가가치세 (예수금 10%):</span>
                        <span className="font-mono">₩ {sim.vatKrw.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-amber-700 text-[10px]">
                        <span>- PG 결제 수수료 ({config.pgFeeRate ?? 3.3}%):</span>
                        <span className="font-mono font-bold">- ₩ {sim.pgFeeKrw.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-indigo-700 font-bold border-t border-slate-200/80 pt-1 text-[11px]">
                        <span>정산 수입 (순매출-PG):</span>
                        <span className="font-mono">₩ {(sim.netSalesKrw - sim.pgFeeKrw).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* 추천 최신 표준 모델 사용 시 실질 영업 손익 */}
                  <div className="space-y-2 text-xs pt-3">
                    <div className="text-[11px] font-bold text-emerald-700 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{sim.primaryModelName} (기본 추천)</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-black">표준 1.0x</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>실효 API 원가:</span>
                      <span className="font-mono font-bold text-slate-700">- ₩ {sim.primaryEstimatedCostKrw.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-800 font-bold">
                      <span>실질 영업이익:</span>
                      <span className="font-mono font-black text-emerald-600">₩ {sim.primaryRealProfitKrw.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-bold text-[11px]">실질 운영 마진율:</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {sim.primaryRealMarginPercent}%
                      </span>
                    </div>
                  </div>

                  {/* 구형 고비용 모델 사용 시 실질 손익 (차감 배율 방어) */}
                  <div className="space-y-2 text-xs pt-3 border-t border-slate-100 mt-3">
                    <div className="text-[11px] font-bold text-indigo-700 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{sim.legacyModelName}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-black">2.2x 차감 방어</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>실효 API 원가:</span>
                      <span className="font-mono font-bold text-slate-700">- ₩ {sim.legacyEstimatedCostKrw.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-800 font-bold">
                      <span>실질 영업이익:</span>
                      <span className="font-mono font-black text-indigo-600">₩ {sim.legacyRealProfitKrw.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-bold text-[11px]">실질 운영 마진율:</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {sim.legacyRealMarginPercent}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 text-[10px] text-slate-400 border-t border-slate-100 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>부가세 10% 분리 및 PG 수수료 3.3% 차감 완료</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 저장 버튼 바 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs">
          <div className="text-xs text-slate-500">
            변경한 모델별 원가 및 토큰 차감 가중치는 저장 즉시 전체 신규 생성 및 OCR 분석에 실시간 적용됩니다.
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-slate-900 to-indigo-900 hover:from-slate-800 hover:to-indigo-800 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? "저장 중..." : "AI 원가 및 마진율 설정 저장하기"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
