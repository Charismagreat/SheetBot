import React, { useState } from "react";
import { Zap, RefreshCw, Sparkles, ToggleRight, ToggleLeft, Trash2, ChevronDown, ChevronUp, Check, ArrowRight } from "lucide-react";

export interface ScenarioTemplate {
  id: string;
  category: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  title: string;
  prompt: string;
  description: string;
  benefit: string;
}

export const OFFICIAL_SCENARIOS: ScenarioTemplate[] = [
  {
    id: "pos_sales",
    category: "매출 장부",
    badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
    badgeText: "💳 POS 매출",
    icon: "💳",
    title: "POS 결제 승인 ➔ 매출 시트 자동 장부화",
    prompt: "페이히어·오케이포스 결제 승인 알림 수신 시 매출관리 시트에 결제시간, 금액, 결제수단을 1행씩 실시간 자동 추가해줘",
    description: "스마트폰 상단바에 뜨는 포스 결제 알림을 0초 만에 구글 시트 매출 장부로 전표화합니다.",
    benefit: "영수증 수기 정리 0분 / 무인 장부 완성",
  },
  {
    id: "deposit_sms",
    category: "고객 안내",
    badgeBg: "bg-blue-50 border-blue-200 text-blue-700",
    badgeText: "💰 입금 확인",
    icon: "💰",
    title: "무통장 입금 확인 ➔ 고객에게 0원 감사 문자",
    prompt: "D열의 입금상태가 '완료'로 변경되면 E열 고객 번호로 '[시트봇샵] 입금이 정상 확인되었습니다. 금일 안전하게 발송됩니다' 문자를 내 폰으로 발송해줘",
    description: "시트에서 입금 상태를 변경하는 즉시 고객 번호로 감사 문자가 통신비 0원으로 자동 전송됩니다.",
    benefit: "건당 20~40원 문자비 0원 절감",
  },
  {
    id: "delivery_order",
    category: "배달 관리",
    badgeBg: "bg-amber-50 border-amber-200 text-amber-700",
    badgeText: "🛵 배달 주문",
    icon: "🛵",
    title: "배민·쿠팡이츠 주문 ➔ 배달 시트 자동 전표",
    prompt: "배달의민족·쿠팡이츠 사장님 앱 주문 알림 수신 시 배달관리 시트에 주문금액과 메뉴내용을 실시간으로 적어줘",
    description: "배달앱 관리자 포털에 매번 들어가지 않아도 구글 시트 하나로 주문 현황이 실시간 통합 정리됩니다.",
    benefit: "배달앱 포털 엑셀 다운로드 불필요",
  },
  {
    id: "stock_alert",
    category: "재고 경고",
    badgeBg: "bg-rose-50 border-rose-200 text-rose-700",
    badgeText: "📦 재고 경고",
    icon: "📦",
    title: "안전 재고 부족 ➔ 사장님 휴대폰 긴급 발주 알림",
    prompt: "재고 시트의 F열 '남은수량'이 5개 이하로 떨어지면 내 휴대폰 번호로 '[긴급재고] 특정 품목의 재고가 5개 미만입니다. 발주가 필요합니다' 경고 문자를 보내줘",
    description: "품절 사태를 사전에 방지하여 매출 손실을 막고, 중요한 순간에만 사장님 폰으로 알림을 보냅니다.",
    benefit: "품절 사태 사전 방지 / 긴급 발주 확보",
  },
  {
    id: "booking_remind",
    category: "예약 리마인드",
    badgeBg: "bg-purple-50 border-purple-200 text-purple-700",
    badgeText: "📅 예약 확정",
    icon: "📅",
    title: "상담·예약 확정 ➔ 고객 맞춤형 리마인드 전송",
    prompt: "예약 시트의 상태가 '확정'으로 바뀌면 고객 번호로 '{{고객명}}님, {{예약일시}} 예약이 확정되었습니다. 매장 위치 안내: map.kakao.com' 맞춤형 문자를 보내줘",
    description: "시트의 고객명과 예약일시를 동적으로 치환하여 프로페셔널한 맞춤형 안내 문자를 보냅니다.",
    benefit: "노쇼(No-Show) 방지 / 고객 만족도 증대",
  },
  {
    id: "daily_summary",
    category: "일일 마감",
    badgeBg: "bg-indigo-50 border-indigo-200 text-indigo-700",
    badgeText: "🌙 마감 브리핑",
    icon: "🌙",
    title: "매일 밤 10시 마감 ➔ 당일 총매출 요약 보고 문자",
    prompt: "매일 밤 10시에 오늘 총매출 합계와 건수를 요약해서 내 휴대폰 번호로 마감 브리핑 문자를 발송해줘",
    description: "퇴근길이나 자택에서도 매장 결산 내역을 사장님 스마트폰으로 즉시 요약 보고받습니다.",
    benefit: "퇴근길 원격 결산 / 매출 브리핑",
  },
  {
    id: "auto_quote",
    category: "스마트 견적",
    badgeBg: "bg-teal-50 border-teal-200 text-teal-700",
    badgeText: "📑 스마트 견적",
    icon: "📑",
    title: "고객 문의 수신 ➔ AI 단가표 매칭 & 모바일 견적서 자동 회신",
    prompt: "고객이 문자로 상품/서비스 견적을 문의하면 시트의 단가표를 AI로 자동 조회하여 맞춤형 견적서 링크를 고객 번호로 0원 회신해줘",
    description: "고객의 자연어 문의를 AI가 분석하여 단가표와 매칭하고, 고화질 모바일 견적서 뷰어 링크를 10초 만에 고객에게 회신합니다.",
    benefit: "상담 응대 시간 90% 단축 / 견적서 자동 발급",
  },
];

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
  samplePrompts?: string[];
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
}: NotificationsRulesTabProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [isScenarioGuideOpen, setIsScenarioGuideOpen] = useState(false);

  const handleSelectScenario = (sc: ScenarioTemplate) => {
    setSelectedScenarioId(sc.id);
    setPromptInput(sc.prompt);
  };

  return (
    <div className="space-y-6">
      {/* 자연어 규칙 생성 폼 */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-4 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">자연어 스마트 규칙 &amp; POS·배달앱 자동 수신</h3>
              <p className="text-xs text-slate-500">
                원하는 조건을 평소 말하듯 적으면 AI가 <strong>[시트 ➔ 고객 알림 문자]</strong> 및 <strong>[포스·배달 푸시 ➔ 시트 자동 장부화]</strong> 규칙을 즉시 설계합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsScenarioGuideOpen((prev) => !prev)}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>실전 추천 6대 시나리오</span>
            {isScenarioGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* 🌟 추천 6대 시나리오 상세 카드 그리드 (접기/펼치기) */}
        {isScenarioGuideOpen && (
          <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span>💡 소상공인·자영업자 대표 검증 6대 자동화 시나리오</span>
              </span>
              <span className="text-[11px] text-slate-400">클릭 시 입력창에 즉시 자동 적용됩니다</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {OFFICIAL_SCENARIOS.map((sc) => {
                const isSelected = selectedScenarioId === sc.id;
                return (
                  <div
                    key={sc.id}
                    onClick={() => handleSelectScenario(sc)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between text-left space-y-2 ${
                      isSelected
                        ? "bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs"
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black border ${sc.badgeBg}`}>
                          {sc.badgeText}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                          {sc.benefit}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-slate-900 leading-snug">{sc.title}</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{sc.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-indigo-600">
                      <span>{isSelected ? "선택됨" : "이 규칙 선택"}</span>
                      {isSelected ? <Check className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 규칙 입력 폼 */}
        <form onSubmit={onCreateRule} className="space-y-3">
          <div className="relative">
            <textarea
              value={promptInput}
              onChange={(e) => {
                setPromptInput(e.target.value);
                setSelectedScenarioId(null);
              }}
              placeholder="예: 페이히어·오케이포스 결제 승인 알림 수신 시 매출관리 시트에 승인금액과 시간을 실시간 1행 추가해줘"
              rows={3}
              className="w-full p-4 rounded-2xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-xs sm:text-sm resize-none"
            />
            <button
              type="submit"
              disabled={creatingRule || !promptInput.trim()}
              className="absolute right-3 bottom-3.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {creatingRule ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI 분석 및 등록 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>규칙 등록하기</span>
                </>
              )}
            </button>
          </div>

          {/* 원터치 스마트 추천 시나리오 칩 (상시 노출) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>원터치 추천 시나리오 (클릭 시 자동 입력):</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {OFFICIAL_SCENARIOS.map((sc) => {
                const isSelected = selectedScenarioId === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectScenario(sc)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span>{sc.icon}</span>
                    <span>{sc.badgeText.replace(/^[^\s]+\s*/, "")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </div>

      {/* 등록된 규칙 목록 */}
      <div className="space-y-3 text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900">등록된 스마트 알림 규칙</h3>
            <span className="text-xs text-slate-400">({rules.length}개)</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loadingRules}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer shadow-2xs"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRules ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>

        {loadingRules ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">규칙을 불러오는 중...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs space-y-2">
            <p className="font-bold text-slate-700">등록된 스마트 알림 규칙이 없습니다.</p>
            <p className="text-[11px] text-slate-400">
              위의 <strong>원터치 추천 시나리오 칩</strong>을 누르거나 자연어로 원하는 조건을 입력하여 첫 번째 규칙을 생성해 보세요!
            </p>
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
                      {rule.trigger_event === "row_added"
                        ? "새 행 추가"
                        : rule.trigger_event === "pos_payment_push"
                        ? "💳 결제 승인 감지"
                        : rule.trigger_event === "inbound_sms"
                        ? "📱 고객 문자 수신"
                        : "시트 셀 수정"}
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
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                    {rule.prompt}
                  </p>

                  <div className="text-[11px] text-slate-500 space-y-1 pt-1">
                    <div>
                      <strong>수신 대상:</strong>{" "}
                      {rule.target_recipient === "self"
                        ? "회원 본인 휴대폰"
                        : rule.target_recipient === "sheet_append"
                        ? "구글 시트 행으로 자동 기록"
                        : `시트의 '${rule.recipient_column || "연락처"}' 열 고객 번호`}
                    </div>
                    <div className="truncate">
                      <strong>메시지/기록 내용:</strong> {rule.message_template}
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
