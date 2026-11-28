"use client";

import { apiFetch } from '@/lib/api';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface ContactProfile {
  id: number;
  uuid?: string;
  contact_key: string;
  contact_name: string;
  phone_number?: string;
  multi_labels_json?: string;
  locked_labels_json?: string;
  closeness: number;
  favorability: number;
  interest: number;
  economic_value: number;
  risk_urgency: number;
  reliability: number;
  fraud_risk: number;
  authenticity_consistency: number;
  final_trust_score: number;
  final_risk_score: number;
  risk_grade: string;
  trend: string;
  signal_count: number;
  last_emotion_json?: string;
  evidence_summary?: string;
  last_interaction_at?: string;
}

interface ContactSignal {
  id: number;
  source_type: string;
  source_ref?: string;
  multi_labels_json?: string;
  emotion_json?: string;
  favorability: number;
  fraud_risk: number;
  detected_red_flags_json?: string;
  evidence_text?: string;
  occurred_at?: string;
}

interface FactCheckItem {
  id: string;
  category: string;
  question: string;
  whyImportant: string;
  passRiskDelta: number;
  failRiskDelta: number;
}

interface TestQuestionItem {
  id: string;
  targetSuspicion: string;
  script: string;
  goodReaction: string;
  redFlagReaction: string;
}

interface SelfCheckQuestionItem {
  id: string;
  question: string;
  options: {
    code: string;
    label: string;
    riskDelta: number;
    trustDelta: number;
  }[];
}

interface VerificationRow {
  id?: number;
  uuid: string;
  contact_key: string;
  contact_name: string;
  trigger_reason: string;
  ai_initial_risk_score: number;
  ai_initial_trust_score: number;
  fact_checklist_json?: string;
  test_questions_json?: string;
  self_check_questions_json?: string;
  user_responses_json?: string;
  recalculated_risk_score?: number | null;
  recalculated_trust_score?: number | null;
  final_recommendation?: string | null;
  status: string;
  created_at?: string;
  completed_at?: string | null;
}

const ALL_RELATIONSHIP_TAGS = [
  "가족",
  "지인",
  "잠재고객",
  "기존고객",
  "VIP",
  "거래처·공급사",
  "물류·기사",
  "파트너",
  "채권자",
  "채무자",
  "투자자",
  "전문가",
];

function safeJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function getGradeBadgeClass(grade: string): string {
  switch (grade) {
    case "고위험":
      return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    case "주의":
      return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "안전":
      return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    default:
      return "bg-sky-500/20 text-sky-300 border-sky-500/40";
  }
}

export default function RelationshipCopilotPage() {
  const [profiles, setProfiles] = useState<ContactProfile[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<VerificationRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState<ContactProfile | null>(null);
  const [signals, setSignals] = useState<ContactSignal[]>([]);
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  // 신규 상대방 / 의심 상황 즉시 검증 입력 폼
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContextText, setNewContextText] = useState("");
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  // 자가 체크 응답 상태 (verificationUuid -> { factChecks, selfChecks })
  const [factAnswers, setFactAnswers] = useState<Record<string, "PASS" | "FAIL" | "UNKNOWN">>({});
  const [selfAnswers, setSelfAnswers] = useState<Record<string, string>>({});
  const [latestEvalResult, setLatestEvalResult] = useState<any>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/user/relationship", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles || []);
        setPendingVerifications(data.pendingVerifications || []);
      }
    } catch {
      showToast("관계 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadContactDetail = useCallback(async (contactKey: string) => {
    if (!contactKey) return;
    setSelectedKey(contactKey);
    setLatestEvalResult(null);
    setFactAnswers({});
    setSelfAnswers({});
    try {
      const res = await apiFetch(`/api/user/relationship?contactKey=${encodeURIComponent(contactKey)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success) {
        setSelectedProfile(data.profile || null);
        setSignals(data.signals || []);
        setVerifications(data.verifications || []);
      }
    } catch {
      showToast("상세 프로필 조회 중 오류가 발생했습니다.");
    }
  }, [showToast]);

  useEffect(() => {
    void loadList();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const qPhone = params.get("phone") || params.get("contactKey") || "";
      const qName = params.get("name") || "";
      if (qPhone) {
        void loadContactDetail(qPhone);
        setNewContactPhone(qPhone);
      }
      if (qName) {
        setNewContactName(qName);
      }
    }
  }, [loadList, loadContactDetail]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const labels = safeJson<string[]>(p.multi_labels_json, []);
      if (tagFilter === "주의/고위험") {
        if (p.risk_grade !== "주의" && p.risk_grade !== "고위험") return false;
      } else if (tagFilter !== "전체") {
        if (!labels.includes(tagFilter)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          (p.contact_name || "").toLowerCase().includes(q) ||
          (p.phone_number || "").toLowerCase().includes(q) ||
          labels.some((l) => l.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [profiles, tagFilter, searchQuery]);

  const handleToggleLockTag = async (tag: string) => {
    if (!selectedProfile) return;
    setBusyAction(`lock_${tag}`);
    try {
      const currentLocked = safeJson<string[]>(selectedProfile.locked_labels_json, []);
      const nextLocked = currentLocked.includes(tag)
        ? currentLocked.filter((t) => t !== tag)
        : [...currentLocked, tag];
      const res = await apiFetch("/api/user/relationship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lock_labels",
          contactKey: selectedProfile.contact_key,
          contactName: selectedProfile.contact_name,
          lockedLabels: nextLocked,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedProfile(data.profile);
        void loadList();
        showToast(`🏷️ '${tag}' 태그가 ${currentLocked.includes(tag) ? "잠금 해제" : "확정 잠금"}되었습니다.`);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateVerification = async (
    contactName: string,
    phoneNumber?: string,
    contextText?: string
  ) => {
    if (!contactName.trim()) {
      showToast("상대방 이름을 입력해 주세요.");
      return;
    }
    setBusyAction("generate_verification");
    try {
      const res = await apiFetch("/api/user/relationship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_verification",
          contactName: contactName.trim(),
          phoneNumber: phoneNumber?.trim() || undefined,
          recentContextText: contextText?.trim() || "",
          persist: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.kit) {
        showToast("🛡️ AI 맞춤 상대방 검증 체크리스트와 테스트 질문이 생성되었습니다.");
        setShowQuickCreate(false);
        setNewContextText("");
        await loadList();
        await loadContactDetail(data.kit.contactKey);
      } else {
        showToast(data.error || "검증 체크리스트 생성 실패");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitSelfCheck = async (verificationUuid: string) => {
    setBusyAction("submit_self_check");
    try {
      const res = await apiFetch("/api/user/relationship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_self_check",
          verificationUuid,
          responses: {
            factChecks: factAnswers,
            selfChecks: selfAnswers,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.evaluation) {
        setLatestEvalResult(data.evaluation);
        showToast(
          `🔄 재평가 완료: 위험도 ${data.evaluation.aiInitialRiskScore} → ${data.evaluation.recalculatedRiskScore} (${data.evaluation.riskGrade})`
        );
        await loadList();
        if (selectedKey) await loadContactDetail(selectedKey);
      } else {
        showToast(data.error || "재평가 제출 실패");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncSheet = async () => {
    setBusyAction("sync_sheet");
    try {
      const res = await apiFetch("/api/user/relationship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_sheet" }),
      });
      const data = await res.json();
      if (data.success) {
        setSheetUrl(data.spreadsheetUrl || null);
        showToast(`📊 구글 시트 대장에 ${data.syncedCount}명 프로필이 동기화되었습니다.`);
      } else {
        showToast(data.error || "구글 시트 동기화 실패 (구글 인증을 확인해 주세요)");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const activeVerification = verifications[0] || null;
  const activeFactList = safeJson<FactCheckItem[]>(activeVerification?.fact_checklist_json, []);
  const activeTestQuestions = safeJson<TestQuestionItem[]>(activeVerification?.test_questions_json, []);
  const activeSelfQuestions = safeJson<SelfCheckQuestionItem[]>(
    activeVerification?.self_check_questions_json,
    []
  );

  const highRiskCount = profiles.filter(
    (p) => p.risk_grade === "고위험" || p.risk_grade === "주의"
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              ← 대시보드
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                🧠 시트봇 관계 코파일럿
              </h1>
              <p className="text-xs text-slate-400">
                다중 관계 분류 · 음성 감정 분석 · AI 의심 검증 체크리스트 &amp; 자가 체크 재평가
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowQuickCreate((v) => !v)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              + 새 상대방 의심 검증 생성
            </button>
            <button
              onClick={handleSyncSheet}
              disabled={busyAction === "sync_sheet"}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {busyAction === "sync_sheet" ? "동기화 중..." : "📊 구글 시트 대장 동기화"}
            </button>
            {sheetUrl && (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-sky-300 hover:bg-slate-800"
              >
                시트 열기 ↗
              </a>
            )}
          </div>
        </div>
      </header>

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-sky-500/40 bg-slate-900 px-4 py-3 text-sm font-medium text-sky-100 shadow-2xl">
          {toastMsg}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* KPI 요약 바 */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs text-slate-400">분석된 상대방 프로필</div>
            <div className="mt-1 text-2xl font-bold text-white">{profiles.length}명</div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="text-xs text-amber-300">대기 중인 자가 체크 검증</div>
            <div className="mt-1 text-2xl font-bold text-amber-300">
              {pendingVerifications.length}건
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="text-xs text-rose-300">주의 / 고위험 상대방</div>
            <div className="mt-1 text-2xl font-bold text-rose-300">{highRiskCount}명</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-xs text-emerald-300">재평가 공식</div>
            <div className="mt-1 text-sm font-semibold text-emerald-200">
              AI 40% + 자가 체크 60%
            </div>
          </div>
        </div>

        {/* 신규 상대방 의심 검증 빠른 생성 폼 */}
        {showQuickCreate && (
          <div className="mb-6 rounded-2xl border border-sky-500/40 bg-slate-900 p-5 shadow-xl">
            <h2 className="mb-3 text-sm font-bold text-sky-300">
              🛡️ AI 상대방 의심 검증 체크리스트 &amp; 떠보기 테스트 질문 즉시 생성
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="상대방 이름 또는 직함 (예: 김성호 대표)"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
              />
              <input
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                placeholder="전화번호 (선택, 예: 010-1234-5678)"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
              />
            </div>
            <textarea
              value={newContextText}
              onChange={(e) => setNewContextText(e.target.value)}
              rows={3}
              placeholder="의심되거나 확인하고 싶은 대화 내용·상황을 자유롭게 입력해 주세요. (예: 개인 계좌 선입금 요구, 원금 보장 강조, 약속 반복 지연 등)"
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowQuickCreate(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                취소
              </button>
              <button
                disabled={busyAction === "generate_verification"}
                onClick={() =>
                  handleGenerateVerification(newContactName, newContactPhone, newContextText)
                }
                className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {busyAction === "generate_verification"
                  ? "AI 검증 키트 생성 중..."
                  : "🔍 AI 체크리스트 & 테스트 질문 생성"}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* 좌측: 상대방 목록 */}
          <section className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름, 전화번호, 관계 태그 검색..."
                className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500"
              />

              <div className="mb-4 flex flex-wrap gap-1.5">
                {["전체", "주의/고위험", "가족", "지인", "기존고객", "거래처·공급사", "채무자", "투자자"].map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() => setTagFilter(t)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        tagFilter === t
                          ? "bg-sky-600 text-white"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {t}
                    </button>
                  )
                )}
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">불러오는 중...</div>
              ) : filteredProfiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-sm text-slate-400">
                  아직 분석된 상대방 프로필이 없습니다.
                  <br />
                  통화 녹음이 업로드되거나 상단{" "}
                  <strong className="text-sky-300">+ 새 상대방 의심 검증 생성</strong>을 눌러 시작해 보세요.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredProfiles.map((p) => {
                    const labels = safeJson<string[]>(p.multi_labels_json, []);
                    const isSelected = selectedKey === p.contact_key;
                    return (
                      <button
                        key={p.id}
                        onClick={() => void loadContactDetail(p.contact_key)}
                        className={`w-full rounded-xl border p-3.5 text-left transition ${
                          isSelected
                            ? "border-sky-500 bg-sky-500/10"
                            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-white">{p.contact_name}</div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${getGradeBadgeClass(
                              p.risk_grade
                            )}`}
                          >
                            {p.risk_grade} (위험 {p.final_risk_score})
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {labels.length > 0 ? (
                            labels.map((l) => (
                              <span
                                key={l}
                                className="rounded bg-slate-800 px-1.5 py-0.5 text-[10.5px] text-slate-300"
                              >
                                {l}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-500">미분류</span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            신뢰 {p.final_trust_score} · 우호 {p.favorability} · 관심 {p.interest}
                          </span>
                          <span>추세: {p.trend}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* 우측: 선택된 상대방 상세 & 자가 체크 재평가 패널 */}
          <section className="lg:col-span-7">
            {!selectedProfile && !activeVerification ? (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center">
                <div className="text-3xl">🛡️</div>
                <h3 className="mt-3 text-base font-bold text-white">
                  좌측에서 상대방을 선택하거나 새 의심 검증을 생성하세요
                </h3>
                <p className="mt-1.5 max-w-md text-xs text-slate-400">
                  통화 녹음의 음성 감정, 다중 관계 태그, 8대 수치 지표를 확인하고 AI가 제안한
                  실전 테스트 질문과 자가 체크리스트로 상대방을 즉시 재평가할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* 1. 프로필 요약 & 8대 수치 */}
                {selectedProfile && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-white">
                            {selectedProfile.contact_name}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${getGradeBadgeClass(
                              selectedProfile.risk_grade
                            )}`}
                          >
                            {selectedProfile.risk_grade}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {selectedProfile.phone_number || selectedProfile.contact_key} · 누적 시그널{" "}
                          {selectedProfile.signal_count}건 · 추세 {selectedProfile.trend}
                        </p>
                      </div>

                      <button
                        disabled={busyAction === "generate_verification"}
                        onClick={() =>
                          handleGenerateVerification(
                            selectedProfile.contact_name,
                            selectedProfile.phone_number,
                            selectedProfile.evidence_summary
                          )
                        }
                        className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {busyAction === "generate_verification"
                          ? "생성 중..."
                          : "🛡️ AI 검증 체크리스트 새로 생성"}
                      </button>
                    </div>

                    {/* 8대 수치 그리드 */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {[
                        { label: "최종 신뢰도", val: selectedProfile.final_trust_score, color: "text-emerald-300" },
                        { label: "최종 위험도", val: selectedProfile.final_risk_score, color: "text-rose-300" },
                        { label: "친밀도", val: selectedProfile.closeness, color: "text-sky-300" },
                        { label: "우호도", val: selectedProfile.favorability, color: "text-indigo-300" },
                        { label: "관심도", val: selectedProfile.interest, color: "text-cyan-300" },
                        { label: "기망 위험", val: selectedProfile.fraud_risk, color: "text-amber-300" },
                        { label: "진정성 일치", val: selectedProfile.authenticity_consistency, color: "text-teal-300" },
                        { label: "약속 신뢰도", val: selectedProfile.reliability, color: "text-violet-300" },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                        >
                          <div className="text-[11px] text-slate-400">{m.label}</div>
                          <div className={`mt-0.5 text-lg font-bold ${m.color}`}>{m.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* 다중 태그 수동 확정·잠금(Override Lock) */}
                    <div className="mt-4 border-t border-slate-800 pt-4">
                      <div className="mb-2 text-xs font-semibold text-slate-300">
                        🏷️ 다중 관계 태그 수동 확정·잠금 (터치 시 잠금 토글)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_RELATIONSHIP_TAGS.map((tag) => {
                          const locked = safeJson<string[]>(
                            selectedProfile.locked_labels_json,
                            []
                          ).includes(tag);
                          const active = safeJson<string[]>(
                            selectedProfile.multi_labels_json,
                            []
                          ).includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => void handleToggleLockTag(tag)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                                locked
                                  ? "border-sky-400 bg-sky-500/25 text-sky-200"
                                  : active
                                  ? "border-slate-600 bg-slate-800 text-slate-200"
                                  : "border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {locked ? `🔒 ${tag}` : tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. AI 맞춤 검증 체크리스트 & 이용자 자가 체크 재평가 패널 */}
                {activeVerification && (
                  <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-amber-300">
                        🛡️ AI 상대방 의심 검증 체크리스트 &amp; 자가 체크 재평가
                      </h3>
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                        AI 1차 위험도 {activeVerification.ai_initial_risk_score} / 신뢰도{" "}
                        {activeVerification.ai_initial_trust_score}
                      </span>
                    </div>
                    <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-100">
                      {activeVerification.trigger_reason}
                    </p>

                    {/* ① 팩트 체크리스트 */}
                    <div className="mt-4">
                      <h4 className="mb-2 text-xs font-bold text-slate-200">
                        ① 팩트 체크리스트 (서류 · 실체 · 계좌 확인)
                      </h4>
                      <div className="space-y-2.5">
                        {activeFactList.map((item) => {
                          const cur = factAnswers[item.id] || "UNKNOWN";
                          return (
                            <div
                              key={item.id}
                              className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                            >
                              <div className="text-xs font-semibold text-white">
                                [{item.category}] {item.question}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">
                                {item.whyImportant}
                              </div>
                              <div className="mt-2 flex gap-2">
                                {(["PASS", "FAIL", "UNKNOWN"] as const).map((st) => (
                                  <button
                                    key={st}
                                    onClick={() =>
                                      setFactAnswers((prev) => ({ ...prev, [item.id]: st }))
                                    }
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                      cur === st
                                        ? st === "PASS"
                                          ? "bg-emerald-600 text-white"
                                          : st === "FAIL"
                                          ? "bg-rose-600 text-white"
                                          : "bg-slate-700 text-white"
                                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                  >
                                    {st === "PASS"
                                      ? "✅ 확인 통과"
                                      : st === "FAIL"
                                      ? "❌ 불일치/거부"
                                      : "❓ 미확인"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ② 실전 대화 테스트 질문 (떠보기 스크립트) */}
                    <div className="mt-5">
                      <h4 className="mb-2 text-xs font-bold text-slate-200">
                        ② 실전 대화 테스트 질문 (기분 상하지 않게 본심·신뢰 떠보기)
                      </h4>
                      <div className="space-y-2.5">
                        {activeTestQuestions.map((tq) => (
                          <div
                            key={tq.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-sky-300">
                                검증 대상: {tq.targetSuspicion}
                              </span>
                              <button
                                onClick={() => {
                                  void navigator.clipboard.writeText(tq.script);
                                  showToast("📋 테스트 멘트가 복사되었습니다.");
                                }}
                                className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                              >
                                📋 멘트 복사
                              </button>
                            </div>
                            <div className="mt-1.5 rounded-lg bg-slate-900 p-2.5 text-xs text-white">
                              “{tq.script}”
                            </div>
                            <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                              <div className="rounded bg-emerald-500/10 p-2 text-emerald-200">
                                <strong>✅ 정상 반응:</strong> {tq.goodReaction}
                              </div>
                              <div className="rounded bg-rose-500/10 p-2 text-rose-200">
                                <strong>⚠️ 위험 반응:</strong> {tq.redFlagReaction}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ③ 이용자 관찰 자가 평가 질의 */}
                    <div className="mt-5">
                      <h4 className="mb-2 text-xs font-bold text-slate-200">
                        ③ 테스트·대면 후 이용자 자가 평가 (선택 후 즉시 재평가)
                      </h4>
                      <div className="space-y-3">
                        {activeSelfQuestions.map((sq) => (
                          <div
                            key={sq.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                          >
                            <div className="mb-2 text-xs font-semibold text-white">
                              {sq.question}
                            </div>
                            <div className="space-y-1.5">
                              {sq.options.map((opt) => {
                                const checked = selfAnswers[sq.id] === opt.code;
                                return (
                                  <button
                                    key={opt.code}
                                    onClick={() =>
                                      setSelfAnswers((prev) => ({ ...prev, [sq.id]: opt.code }))
                                    }
                                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                                      checked
                                        ? "border-sky-400 bg-sky-500/20 text-white"
                                        : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                                    }`}
                                  >
                                    <span className="mr-2 font-bold text-sky-300">{opt.code}.</span>
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      disabled={busyAction === "submit_self_check"}
                      onClick={() => void handleSubmitSelfCheck(activeVerification.uuid)}
                      className="mt-5 w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      {busyAction === "submit_self_check"
                        ? "동적 재평가 계산 중..."
                        : "🔄 자가 체크 제출 및 상대방 점수 즉시 재평가"}
                    </button>

                    {/* 재평가 결과 배너 */}
                    {(latestEvalResult || activeVerification.status === "COMPLETED") && (
                      <div className="mt-4 rounded-xl border border-sky-500/40 bg-slate-950 p-4">
                        <div className="text-xs font-bold text-sky-300">
                          📊 자가 체크 반영 최종 재평가 결과
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm font-bold">
                          <span>
                            위험도:{" "}
                            <span className="text-slate-400">
                              {latestEvalResult?.aiInitialRiskScore ??
                                activeVerification.ai_initial_risk_score}
                            </span>{" "}
                            →{" "}
                            <span className="text-rose-300">
                              {latestEvalResult?.recalculatedRiskScore ??
                                activeVerification.recalculated_risk_score}
                            </span>
                          </span>
                          <span>
                            신뢰도:{" "}
                            <span className="text-slate-400">
                              {latestEvalResult?.aiInitialTrustScore ??
                                activeVerification.ai_initial_trust_score}
                            </span>{" "}
                            →{" "}
                            <span className="text-emerald-300">
                              {latestEvalResult?.recalculatedTrustScore ??
                                activeVerification.recalculated_trust_score}
                            </span>
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-200">
                          {latestEvalResult?.finalRecommendation ??
                            activeVerification.final_recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 누적 시그널 히스토리 */}
                {signals.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="mb-3 text-sm font-bold text-white">
                      🎙️ 누적 음성 감정 · 관계 시그널 이력
                    </h3>
                    <div className="space-y-2.5">
                      {signals.map((s) => {
                        const emo = safeJson<any>(s.emotion_json, null);
                        const flags = safeJson<string[]>(s.detected_red_flags_json, []);
                        return (
                          <div
                            key={s.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between text-slate-400">
                              <span className="font-semibold text-sky-300">{s.source_type}</span>
                              <span>{s.occurred_at}</span>
                            </div>
                            {emo?.primaryEmotion && (
                              <div className="mt-1 text-slate-200">
                                🎧 감정: <strong>{emo.primaryEmotion}</strong>
                                {emo.turningPoint ? ` · 전환점: ${emo.turningPoint}` : ""}
                              </div>
                            )}
                            {flags.length > 0 && (
                              <div className="mt-1 text-amber-300">
                                ⚠️ 감지 정황: {flags.join(" / ")}
                              </div>
                            )}
                            {s.evidence_text && (
                              <div className="mt-1 text-slate-400">{s.evidence_text}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
