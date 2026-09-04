"use client";

import React from "react";
import {
  Wand2,
  Sparkles,
  Smartphone,
  Mail,
  Trash2,
} from "lucide-react";
import { SmartDispatchRule } from "@/lib/smart-dispatch-types";

interface AdminSmartRulesTabProps {
  rules: SmartDispatchRule[];
  promptInput: string;
  onPromptInputChange: (value: string) => void;
  parsing: boolean;
  onSubmitPrompt: (e: React.FormEvent) => void;
  onToggleRule: (rule: SmartDispatchRule) => void;
  onDeleteRule: (id: string) => void;
}

export default function AdminSmartRulesTab({
  rules,
  promptInput,
  onPromptInputChange,
  parsing,
  onSubmitPrompt,
  onToggleRule,
  onDeleteRule,
}: AdminSmartRulesTabProps) {
  const examplePrompts = [
    "1:1 고객 문의가 들어오면 관리자 휴대폰으로 SMS를 보내고, 고객에게는 접수 확인 이메일을 발송해줘",
    "세금계산서 신청이 접수되면 관리자에게 긴급 알림 문자와 이메일을 모두 보내줘",
    "5만원 이상 토큰 충전 결제가 발생하면 관리자에게 결제 축하 문자를 발송해줘",
    "모든 유료 결제 발생 시 관리자에게 이메일로 결제 영수증 내역을 통보해줘",
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 상단 헤더 & 안내 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              AI 자연어 스마트 발송 규칙 빌더
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              문자나 메일이 자동 발송되어야 할 조건과 대상을 자연어로 자유롭게 입력하면, AI가 분석하여 자동 발송 규칙을 생성합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-purple-50 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 shadow-2xs">
            ✨ 이지데스크 AI Caller 탑재
          </span>
        </div>
      </div>

      {/* 자연어 프롬프트 입력 카드 */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <form onSubmit={onSubmitPrompt} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>자연어로 발송 조건 작성하기</span>
              </span>
              <span className="text-[11px] font-normal text-slate-400">
                예: &quot;고객 문의 시 관리자에게 문자 보내고 고객에게는 확인 메일 보내줘&quot;
              </span>
            </label>
            <textarea
              rows={3}
              required
              value={promptInput}
              onChange={(e) => onPromptInputChange(e.target.value)}
              placeholder="원하시는 발송 시점, 채널(문자/이메일), 수신 대상을 일상 언어로 편하게 적어주세요."
              className="w-full text-xs p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-slate-800 leading-relaxed resize-none shadow-2xs"
            />
          </div>

          {/* 추천 예시 프롬프트 칩들 */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500">💡 추천 자연어 예시 (클릭 시 자동 입력):</div>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.map((example, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onPromptInputChange(example)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-purple-50 text-[11px] text-slate-600 hover:text-purple-700 border border-slate-200 hover:border-purple-200 transition-all cursor-pointer text-left shadow-2xs"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* 제출 버튼 */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={parsing || !promptInput.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              <Wand2 className="w-4 h-4 text-purple-200" />
              <span>{parsing ? "AI 자연어 규칙 분석 중..." : "AI 규칙 분석 및 등록"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 현재 등록된 자연어 스마트 규칙 목록 카드 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>현재 활성화된 스마트 발송 규칙</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px] font-black">
                {rules.length}개
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              이벤트가 감지되면 아래 규칙 조건에 부합하는 채널로 자동 발송이 실행됩니다.
            </p>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            등록된 스마트 규칙이 없습니다. 위에서 자연어로 새로운 규칙을 등록해 보세요!
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  rule.enabled
                    ? "bg-slate-50/70 border-purple-200/80 shadow-2xs"
                    : "bg-slate-100/50 border-slate-200 opacity-60"
                }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">{rule.name}</span>

                    {/* 발송 채널 뱃지 */}
                    <div className="flex items-center gap-1">
                      {rule.channels.includes("sms") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">
                          <Smartphone className="w-3 h-3 text-sky-600" />
                          <span>문자(SMS)</span>
                        </span>
                      )}
                      {rule.channels.includes("email") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                          <Mail className="w-3 h-3 text-indigo-600" />
                          <span>이메일</span>
                        </span>
                      )}
                    </div>

                    {/* 대상 뱃지 */}
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-medium">
                      대상:{" "}
                      {rule.targetRecipient === "both"
                        ? "관리자 + 고객"
                        : rule.targetRecipient === "customer"
                        ? "고객"
                        : "관리자"}
                    </span>
                  </div>

                  {/* 사용자가 작성한 원래 자연어 */}
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-purple-600 font-bold shrink-0">자연어 규칙:</span>
                    <span className="italic font-medium text-slate-700">&quot;{rule.prompt}&quot;</span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    발송 조건: {rule.conditionSummary}{" "}
                    {rule.minAmount ? `(${rule.minAmount.toLocaleString()}원 이상)` : ""}
                  </div>
                </div>

                {/* 상태 토글 & 삭제 버튼 */}
                <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <button
                    type="button"
                    onClick={() => onToggleRule(rule)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      rule.enabled
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                    }`}
                  >
                    {rule.enabled ? "규칙 활성 (ON)" : "규칙 일시중지 (OFF)"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                    title="규칙 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
