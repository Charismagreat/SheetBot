"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  FileSpreadsheet,
  Code,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Layers,
  Cpu,
  MessageSquare,
  Send,
  Table,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  // 1: 기본 정보 입력, 2: AI 분석 브리핑 및 조율(HITL), 3: 생성 및 배포 완료
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sheetUrl, setSheetUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [autoDetectedTitle, setAutoDetectedTitle] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // AI 분석 결과 및 조율(HITL) 관련 상태
  const [analyzedSchema, setAnalyzedSchema] = useState<any>(null);
  const [turnCount, setTurnCount] = useState(0); // 0부터 시작, 최대 5회
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState<Array<{ role: "user" | "ai"; message: string }>>([]);

  // AI 엔진 모델 선택 관련 상태
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [allowUserSelection, setAllowUserSelection] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // 원가 및 사용 가능 모델 설정 로드
      apiFetch("/api/admin/pricing-cost")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.config) {
            setPricingModels(data.config.models || []);
            setAllowUserSelection(data.config.allowUserModelSelection !== false);
            const targetDefault = data.config.defaultModel || "gemini-3.8-flash";
            const def = data.config.models?.find((m: any) => m.id === targetDefault) || data.config.models?.[0];
            if (def) setSelectedModel(def.id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 구글 시트 URL 입력 시 시트 원본 제목 자동 조회 및 채우기
  const fetchSheetTitle = async (url: string, forceOverwrite = false) => {
    const trimmed = url.trim();
    if (!trimmed || trimmed.length < 20) return;

    setIsFetchingTitle(true);
    try {
      const res = await apiFetch(`/api/sheets/title?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (data?.success && data?.title) {
        if (forceOverwrite || !projectName.trim() || projectName === autoDetectedTitle) {
          setProjectName(data.title);
        }
        setAutoDetectedTitle(data.title);
      }
    } catch (e) {
      // 오류 시 침묵하여 수동 입력에 방해되지 않도록 처리
    } finally {
      setIsFetchingTitle(false);
    }
  };

  // 구글 시트 원본 이름으로 동기화 버튼 클릭 핸들러
  const handleSyncTitle = () => {
    if (!sheetUrl.trim()) return;
    if (autoDetectedTitle && projectName !== autoDetectedTitle) {
      setProjectName(autoDetectedTitle);
    } else {
      fetchSheetTitle(sheetUrl, true);
    }
  };

  const handleApplyTemplate = (text: string) => {
    setPrompt(text);
  };

  // 1단계: AI 시트 사전 정밀 분석 실행 (무료)
  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) {
      setError("구글 스프레드시트 URL 또는 ID를 입력해 주세요.");
      return;
    }
    if (!projectName.trim()) {
      setError("프로젝트 이름을 입력해 주세요.");
      return;
    }
    if (!prompt.trim()) {
      setError("자동화 요구사항을 자연어로 입력해 주세요.");
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const res = await apiFetch("/api/sheets/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          prompt: prompt.trim(),
          model: selectedModel,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.schema) {
        throw new Error(data.error || "시트 구조 분석에 실패했습니다.");
      }

      setAnalyzedSchema(data.schema);
      setTurnCount(1);
      setFeedbackHistory([
        {
          role: "ai",
          message: data.schema.planSummary || "스프레드시트 분석이 완료되었습니다. 아래 실행 계획을 검토해 주세요.",
        },
      ]);
      setStep(2); // 2단계 브리핑 화면으로 전환
    } catch (err: any) {
      setError(err.message || "시트 분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 2단계: 사용자 피드백 조율 전송 (최대 5회)
  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || turnCount >= 5 || analyzing) return;

    setAnalyzing(true);
    setError(null);
    const userMsg = feedbackText.trim();
    setFeedbackText("");

    // 히스토리에 사용자 메시지 즉시 추가
    setFeedbackHistory((prev) => [...prev, { role: "user", message: userMsg }]);

    try {
      const res = await apiFetch("/api/sheets/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          prompt: prompt.trim(),
          model: selectedModel,
          feedback: userMsg,
          previousSchema: analyzedSchema,
          turn: turnCount + 1,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.schema) {
        throw new Error(data.error || "피드백 반영 중 오류가 발생했습니다.");
      }

      setAnalyzedSchema(data.schema);
      setTurnCount((prev) => prev + 1);
      setFeedbackHistory((prev) => [
        ...prev,
        {
          role: "ai",
          message: data.schema.planSummary || "피드백을 반영하여 계획을 업데이트했습니다.",
        },
      ]);
    } catch (err: any) {
      setError(err.message || "피드백 조율 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 2단계 -> 3단계: 최종 승인 및 코드 생성/배포 (정규 토큰 1회 일괄 차감)
  const handleFinalDeploy = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. AI 코드 생성 (사전 분석된 스키마 강제 주입)
      const genRes = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sheetUrl,
          customTitle: projectName,
          model: selectedModel,
          analyzedSchema, // 검증 및 조율된 시트 구조 주입
        }),
      });
      const genJson = await genRes.json();
      if (!genJson.success || !genJson.data) {
        throw new Error(genJson.error || "AI 코드 생성에 실패했습니다.");
      }

      const scriptData = genJson.data;

      // 2. 프로젝트 등록 및 배포 (My DB 정규 테이블 저장)
      const projRes = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          spreadsheetUrl: sheetUrl.trim(),
          scriptCode: scriptData.scriptCode,
          manifest: scriptData.manifest,
          summary: scriptData.summary,
          features: scriptData.features,
          triggers: scriptData.triggers,
          prompt,
        }),
      });

      const projJson = await projRes.json();
      if (!projJson.success) {
        throw new Error(projJson.error || "프로젝트 저장에 실패했습니다.");
      }

      setGeneratedResult({
        ...scriptData,
        project: projJson.project,
      });
      setStep(3);
    } catch (err: any) {
      setError(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
    setStep(1);
    setSheetUrl("");
    setProjectName("");
    setAutoDetectedTitle(null);
    setPrompt("");
    setAnalyzedSchema(null);
    setTurnCount(0);
    setFeedbackHistory([]);
    setGeneratedResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-800">
                  {step === 1 && "새 Apps Script 자동화 프로젝트 추가"}
                  {step === 2 && "🔍 AI 시트 분석 브리핑 및 사전 동의 (HITL)"}
                  {step === 3 && "🎉 자동화 코드 배포 완료!"}
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {step === 1 && "1단계: 정보 입력"}
                  {step === 2 && `2단계: 계획 검토 (${turnCount}/5회 조율)`}
                  {step === 3 && "3단계: 배포 완료"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1 && "구글 시트 URL과 원하는 기능을 입력하면 AI가 시트 구조를 먼저 정밀 분석합니다."}
                {step === 2 && "AI가 파악한 시트 양식과 실행 계획을 확인하고, 필요한 경우 자유롭게 수정 조율할 수 있습니다."}
                {step === 3 && "Google Apps Script가 구글 시트에 안전하게 바인딩되었습니다."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading || analyzing}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: 기본 정보 입력 */}
        {step === 1 && (
          <form onSubmit={handleStartAnalysis} className="space-y-4 text-xs">
            {/* 스프레드시트 URL */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block">연결할 구글 스프레드시트 URL 또는 ID *</label>
                {isFetchingTitle && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    시트 제목 조회 중...
                  </span>
                )}
              </div>
              <div
                className="relative"
                data-easybot-hint="스프레드시트 URL: Apps Script 코드가 바인딩될 대상 구글 시트의 전체 URL 또는 스프레드시트 ID를 입력합니다."
              >
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSheetUrl(val);
                    if (val.includes("/spreadsheets/d/") || val.length >= 25) {
                      fetchSheetTitle(val);
                    }
                  }}
                  onBlur={() => {
                    if (sheetUrl) {
                      fetchSheetTitle(sheetUrl);
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/1vVmz56s0QrknZfhaOod_EX6-eoiYlXGW220inT5qXME/edit"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
                <FileSpreadsheet className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* 프로젝트 이름 */}
            <div
              className="space-y-1"
              data-easybot-hint="프로젝트 명칭: 대시보드에서 식별할 수 있는 직관적인 자동화 프로젝트 이름을 입력합니다."
            >
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block">프로젝트 이름 *</label>
                {sheetUrl.trim() && (
                  <button
                    type="button"
                    onClick={handleSyncTitle}
                    disabled={isFetchingTitle}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer border shadow-2xs ${
                      isFetchingTitle
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : autoDetectedTitle && projectName === autoDetectedTitle
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                        : "bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100"
                    }`}
                    title="클릭 시 구글 스프레드시트의 원본 이름으로 동기화합니다."
                  >
                    {isFetchingTitle ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                        <span>동기화 중...</span>
                      </>
                    ) : autoDetectedTitle && projectName === autoDetectedTitle ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>시트명 동기화됨</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 text-indigo-600" />
                        <span>시트명 동기화</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="예: 일일 마감 및 매출 자동 집계"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
              />
            </div>

            {/* 템플릿 추천 버튼 */}
            <div
              className="space-y-1.5 pt-1"
              data-easybot-hint="추천 템플릿: 자주 사용되는 자동화 시나리오를 원클릭으로 프롬프트에 채웁니다."
            >
              <span className="text-[11px] font-bold text-slate-400 block">⚡ 추천 프롬프트 원클릭 채우기:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "구글 시트 사이드바에서 PDF 발주서 파일을 업로드하면 AI가 분석하여 발주서 접수대장에 품목별로 1행씩 분리하여 최신순으로 자동 등록하는 시스템을 만들어줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-emerald-700">📄 PDF 발주서 AI 자동 접수</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">사이드바 업로드 및 품목별 분리</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "매일 자정에 당일 입력된 대장 데이터를 '일일_마감' 시트로 자동 복사 백업하고 총 수량과 합계 금액을 자동 계산하는 시간 기반 일일 자동 마감 기능을 만들어줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-indigo-700">🕒 일일 대장 자동 마감</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">매일 자정 백업 및 합계 산출</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyTemplate(
                      "시트 데이터가 수정될 때마다 변경 이력을 '로그' 시트에 자동으로 남기고, 특정 셀 값이 '승인'으로 변경되면 실시간 알림을 띄우는 onEdit 트리거를 작성해줘."
                    )
                  }
                  className="p-2 text-left bg-slate-50 hover:bg-amber-50/70 border border-slate-200/80 hover:border-amber-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
                >
                  <span className="text-amber-700">⚡ 실시간 변경 이력 로깅</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1">셀 수정 시 자동 이력 적재</span>
                </button>
              </div>
            </div>

            {/* AI 엔진 모델 선택 */}
            {allowUserSelection && pricingModels.length > 0 && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                    <span>사용할 Gemini AI 엔진 선택</span>
                  </div>
                  {pricingModels.find((m) => m.id === selectedModel) && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      토큰 차감 {pricingModels.find((m) => m.id === selectedModel)?.tokenMultiplier}배
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {pricingModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.tokenMultiplier}x 차감)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-indigo-700/80 flex items-center leading-tight">
                    {pricingModels.find((m) => m.id === selectedModel)?.description || "선택한 모델의 스펙으로 정밀 코드가 생성됩니다."}
                  </p>
                </div>
              </div>
            )}

            {/* 자연어 프롬프트 입력 */}
            <div
              className="space-y-1"
              data-easybot-hint="요구사항 기술: 구현하고자 하는 자동화 기능을 자유롭게 작성합니다."
            >
              <label className="font-bold text-slate-700 block">자동화 기능 요구사항 (자연어로 자유롭게 기술) *</label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 구글 시트 사이드바에서 PDF 발주서를 업로드하면 AI가 분석하여 '발주서 접수대장'에 품목별로 최신순 등록해줘."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none leading-relaxed"
                required
              />
            </div>

            {/* 1단계 액션 버튼 */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>사전 분석 & 5회 조율 무료 제공 (최종 승인 시에만 토큰 차감)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={analyzing}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={analyzing}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>시트 2차원 구조 및 수식 정밀 분석 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>🔍 AI 시트 정밀 분석 및 계획 수립</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Step 2: AI 분석 브리핑 및 대화형 조율(HITL) */}
        {step === 2 && analyzedSchema && (
          <div className="space-y-4 text-xs">
            {/* 시트 분석 요약 카드 */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-indigo-600" />
                  <span className="font-extrabold text-slate-800 text-xs">
                    분석된 시트: <span className="text-indigo-600 font-mono font-bold">'{analyzedSchema.targetTab || "기본 시트"}'</span>
                  </span>
                </div>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {analyzedSchema.archetypeName || analyzedSchema.archetype || "📊 누적 대장형"}
                </span>
              </div>

              {/* 컬럼/셀 구조 배지 */}
              {analyzedSchema.columns && analyzedSchema.columns.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                    <span>
                      감지된 헤더 ({analyzedSchema.headerRow || 1}행, 총 {analyzedSchema.columns.length}개 열):
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">
                      삽입 기준행: {analyzedSchema.dataStartRow || 2}행
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white border border-slate-200/80 rounded-xl">
                    {analyzedSchema.columns.map((c: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        title={c.purpose || c.name}
                      >
                        <span className="font-mono text-indigo-600 font-black">{c.letter || String.fromCharCode(65 + i)}</span>
                        <span>{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 고정 셀 또는 수식 보존 안내 (견적서/보고서 양식인 경우) */}
              {analyzedSchema.formCoordinates?.preservedFormulas && analyzedSchema.formCoordinates.preservedFormulas.length > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium">
                  🔒 <strong>보존 대상 수식 감지:</strong>{" "}
                  {analyzedSchema.formCoordinates.preservedFormulas.map((f: any) => `${f.cell}(${f.formula})`).join(", ")} (덮어쓰지 않고 자동 보존됩니다)
                </div>
              )}

              {/* 핵심 실행 전략 */}
              {analyzedSchema.keyStrategies && analyzedSchema.keyStrategies.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="font-bold text-slate-600 text-[11px] block">AI 실행 계획 요약:</span>
                  <ul className="space-y-1">
                    {analyzedSchema.keyStrategies.map((s: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 text-slate-700 font-medium text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 대화형 조율 피드백 루프 (최대 5회) */}
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950 text-[11px]">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI 계획 보완 및 사전 조율 대화</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  turnCount >= 5 ? "bg-rose-100 text-rose-700" : "bg-indigo-100 text-indigo-700"
                }`}>
                  잔여 조율 기회: {Math.max(0, 5 - turnCount)}/5회
                </span>
              </div>

              {/* 대화 히스토리 */}
              <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 bg-white rounded-xl border border-indigo-100 text-[11px]">
                {feedbackHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-50 text-indigo-900 ml-6 font-bold"
                        : "bg-slate-50 text-slate-800 mr-6"
                    }`}
                  >
                    <span className="text-[10px] font-black text-slate-400 block mb-0.5">
                      {msg.role === "user" ? "🙋 내 요청" : "🤖 AI 아키텍트 브리핑"}
                    </span>
                    <span>{msg.message}</span>
                  </div>
                ))}
              </div>

              {/* 피드백 입력창 */}
              {turnCount < 5 ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendFeedback();
                      }
                    }}
                    placeholder="계획에 수정할 점이 있다면 입력하세요 (예: 5행 대신 6행부터 넣어줘, 품목별 단가 포함해줘)"
                    className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    disabled={analyzing}
                  />
                  <button
                    type="button"
                    onClick={handleSendFeedback}
                    disabled={analyzing || !feedbackText.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>조율</span>
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 text-center py-1">
                  ✓ 최대 5회 조율이 완료되었습니다. 계획을 확인하시고 아래 승인 버튼을 눌러주세요.
                </p>
              )}
            </div>

            {/* 2단계 액션 버튼 */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading || analyzing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>처음으로 (0원 취소)</span>
              </button>

              <button
                type="button"
                onClick={handleFinalDeploy}
                disabled={loading || analyzing}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>정밀 코드 생성 및 구글 시트 배포 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>🚀 확인 및 자동화 코드 생성 승인</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 배포 완료 화면 */}
        {step === 3 && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Google 스프레드시트 바인딩 및 스크립트 배포 완료!</span>
              </div>
              <p className="text-emerald-950 font-medium leading-relaxed">
                구글 클라우드에 <code className="font-mono bg-white px-1.5 py-0.5 rounded text-emerald-700">Code.gs</code>와 <code className="font-mono bg-white px-1.5 py-0.5 rounded text-emerald-700">appsscript.json</code> 매니페스트가 성공적으로 푸시되었습니다.
              </p>
            </div>

            {generatedResult?.summary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-400 text-[10px] block">구현 기능 요약</span>
                <p className="font-bold text-slate-800">{generatedResult.summary}</p>
              </div>
            )}

            {generatedResult?.features && generatedResult.features.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-bold text-slate-400 text-[10px] block">주요 탑재 기능 목록</span>
                <ul className="space-y-1">
                  {generatedResult.features.map((feat: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 스크립트 코드 미리보기 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-400 text-[10px] flex items-center gap-1">
                  <Code className="w-3.5 h-3.5 text-slate-500" />
                  <span>생성된 Code.gs 소스코드 미리보기</span>
                </span>
                {generatedResult?.project?.scriptUrl && (
                  <a
                    href={generatedResult.project.scriptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:underline text-[11px] font-bold"
                  >
                    Google 스크립트 에디터에서 보기 →
                  </a>
                )}
              </div>
              <pre className="p-3 bg-slate-900 text-emerald-300 font-mono text-[11px] rounded-2xl max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                {generatedResult?.scriptCode}
              </pre>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={handleComplete}
                className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                대시보드로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
