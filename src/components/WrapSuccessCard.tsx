"use client";

import React, { useState } from "react";
import { Copy, Check, X, Link as LinkIcon, Sparkles, ExternalLink } from "lucide-react";

export type WrapTokenSummary = {
  deducted: number;
  remainingBalance: number;
};

export type WrapSuccessCardProps = {
  bridgeUrl: string;
  promptTemplate?: string;
  projectName?: string;
  isExisting?: boolean;
  wrapTokens?: WrapTokenSummary;
  idempotentReplay?: boolean;
  onClose?: () => void;
  /** When true, renders without outer modal chrome (parent supplies overlay). */
  embedded?: boolean;
};

export default function WrapSuccessCard({
  bridgeUrl,
  promptTemplate,
  projectName,
  isExisting = false,
  wrapTokens,
  idempotentReplay,
  onClose,
  embedded = false,
}: WrapSuccessCardProps) {
  const [copiedType, setCopiedType] = useState<"antigravity" | "copy" | null>(null);

  const handleOpenAntigravity = async () => {
    const textToCopy =
      promptTemplate ||
      `구글 시트 래핑 주소: ${bridgeUrl}\n위 구글 시트 구조를 확인하고 원하는 자동화 기능을 주입해줘:\n[추가할 기능 입력]`;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      /* ignore */
    }

    if (typeof window !== "undefined") {
      window.open("antigravity://", "_blank");
    }

    setCopiedType("antigravity");
    setTimeout(() => setCopiedType(null), 4000);
  };

  const handleCopy = async () => {
    const textToCopy =
      promptTemplate ||
      `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:\n웹 주소: ${bridgeUrl}\n요구사항: 내 구글 시트 구조에 맞는 스프레드시트 자동화 메뉴와 기능을 주입해줘.`;
    await navigator.clipboard.writeText(textToCopy);
    setCopiedType("copy");
    setTimeout(() => setCopiedType(null), 2500);
  };

  const shell = (
    <div
      className={`bg-white overflow-hidden flex flex-col ${
        embedded ? "rounded-2xl border border-slate-200" : "rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full animate-in zoom-in-95 duration-150"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              {isExisting ? "기존 연결 프로젝트 확인!" : "내 구글 시트 래핑 완료!"}
            </h3>
            {projectName && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 truncate max-w-[180px]">
                {projectName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isExisting ? (
              <span>
                기존에 발급된 <strong>전용 래핑 주소</strong>입니다. (기존 코드 100% 안전 보존)
              </span>
            ) : (
              <span>
                안티그라비티, Cursor, Claude Code 등에 전달할 <strong>전용 래핑 주소</strong>가 발급되었습니다.
              </span>
            )}
          </p>
          {(wrapTokens || idempotentReplay) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {idempotentReplay && (
                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                  이미 래핑됨 (재차감 없음)
                </span>
              )}
              {wrapTokens && wrapTokens.deducted > 0 && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  래핑 토큰 −{wrapTokens.deducted.toLocaleString()} · 잔액 {wrapTokens.remainingBalance.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>발급된 래핑 주소</span>
            </span>
            {isExisting ? (
              <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                기존 연동 유지 중
              </span>
            ) : (
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                연결 준비 완료
              </span>
            )}
          </div>

          <div
            onClick={handleCopy}
            className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 cursor-pointer hover:border-emerald-500/60 transition-colors group"
            title="클릭하여 복사"
          >
            <div className="font-mono text-xs text-emerald-400 break-all select-all leading-relaxed">
              {bridgeUrl || "https://sheetbot.cloud/api/agent/gas-bridge?token=..."}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleOpenAntigravity}
            className={`w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg cursor-pointer active:scale-98 ${
              copiedType === "antigravity"
                ? "bg-slate-900 text-purple-300 shadow-slate-900/20 border-2 border-purple-400"
                : "bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white shadow-purple-600/30 hover:shadow-xl hover:shadow-purple-600/35 hover:scale-[1.01]"
            }`}
          >
            {copiedType === "antigravity" ? (
              <>
                <Check className="w-5 h-5 text-purple-400 stroke-[3]" />
                <span>프롬프트 복사 & 안티그라비티 실행됨!</span>
              </>
            ) : (
              <>
                <span className="text-base sm:text-lg">🚀</span>
                <span>안티그라비티 열기 및 자동화 시작</span>
                <ExternalLink className="w-4 h-4 opacity-80" />
              </>
            )}
          </button>

          {copiedType === "antigravity" && (
            <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-[11px] text-purple-900 font-bold text-center animate-in fade-in duration-200 shadow-2xs">
              ✨ 프롬프트가 클립보드에 자동 복사되었습니다! 안티그라비티 창에서 바로 <strong>[Ctrl + V]</strong>로 붙여넣으세요.
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 ${
              copiedType === "copy"
                ? "bg-slate-900 text-emerald-300 border border-emerald-500"
                : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 hover:border-slate-300"
            }`}
          >
            {copiedType === "copy" ? (
              <>
                <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                <span>프롬프트가 클립보드에 복사되었습니다!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>프롬프트만 복사하기 (Cursor · Claude Code 등)</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-slate-50 border-2 border-emerald-100 rounded-2xl p-4.5 space-y-3">
          <div className="font-extrabold text-xs text-emerald-950 flex items-center justify-between">
            <span className="text-emerald-800 text-[13px]">💡 AI 에이전트 연동 및 결과 확인법</span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">30초 완성</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <div className="leading-relaxed text-slate-700">
                위 <strong className="text-purple-700 font-extrabold">[🚀 안티그라비티 열기]</strong>를 누르면 프롬프트가 복사되고 앱이 자동 실행됩니다.
                <br />
                <span className="text-[11px] text-slate-500">※ Cursor, Claude Code 사용자는 [프롬프트만 복사하기]를 누르시면 됩니다.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div className="leading-relaxed text-slate-700">
                <strong>안티그라비티, Cursor, Claude Code</strong> 등 AI 채팅창에 붙여넣고 원하는 기능을 적어 전송합니다.
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div className="leading-relaxed text-slate-800">
                <strong className="text-emerald-900 font-extrabold">[시트에서 결과 확인]</strong>
                <br />
                코드 주입 후 구글 시트를 <strong>새로고침(F5)</strong>하면 상단 <strong className="text-emerald-700">🚀 SheetBot 메뉴</strong>로 실행할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="text-center pt-0.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium bg-slate-100/90 px-2.5 py-1 rounded-full border border-slate-200/60">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Antigravity · Cursor · Claude Code · Windsurf 완벽 호환
            </span>
          </div>
        </div>

        {onClose && !embedded && (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold hover:underline cursor-pointer"
            >
              대시보드로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return shell;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      {shell}
    </div>
  );
}
