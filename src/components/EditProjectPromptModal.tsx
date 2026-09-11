"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Code,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit3,
  Cpu,
  Table,
  MessageSquare,
  Send,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

interface EditProjectPromptModalProps {
  isOpen: boolean;
  project: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditProjectPromptModal({
  isOpen,
  project,
  onClose,
  onSuccess,
}: EditProjectPromptModalProps) {
  // 1단계: 수정 요구사항 입력 / 2단계: AI 시트 재분석 & 대화형 조율(HITL) / 3단계: 최종 배포 완료
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // AI 분석 결과 및 대화형 조율 상태
  const [analyzedSchema, setAnalyzedSchema] = useState<any>(null);
  const [turnCount, setTurnCount] = useState(0); // 최대 5회
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState<
    Array<{ role: "user" | "ai"; message: string }>
  >([]);

  // AI 엔진 모델 선택 관련 상태
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [allowUserSelection, setAllowUserSelection] = useState(true);
  const [includeCopilotSidebar, setIncludeCopilotSidebar] = useState(true);
  const [enableSqliteSync, setEnableSqliteSync] = useState(true);
  const [sqliteFolderName, setSqliteFolderName] = useState("SheetBot_Databases");
  const [sqliteFileName, setSqliteFileName] = useState("");

  const sheetUrl =
    project?.spreadsheetUrl || project?.spreadsheet_url || "";

  // 기존 Apps Script 안전 감지 및 보존(Merge) / 덮어쓰기(Overwrite) 상태
  const [isDetectingGas, setIsDetectingGas] = useState(false);
  const [existingGasInfo, setExistingGasInfo] = useState<{
    hasExistingScript: boolean;
    projectId?: string;
    filesCount?: number;
    files?: Array<{ name: string; type: string }>;
    functionNames?: string[];
    existingCode?: string;
    scriptUrl?: string;
  } | null>(null);
  const [mergeMode, setMergeMode] = useState<"MERGE" | "OVERWRITE">("MERGE");
  const [showCodePreview, setShowCodePreview] = useState(false);

  useEffect(() => {
    if (project && isOpen) {
      setProjectName(project.name || "");
      setPrompt(project.prompt || project.description || "");
      setSqliteFileName(`${project.name || 'sheetbot'}_데이터.sqlite`);
      setStep(1);
      setError(null);
      setGeneratedResult(null);
      setAnalyzedSchema(null);
      setTurnCount(0);
      setFeedbackHistory([]);
      setFeedbackText("");
      setMergeMode("MERGE");
      setShowCodePreview(false);

      // 모달 오픈 시 현재 프로젝트의 기존 코드 또는 시트의 클라우드 Apps Script 코드 확인
      const curSheetUrl = project.spreadsheetUrl || project.spreadsheet_url || "";
      if (curSheetUrl) {
        setIsDetectingGas(true);
        apiFetch(`/api/projects/detect-gas?sheetUrl=${encodeURIComponent(curSheetUrl)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data?.success && data?.hasExistingScript) {
              setExistingGasInfo({
                hasExistingScript: true,
                projectId: data.projectId,
                filesCount: data.filesCount,
                files: data.files,
                functionNames: data.functionNames,
                existingCode: data.existingCode || project.scriptCode || project.script_code || "",
                scriptUrl: data.scriptUrl,
              });
            } else if (project.scriptCode || project.script_code) {
              // DB에 저장된 기존 코드가 있는 경우 폴백
              const code = project.scriptCode || project.script_code;
              const matches = [...code.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)];
              setExistingGasInfo({
                hasExistingScript: true,
                functionNames: matches.map((m: any) => m[1]),
                existingCode: code,
              });
            } else {
              setExistingGasInfo(null);
            }
          })
          .catch(() => {
            if (project.scriptCode || project.script_code) {
              const code = project.scriptCode || project.script_code;
              const matches = [...code.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)];
              setExistingGasInfo({
                hasExistingScript: true,
                functionNames: matches.map((m: any) => m[1]),
                existingCode: code,
              });
            }
          })
          .finally(() => {
            setIsDetectingGas(false);
          });
      }

      apiFetch("/api/admin/pricing-cost")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.config) {
            setPricingModels(data.config.models || []);
            setAllowUserSelection(data.config.allowUserModelSelection !== false);
            const targetDefault = data.config.defaultModel || "gemini-3.8-flash";
            const def =
              data.config.models?.find((m: any) => m.id === targetDefault) ||
              data.config.models?.[0];
            if (def) setSelectedModel(def.id);
          }
        })
        .catch(() => {});
    }
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  // 1단계: 수정된 요구사항과 시트 전체 문서를 AI로 정밀 재분석
  const handleAnalyzeSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("추가 또는 수정할 자동화 요구사항을 입력해 주세요.");
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
        throw new Error(data.error || "시트 구조 재분석에 실패했습니다.");
      }

      setAnalyzedSchema(data.schema);
      setTurnCount(1);
      setFeedbackHistory([
        {
          role: "ai",
          message:
            data.schema.planSummary ||
            "스프레드시트 구조 및 수정 요구사항 재분석이 완료되었습니다. 아래 실행 계획을 검토해 주세요.",
        },
      ]);
      setStep(2); // 2단계 브리핑 및 대화 화면으로 전환
    } catch (err: any) {
      setError(err.message || "시트 재분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 2단계: 사용자 피드백 조율 전송 (최대 5회 대화)
  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || turnCount >= 5 || analyzing) return;

    setAnalyzing(true);
    setError(null);
    const userMsg = feedbackText.trim();
    setFeedbackText("");

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
          message:
            data.schema.planSummary || "피드백을 반영하여 계획을 업데이트했습니다.",
        },
      ]);
    } catch (err: any) {
      setError(err.message || "피드백 조율 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // 2단계 -> 3단계: 조율된 스키마로 최종 AI 코드 생성 및 구글 시트 재배포
  const handleFinalDeploy = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. AI 코드 생성 (조율된 스키마 및 안전 보존 병합 옵션 주입)
      const genRes = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          sheetUrl: sheetUrl.trim(),
          customTitle: projectName.trim() || project.name,
          model: selectedModel,
          analyzedSchema, // 조율된 최신 시트 스키마 전달
          existingScriptCode: existingGasInfo?.existingCode || undefined,
          mergeMode: existingGasInfo?.hasExistingScript ? mergeMode : "OVERWRITE",
          includeCopilotSidebar,
          enableSqliteSync,
          sqliteFolderName: sqliteFolderName.trim() || "SheetBot_Databases",
          sqliteFileName: (sqliteFileName.trim() || `${projectName || project.name || 'sheetbot'}_데이터`).replace(/\.sqlite$/i, '') + '.sqlite',
        }),
      });

      const genJson = await genRes.json();
      if (!genJson.success || !genJson.data) {
        throw new Error(genJson.error || "AI 스크립트 코드 생성에 실패했습니다.");
      }

      const scriptData = genJson.data;

      // 2. 프로젝트 DB 갱신 및 구글 시트에 새 코드 재배포
      const patchRes = await apiFetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: project.id,
          name: projectName.trim() || project.name,
          prompt: prompt.trim(),
          scriptCode: scriptData.scriptCode,
          manifest: scriptData.manifest,
          summary: scriptData.summary,
          features: scriptData.features,
          triggers: scriptData.triggers,
          redeploy: true,
        }),
      });

      const patchJson = await patchRes.json();
      if (!patchJson.success) {
        throw new Error(patchJson.error || "프로젝트 갱신 및 재배포에 실패했습니다.");
      }

      setGeneratedResult(scriptData);
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
  };

  const editorUrl =
    project.scriptUrl ||
    (project.scriptId
      ? `https://script.google.com/d/${project.scriptId}/edit`
      : project.gasProjectId
      ? `https://script.google.com/d/${project.gasProjectId}/edit`
      : "");

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto text-left">
        {/* 모달 헤더 및 단계 표시 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-800">
                  {step === 1 && "자연어 요구사항 수정 및 AI 재분석"}
                  {step === 2 && "AI 시트 정밀 분석 및 대화형 계획 조율"}
                  {step === 3 && "🎉 새 스크립트 코드 재배포 완료!"}
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Step {step}/3
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1 &&
                  `'${project.name}' 프로젝트의 요구사항을 수정하고 AI 시트 재분석을 실행합니다.`}
                {step === 2 &&
                  "AI가 재분석한 시트 구조를 확인하고, 추가 요청이나 보완사항을 대화로 조율하세요."}
                {step === 3 &&
                  "조율된 계획을 바탕으로 Google Apps Script가 성공적으로 갱신되었습니다."}
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

        {/* Step 1: 요구사항 수정 폼 */}
        {step === 1 && (
          <form onSubmit={handleAnalyzeSheet} className="space-y-4 text-xs">
            {/* 프로젝트 이름 */}
            <div className="space-y-1">
              <label className="font-bold text-slate-700 block">프로젝트 이름</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                required
              />
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
                    {pricingModels.find((m) => m.id === selectedModel)?.description ||
                      "선택한 모델로 시트 분석 및 코드가 재생성됩니다."}
                  </p>
                </div>
              </div>
            )}

            {/* 자연어 프롬프트 수정 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 block">
                  자동화 기능 요구사항 (자연어 수정 및 기능 추가) *
                </label>
                <span className="text-[11px] text-slate-400">
                  기존 내용을 수정하거나 새 요구사항을 덧붙이세요
                </span>
              </div>
              <textarea
                rows={6}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="예: 기존 발주서 접수대장 기능에 더해, 특정 셀 값이 변경되면 알림을 보내는 트리거를 추가해줘."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none"
                required
              />
              <p className="text-[10px] text-slate-400">
                💡 'AI 시트 재분석 및 계획 수립'을 누르면 AI가 현재 구글 시트 문서 전체를 다시 스캔하고, 수정된 요구사항에 맞는 실행 계획을 사용자님께 먼저 브리핑해 드립니다.
              </p>
            </div>

            {/* 시트 내장 AI 코파일럿 사이드바 옵션 */}
            <label className="flex items-start gap-2.5 p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl cursor-pointer hover:bg-indigo-100/60 transition-colors">
              <input
                type="checkbox"
                checked={includeCopilotSidebar}
                onChange={(e) => setIncludeCopilotSidebar(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
              />
              <div className="flex-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                  <span>🤖 구글 시트 내장형 AI 코파일럿 사이드바 자동 포함</span>
                  <span className="text-[10px] font-black px-1.5 py-0.2 bg-indigo-200 text-indigo-800 rounded-full">추천</span>
                </div>
                <p className="text-[11px] text-indigo-700/90 mt-0.5 leading-normal">
                  배포 후 구글 시트 상단 메뉴에서 사이드바를 열어 새 요구사항을 말하면, AI가 코드를 다시 생성하여 시트에 즉시 자가 주입(Self-Update)합니다.
                </p>
              </div>
            </label>

            {/* Google Drive SQLite 양방향 연동 옵션 */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableSqliteSync}
                  onChange={(e) => setEnableSqliteSync(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                />
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <span>🗄️ Google Drive SQLite 양방향 연동 (데이터 전송 & 2가지 조회)</span>
                    <span className="text-[10px] font-black px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full">신규</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                    시트의 데이터를 구글 드라이브 SQLite DB로 아카이빙하고, 시트 안에서 간편 필터 및 AI 자연어(Text-to-SQL)로 즉시 조회합니다.
                  </p>
                </div>
              </label>

              {enableSqliteSync && (
                <div className="pt-2 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      📁 드라이브 저장 폴더
                    </label>
                    <input
                      type="text"
                      value={sqliteFolderName}
                      onChange={(e) => setSqliteFolderName(e.target.value)}
                      placeholder="SheetBot_Databases"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      🗃️ SQLite 파일명 (.sqlite)
                    </label>
                    <input
                      type="text"
                      value={sqliteFileName}
                      onChange={(e) => setSqliteFileName(e.target.value)}
                      placeholder={projectName ? `${projectName}_데이터.sqlite` : 'sheetbot_데이터.sqlite'}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 🛡️ 기존 Apps Script 코드 안전 감지 배너 및 보존/덮어쓰기 선택 카드 */}
            {isDetectingGas ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2 text-slate-500 font-bold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>시트에 연결된 기존 Apps Script 코드 확인 중...</span>
              </div>
            ) : existingGasInfo && existingGasInfo.hasExistingScript ? (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-xs text-amber-950">
                          기존 Apps Script 코드가 보존 대상입니다
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-800">
                          안전 보호 작동 중
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                        기존 작성된 함수({existingGasInfo.functionNames?.length || 0}개)의 삭제를 방지하고 신규 요구사항을 안전하게 증분(Merge)합니다.
                      </p>
                    </div>
                  </div>

                  {existingGasInfo.existingCode && (
                    <button
                      type="button"
                      onClick={() => setShowCodePreview((prev) => !prev)}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-white/80 hover:bg-white border border-amber-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <Code className="w-3 h-3" />
                      <span>{showCodePreview ? "코드 접기" : "기존 코드 보기"}</span>
                    </button>
                  )}
                </div>

                {/* 감지된 함수 배지 리스트 */}
                {existingGasInfo.functionNames && existingGasInfo.functionNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px] pt-0.5">
                    <span className="font-bold text-amber-900">보존 대상 함수:</span>
                    {existingGasInfo.functionNames.slice(0, 6).map((fn, idx) => (
                      <span
                        key={idx}
                        className="font-mono font-bold px-1.5 py-0.5 bg-white/90 border border-amber-200 text-amber-900 rounded"
                      >
                        {fn}()
                      </span>
                    ))}
                    {existingGasInfo.functionNames.length > 6 && (
                      <span className="text-amber-700 font-bold">
                        외 {existingGasInfo.functionNames.length - 6}개
                      </span>
                    )}
                  </div>
                )}

                {/* 기존 소스코드 미리보기 토글 */}
                {showCodePreview && existingGasInfo.existingCode && (
                  <div className="p-2.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] max-h-40 overflow-y-auto border border-slate-700 leading-relaxed">
                    <pre className="whitespace-pre-wrap">{existingGasInfo.existingCode}</pre>
                  </div>
                )}

                {/* 안전 병합(Merge) vs 덮어쓰기(Overwrite) 선택 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      mergeMode === "MERGE"
                        ? "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                        : "bg-white/60 border-amber-200 hover:bg-white text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="editMergeMode"
                      value="MERGE"
                      checked={mergeMode === "MERGE"}
                      onChange={() => setMergeMode("MERGE")}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-extrabold text-xs text-slate-800">
                          🛡️ 기존 코드 보존 & 새 기능 추가
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                          권장
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                        기존 함수와 메뉴를 100% 보존하면서 새 요구사항을 덧붙여 안전하게 병합합니다.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      mergeMode === "OVERWRITE"
                        ? "bg-white border-rose-500 ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-white/60 border-amber-200 hover:bg-white text-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="editMergeMode"
                      value="OVERWRITE"
                      checked={mergeMode === "OVERWRITE"}
                      onChange={() => setMergeMode("OVERWRITE")}
                      className="mt-0.5 accent-rose-600"
                    />
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-extrabold text-xs text-slate-800">
                          ⚠️ 기존 코드 덮어쓰기
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                        기존 코드를 지우고 이번 요구사항에 맞춰 완전히 새롭게 작성합니다.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            ) : null}

            {/* 모달 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={analyzing}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={analyzing}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>시트 구조 및 요구사항 재분석 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>🔍 AI 시트 재분석 및 계획 수립</span>
                  </>
                )}
              </button>
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
                    분석된 시트:{" "}
                    <span className="text-indigo-600 font-mono font-bold">
                      '{analyzedSchema.targetTab || "기본 시트"}'
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {existingGasInfo?.hasExistingScript && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      mergeMode === "MERGE"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-rose-100 text-rose-800 border border-rose-300"
                    }`}>
                      {mergeMode === "MERGE"
                        ? `🛡️ 기존 코드 ${existingGasInfo.functionNames?.length || 0}개 함수 보존 병합`
                        : "⚠️ 기존 코드 덮어쓰기 모드"}
                    </span>
                  )}
                  <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {analyzedSchema.archetypeName || analyzedSchema.archetype || "📊 누적 대장형"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIncludeCopilotSidebar(!includeCopilotSidebar)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                      includeCopilotSidebar
                        ? "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200"
                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                    }`}
                    title="클릭하여 구글 시트 내장 AI 코파일럿 포함 여부를 변경합니다."
                  >
                    {includeCopilotSidebar ? "🤖 AI 코파일럿 포함" : "🤖 AI 코파일럿 제외"}
                  </button>
                </div>
              </div>

              {/* 컬럼 구조 배지 */}
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
                        <span className="font-mono text-indigo-600 font-black">
                          {c.letter || String.fromCharCode(65 + i)}
                        </span>
                        <span>{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 핵심 실행 전략 */}
              {analyzedSchema.keyStrategies && analyzedSchema.keyStrategies.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="font-bold text-slate-600 text-[11px] block">
                    AI 실행 계획 요약:
                  </span>
                  <ul className="space-y-1">
                    {analyzedSchema.keyStrategies.map((s: string, idx: number) => (
                      <li
                        key={idx}
                        className="flex items-start gap-1.5 text-slate-700 font-medium text-[11px]"
                      >
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
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    turnCount >= 5
                      ? "bg-rose-100 text-rose-700"
                      : "bg-indigo-100 text-indigo-700"
                  }`}
                >
                  잔여 조율 기회: {Math.max(0, 5 - turnCount)}/5회
                </span>
              </div>

              {/* 대화 히스토리 */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-indigo-100 text-[11px]">
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
                      {msg.role === "user" ? "🙋 내 추가 요청" : "🤖 AI 아키텍트 브리핑"}
                    </span>
                    <span>{msg.message}</span>
                  </div>
                ))}
              </div>

              {/* 피드백 입력창 */}
              {turnCount < 5 ? (
                <div className="flex gap-1.5 pt-1">
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
                    placeholder="예: D열 품번은 없으면 빈칸으로 두고 E열 품명만 필수로 넣어줘"
                    disabled={analyzing}
                    className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleSendFeedback}
                    disabled={analyzing || !feedbackText.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                  >
                    {analyzing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>전송</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200 font-semibold text-center">
                  💡 최대 5회 조율이 완료되었습니다. 아래 [AI 코드 재배포 실행]을 눌러 배포를 진행하세요.
                </p>
              )}
            </div>

            {/* Step 2 액션 버튼 */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading || analyzing}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>이전 (요구사항 재입력)</span>
              </button>

              <button
                type="button"
                onClick={handleFinalDeploy}
                disabled={loading || analyzing}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>조율된 계획으로 구글 시트에 코드 재배포 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>🚀 계획 승인 및 AI 코드 재배포 실행</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 최종 배포 완료 화면 */}
        {step === 3 && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Google Apps Script가 성공적으로 갱신되었습니다!</span>
              </div>
              <p className="text-emerald-700 text-xs">
                사용자님과 조율된 실행 계획이 완벽히 반영된 새 코드가 구글 시트에 즉시 배포되었습니다.
              </p>
            </div>

            {generatedResult?.summary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-700 block">✨ 구현된 기능 요약:</span>
                <p className="text-slate-600">{generatedResult.summary}</p>
              </div>
            )}

            {generatedResult?.scriptCode && (
              <div className="space-y-1">
                <span className="font-bold text-slate-700 block">📝 주입된 새 Apps Script 소스코드:</span>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-56 leading-relaxed">
                  <code>{generatedResult.scriptCode}</code>
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {editorUrl ? (
                <a
                  href={editorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl flex items-center gap-1.5 transition-all border border-indigo-200"
                >
                  <Code className="w-4 h-4" />
                  <span>스크립트 편집기에서 확인 ↗</span>
                </a>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleComplete}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                확인 완료
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
