import React from "react";
import { Zap, RefreshCw, Sparkles, ToggleRight, ToggleLeft, Trash2 } from "lucide-react";

interface NotificationsRulesTabProps {
  rules: any[];
  loadingRules: boolean;
  promptInput: string;
  setPromptInput: (val: string) => void;
  creatingRule: boolean;
  onCreateRule: (e: React.FormEvent) => void;
  onToggleRule: (rule: any) => void;
  onDeleteRule: (rule: any) => void;
  onRefresh: () => void;
  samplePrompts: string[];
}

export default function NotificationsRulesTab({
  rules,
  loadingRules,
  promptInput,
  setPromptInput,
  creatingRule,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
  onRefresh,
  samplePrompts,
}: NotificationsRulesTabProps) {
  return (
    <div className="space-y-6">
      {/* 자연어 규칙 생성 폼 */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">자연어 발송 템플릿 &amp; 자동 발송 규칙</h3>
            <p className="text-xs text-slate-500">
              발송 조건과 문자 문구를 자연어로 입력하면, AI가 치환 변수(예: &#123;&#123;고객명&#125;&#125;, &#123;&#123;주문금액&#125;&#125;)와 트리거를 자동 분석해 등록합니다.
            </p>
          </div>
        </div>

        <form onSubmit={onCreateRule} className="space-y-3">
          <div className="relative">
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="예: D열의 주문상태가 '결제완료'로 바뀌면 고객 연락처로 감사 문자를 보내줘"
              rows={3}
              className="w-full p-4 rounded-2xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-xs sm:text-sm resize-none"
            />
            <button
              type="submit"
              disabled={creatingRule || !promptInput.trim()}
              className="absolute right-3 bottom-3.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {creatingRule ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI 분석 및 등록 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>규칙 생성</span>
                </>
              )}
            </button>
          </div>

          {/* 예시 프롬프트 칩 */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 font-bold mr-1">추천 예시:</span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPromptInput(p)}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* 규칙 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900">등록된 발송 템플릿 &amp; 규칙 목록</h3>
          <button
            onClick={onRefresh}
            disabled={loadingRules}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loadingRules ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">규칙을 불러오는 중...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
            등록된 스마트 알림 규칙이 없습니다. 위 입력창에서 자연어로 새 규칙을 생성해 보세요!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between space-y-3 ${
                  rule.is_active === 1 ? "border-slate-200 shadow-sm" : "border-slate-200 opacity-60 bg-slate-50/50"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100">
                      {rule.trigger_event === "row_added" ? "새 행 추가" : "시트 셀 수정"}
                    </span>
                    <button
                      onClick={() => onToggleRule(rule)}
                      className="flex items-center gap-1 text-xs font-extrabold cursor-pointer"
                    >
                      {rule.is_active === 1 ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <ToggleRight className="w-5 h-5" /> 활성
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1">
                          <ToggleLeft className="w-5 h-5" /> 꺼짐
                        </span>
                      )}
                    </button>
                  </div>

                  <h4 className="font-black text-sm text-slate-900">{rule.name}</h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {rule.prompt}
                  </p>

                  <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                    <div>
                      <strong>수신 대상:</strong>{" "}
                      {rule.target_recipient === "self"
                        ? "회원 본인 휴대폰"
                        : `시트의 '${rule.recipient_column || "연락처"}' 열 고객 번호`}
                    </div>
                    <div className="truncate">
                      <strong>메시지 내용:</strong> {rule.message_template}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => onDeleteRule(rule)}
                    className="text-slate-400 hover:text-rose-600 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>삭제</span>
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
