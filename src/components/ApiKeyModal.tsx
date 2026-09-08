"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  ShieldCheck,
  Terminal,
  Bot,
  AlertTriangle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [lastUsedAt, setLastUsedAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const fetchApiKey = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/user/api-key");
      const data = await res.json();
      if (data.success && data.apiKey) {
        setApiKey(data.apiKey);
        setLastUsedAt(data.lastUsedAt);
        setCreatedAt(data.createdAt);
      }
    } catch (err) {
      console.error("API 키 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchApiKey();
      setShowKey(false);
      setCopied(false);
      setCopiedPrompt(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const samplePrompt = `내 시트봇 API 키는 ${apiKey || "sk_sheetbot_..."}야.
이 구글 시트 주소([구글 시트 URL 입력])로 프로젝트를 만들고,
[원하는 자동화 기능(예: 매일 자정 미수금 집계 및 슬랙 발송)] 코드를 짜서 배포해줘.`;

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(samplePrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleRegenerate = async () => {
    if (
      !window.confirm(
        "API 키를 재발급하시겠습니까?\n이전 키는 즉시 해지되며, 기존에 연동된 외부 에이전트 요청이 중단될 수 있습니다."
      )
    ) {
      return;
    }

    try {
      setRegenerating(true);
      const res = await apiFetch("/api/user/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success && data.apiKey) {
        setApiKey(data.apiKey);
        setCreatedAt(data.createdAt);
        setShowKey(true);
        alert("새로운 API 키가 성공적으로 발급되었습니다.");
      } else {
        alert(data.error || "API 키 재발급에 실패했습니다.");
      }
    } catch (err: any) {
      alert("재발급 오류: " + err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 15)}${"•".repeat(24)}${apiKey.slice(-4)}`
    : "sk_sheetbot_••••••••••••••••••••••••••••••••";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-5 bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-violet-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight flex items-center gap-2">
                개인 API 키 (AI 에이전트 연동용)
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/30 text-violet-200 border border-violet-400/20">
                  sk_sheetbot
                </span>
              </h3>
              <p className="text-xs text-violet-200/80">안티그라비티 등 외부 AI 에이전트와 시트봇을 100% 자동 연동합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* API 키 디스플레이 영역 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                내 활성 API 키
              </label>
              <span className="text-[11px] text-slate-400">
                {createdAt ? `발급일: ${new Date(createdAt).toLocaleDateString()}` : ""}
              </span>
            </div>

            <div className="relative flex items-center">
              <div className="w-full font-mono text-xs px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 select-all pr-24 overflow-x-auto">
                {loading ? "API 키 조회 중..." : showKey ? apiKey : maskedKey}
              </div>

              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                  title={showKey ? "키 숨기기" : "키 전체 보기"}
                  disabled={loading}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  disabled={loading || !apiKey}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      복사
                    </>
                  )}
                </button>
              </div>
            </div>

            {lastUsedAt && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                최근 외부 에이전트 호출 일시: {new Date(lastUsedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* 에이전트 대화 프롬프트 예시 */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-violet-50/70 rounded-2xl p-4 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-extrabold text-indigo-950">안티그라비티 원스톱 사용 예시</span>
              </div>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className={`text-[11px] font-bold px-2 py-1 rounded-md flex items-center gap-1 transition-colors ${
                  copiedPrompt ? "bg-emerald-100 text-emerald-800" : "bg-white text-indigo-700 hover:bg-indigo-100/70 border border-indigo-200/60"
                }`}
              >
                {copiedPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedPrompt ? "프롬프트 복사됨" : "프롬프트 복사"}
              </button>
            </div>
            <p className="text-[11px] text-indigo-900/80 mb-2 leading-relaxed">
              안티그라비티 채팅창에 이 프롬프트를 복사하여 전달하면, 안티그라비티가 프로젝트 생성부터 Apps Script 코드 배포까지 완전 자동으로 처리합니다.
            </p>
            <div className="bg-white/90 rounded-xl p-3 border border-indigo-100 text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed select-all">
              {samplePrompt}
            </div>
          </div>

          {/* 기술 규격 (cURL / API 명세) */}
          <div className="bg-slate-900 rounded-2xl p-4 text-slate-200">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-300">
              <Terminal className="w-4 h-4 text-violet-400" />
              개발자 / 에이전트 HTTP 요청 규격
            </div>
            <pre className="text-[10px] font-mono text-slate-300 bg-slate-950/80 p-2.5 rounded-lg overflow-x-auto leading-relaxed border border-slate-800">
{`POST /api/agent/projects
Authorization: Bearer ${apiKey || "sk_sheetbot_..."}
Content-Type: application/json

{
  "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/...",
  "name": "내 자동화 프로젝트",
  "prompt": "10행 헤더 기준으로 매일 마감 통계 기록"
}`}
            </pre>
          </div>

          {/* 키 재발급 경고 및 버튼 */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>키가 노출되었을 경우 즉시 재발급하세요.</span>
            </div>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || loading}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
              <span>{regenerating ? "재발급 중..." : "API 키 재발급"}</span>
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
