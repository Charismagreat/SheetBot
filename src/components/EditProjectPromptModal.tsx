"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect } from "react";
import { X, Sparkles, Code, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Edit3, ArrowRight, Cpu } from "lucide-react";

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
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  // AI 엔진 모델 선택 관련 상태
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [allowUserSelection, setAllowUserSelection] = useState(true);

  useEffect(() => {
    if (project && isOpen) {
      setProjectName(project.name || "");
      setPrompt(project.prompt || project.description || "");
      setStep(1);
      setError(null);
      setGeneratedResult(null);

      apiFetch("/api/admin/pricing-cost")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.config) {
            setPricingModels(data.config.models || []);
            setAllowUserSelection(data.config.allowUserModelSelection !== false);
            const def = data.config.models?.find((m: any) => m.id === "gemini-3.5-flash") || data.config.models?.[0];
            if (def) setSelectedModel(def.id);
          }
        })
        .catch(() => {});
    }
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  const handleUpdateAndRedeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("추가 또는 수정할 자동화 요구사항을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. AI 코드 재단 (새로운 프롬프트 기반으로 최신 GAS 코드 생성)
      const genRes = await apiFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          sheetUrl: project.spreadsheetUrl || project.spreadsheet_url || "",
          customTitle: projectName.trim() || project.name,
          model: selectedModel,
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
      setStep(2);
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
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-800">
                {step === 1 ? "자연어 요구사항 수정 및 AI 코드 재배포" : "🎉 새 스크립트 코드 재배포 완료!"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1
                  ? `'${project.name}' 프로젝트의 요구사항을 수정하거나 기능을 추가하여 새 코드로 업데이트합니다.`
                  : "수정된 요구사항을 바탕으로 Google Apps Script가 성공적으로 갱신되었습니다."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
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

        {step === 1 ? (
          <form onSubmit={handleUpdateAndRedeploy} className="space-y-4 text-xs">
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
                    {pricingModels.find((m) => m.id === selectedModel)?.description || "선택한 모델로 코드가 재생성됩니다."}
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
                <span className="text-[11px] text-slate-400">기존 내용을 수정하거나 새 요구사항을 덧붙이세요</span>
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
                💡 AI가 수정된 요구사항 전체를 재분석하여 완성된 Google Apps Script 코드를 다시 작성하고, 대상 구글 시트에 원클릭으로 덮어써서 배포합니다.
              </p>
            </div>

            {/* 모달 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 코드 재생성 & 구글 시트 배포 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 코드 재배포 실행</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: 배포 완료 화면 */
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Google Apps Script가 성공적으로 갱신되었습니다!</span>
              </div>
              <p className="text-emerald-700 text-xs">
                수정된 요구사항이 반영된 새 코드가 구글 시트에 즉시 배포되었습니다.
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
              ) : <div />}

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
