"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Settings,
  Cpu,
  Sparkles,
  Bot,
  HelpCircle,
  Code2,
  Save,
  CheckCircle2,
  RefreshCw,
  ArrowLeft,
  Sliders,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface AiModelOption {
  id: string;
  name: string;
  tag: string;
  description: string;
  isRecommended: boolean;
}

interface AiSettingsState {
  defaultModel: string;
  scriptGeneratorModel: string;
  easybotModel: string;
  helpModel: string;
  temperature: number;
}

export default function AiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [settings, setSettings] = useState<AiSettingsState>({
    defaultModel: "gemini-3.5-flash",
    scriptGeneratorModel: "gemini-3.5-flash",
    easybotModel: "gemini-3.5-flash",
    helpModel: "gemini-3.5-flash",
    temperature: 0.3,
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setModels(data.availableModels || []);
      }
    } catch (err) {
      console.error("설정 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(data.error || "설정 저장에 실패했습니다.");
      }
    } catch (err: any) {
      alert("설정 저장 오류: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyModel = (modelId: string) => {
    setSettings((prev) => ({
      ...prev,
      defaultModel: modelId,
      scriptGeneratorModel: modelId,
      easybotModel: modelId,
      helpModel: modelId,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      {/* 상단 네비게이션 헤더 */}
      <div className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              title="대시보드로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-lg text-white shadow-xs">
                  <Settings className="w-4 h-4" />
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  AI 모델 환경 설정
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
                  EGDesk AI Caller
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Apps Script 생성, 이지봇(EasyBot) 대화, 컨텍스트 도움말에 사용할 구글 제미나이(Gemini) 모델을 실시간 구성합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleApplyModel("gemini-3.8-flash")}
              type="button"
              className="px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
              title="모든 영역을 최신 gemini-3.8-flash로 일괄 지정"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Gemini 3.8 Flash 전체 적용</span>
            </button>
            <button
              onClick={() => handleApplyModel("gemini-3.5-flash")}
              type="button"
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all flex items-center gap-1.5"
              title="모든 영역을 gemini-3.5-flash로 일괄 지정"
            >
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span>3.5 Flash 적용</span>
            </button>
            <Link
              href="/dashboard/ai-usage"
              className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100/70 border border-indigo-200/80 rounded-xl transition-all"
            >
              사용료 관제 대시보드
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm font-medium">AI 모델 설정을 불러오는 중입니다...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* 상단 안내 배너 */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-900 to-slate-900 text-white shadow-lg relative overflow-hidden">
              <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
                      Google Gemini 3.5 Flash 모델 지원 안내
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold">
                    더 빠르고 강력한 차세대 제미나이 3.5 엔진을 경험해 보세요
                  </h2>
                  <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                    이지데스크(EGDesk) AI Caller와 직결되어 있으며, 아래 설정을 변경하면 즉시 모든 Apps Script 생성기 및 이지봇에 반영됩니다.
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10 text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>사내 AI 키 & 중앙 토큰 관리 연동</span>
                </div>
              </div>
            </div>

            {/* 메인 폼 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. Apps Script 자동 생성 모델 */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                      <Code2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Apps Script 생성 모델</h3>
                      <p className="text-[11px] text-slate-400">구글 시트 자동화 Code.gs 및 트리거 자동 생성</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-600 rounded-md">
                    Script Generator
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">지정 모델</label>
                  <select
                    value={settings.scriptGeneratorModel}
                    onChange={(e) => setSettings({ ...settings, scriptGeneratorModel: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.isRecommended ? "⭐ [추천]" : ""} ({m.tag})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {models.find((m) => m.id === settings.scriptGeneratorModel)?.description ||
                      "선택한 모델의 스펙에 따라 코드가 생성됩니다."}
                  </p>
                </div>
              </div>

              {/* 2. 이지봇(EasyBot) 오케스트레이터 모델 */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">이지봇(EasyBot) 대화 모델</h3>
                      <p className="text-[11px] text-slate-400">시트 수식 자문, 코드 가이드 및 자연어 대화</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-600 rounded-md">
                    EasyBot Chat
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">지정 모델</label>
                  <select
                    value={settings.easybotModel}
                    onChange={(e) => setSettings({ ...settings, easybotModel: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.isRecommended ? "⭐ [추천]" : ""} ({m.tag})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {models.find((m) => m.id === settings.easybotModel)?.description ||
                      "자연스러운 질의응답 및 GAS 코드 예시 가이드를 제공합니다."}
                  </p>
                </div>
              </div>

              {/* 3. AI Contextual 도움말 모델 */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">AI 도움말 가이드 모델</h3>
                      <p className="text-[11px] text-slate-400">마우스 호버 시 실시간 요약 설명 제공</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-600 rounded-md">
                    Contextual Help
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">지정 모델</label>
                  <select
                    value={settings.helpModel}
                    onChange={(e) => setSettings({ ...settings, helpModel: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.isRecommended ? "⭐ [추천]" : ""} ({m.tag})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {models.find((m) => m.id === settings.helpModel)?.description ||
                      "짧고 직관적인 핵심 팁을 신속하게 생성합니다."}
                  </p>
                </div>
              </div>

              {/* 4. 창의성 (Temperature) 및 전역 기본 모델 */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">응답 창의성 (Temperature)</h3>
                      <p className="text-[11px] text-slate-400">코드 정확도와 답변 스타일 미세 조정</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                    {settings.temperature.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.temperature}
                    onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                    <span>0.0 (완전 정밀 / 코드에 권장)</span>
                    <span>0.5 (균형)</span>
                    <span>1.0 (창의적 응답)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 저장 버튼 및 피드백 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
              <div className="text-xs text-slate-500">
                설정을 저장하면 모든 신규 생성 요청 및 이지봇 대화에 실시간으로 즉각 반영됩니다.
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {saveSuccess && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>성공적으로 저장되었습니다!</span>
                  </span>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{saving ? "저장 중..." : "모델 설정 저장하기"}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
