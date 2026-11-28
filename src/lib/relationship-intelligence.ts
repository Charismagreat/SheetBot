/**
 * 🧠 시트봇 관계 인텔리전스 & 상대방 검증·자가체크 재평가 엔진
 *
 * 1. 다중 라벨(Multi-Label) 관계 분류 + 8대 수치 지표(친밀도·우호도·관심도·경제적가치·리스크·신뢰도·기망위험·진정성)
 * 2. 시간 감쇠(Time Decay) + 채널 신뢰도 가중치 + 베이지안 수축(Bayesian Shrinkage) 집계
 * 3. AI 상대방 의심 포인트(Red Flag) 포착 -> 맞춤 팩트 체크리스트 + 실전 테스트 질문 + 이용자 자가 평가 질의 자동 생성
 * 4. 이용자 자가 체크 응답 기반 동적 재평가(Re-Scoring) 및 행동 권고 산출
 */

import crypto from "crypto";
import {
  callAiCaller,
  callSheetsTool,
  insertRows,
  queryTable,
  updateRows,
} from "@/lib/egdesk-helpers";
import { getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

export type SignalSourceType =
  | "CALL_RECORDING"
  | "EMAIL"
  | "SMS"
  | "KAKAO"
  | "BANK_PUSH"
  | "BUSINESS_CARD"
  | "MANUAL";

export interface EmotionPayload {
  primaryEmotion?: string;
  valence?: number; // -100 ~ +100
  arousal?: number; // 0 ~ 100
  situationalStress?: number; // 0 ~ 100 (상황적 조급함/스트레스)
  interpersonalHostility?: number; // 0 ~ 100 (대인 비우호/공격성)
  acousticCues?: string[];
  emotionFlow?: string;
  turningPoint?: string;
  confidence?: number;
}

export interface ContactSignalInput {
  userEmail: string;
  contactName: string;
  phoneNumber?: string | null;
  sourceType: SignalSourceType;
  sourceRef?: string;
  multiLabels?: string[];
  emotion?: EmotionPayload | null;
  closeness?: number; // 0 ~ 100
  favorability?: number; // -100 ~ +100
  interest?: number; // 0 ~ 100
  riskUrgency?: number; // 0 ~ 100
  fraudRisk?: number; // 0 ~ 100
  authenticityConsistency?: number; // 0 ~ 100
  flatteryDetected?: boolean;
  insincerityDetected?: boolean;
  detectedRedFlags?: string[];
  evidenceText?: string;
  confidence?: number; // 0 ~ 1
  occurredAt?: string;
}

export interface FactCheckItem {
  id: string;
  category: string;
  question: string;
  whyImportant: string;
  passRiskDelta: number; // 통과 시 위험도 변화 (음수 = 위험 감소)
  failRiskDelta: number; // 실패 시 위험도 변화 (양수 = 위험 증가)
}

export interface TestQuestionItem {
  id: string;
  targetSuspicion: string;
  script: string;
  goodReaction: string;
  redFlagReaction: string;
}

export interface SelfCheckOption {
  code: string;
  label: string;
  riskDelta: number; // 위험도 증감
  trustDelta: number; // 신뢰도 증감
}

export interface SelfCheckQuestionItem {
  id: string;
  question: string;
  options: SelfCheckOption[];
}

export interface CounterpartyVerificationKit {
  verificationUuid: string;
  contactKey: string;
  contactName: string;
  triggerReason: string;
  aiInitialRiskScore: number;
  aiInitialTrustScore: number;
  detectedRedFlags: string[];
  factChecklist: FactCheckItem[];
  testQuestions: TestQuestionItem[];
  selfCheckQuestions: SelfCheckQuestionItem[];
  status: "PENDING" | "COMPLETED" | "DISMISSED";
  createdAt: string;
}

export interface VerificationUserResponses {
  factChecks?: Record<string, "PASS" | "FAIL" | "UNKNOWN">;
  selfChecks?: Record<string, string>; // questionId -> option.code
  freeNote?: string;
}

export interface ReEvaluationResult {
  verificationUuid: string;
  contactKey: string;
  contactName: string;
  aiInitialRiskScore: number;
  aiInitialTrustScore: number;
  userSelfCheckRiskScore: number;
  userSelfCheckTrustScore: number;
  recalculatedRiskScore: number;
  recalculatedTrustScore: number;
  riskDelta: number;
  trustDelta: number;
  riskGrade: "안전" | "보통" | "주의" | "고위험";
  finalRecommendation: string;
  summaryPoints: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸리티 & AI Caller 2중 언래핑 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.round(val)));
}

/**
 * AI Caller 응답 메타데이터 2중 언래핑 헬퍼 (절대 준수 원칙)
 */
export function unwrapAiCallerText(res: any): string {
  if (!res) return "";
  let raw =
    typeof res === "string"
      ? res
      : res.content ?? res.text ?? res.result?.content?.[0]?.text ?? "";
  if (typeof raw !== "string") {
    raw = JSON.stringify(raw);
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"content"')) {
    try {
      const inner = JSON.parse(trimmed);
      if (typeof inner?.content === "string") {
        return inner.content.trim();
      }
    } catch {
      // 원문 유지
    }
  }
  return trimmed;
}

export function unwrapAiCallerJson<T = any>(res: any): T | null {
  let text = unwrapAiCallerText(res);
  if (!text) return null;
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function normalizeContactKey(phoneOrName: string): string {
  const raw = String(phoneOrName || "").trim();
  if (!raw) return "unknown";
  const digits = raw.replace(/\D/g, "");
  // 한국 전화번호가 포함되어 있으면 정규화 숫자키 우선 사용
  if (digits.length >= 9 && digits.length <= 12) {
    if (digits.startsWith("82") && digits.length >= 11) {
      return "0" + digits.slice(2);
    }
    return digits;
  }
  return raw.toLowerCase().replace(/\s+/g, "");
}

export function extractPhoneFromContactText(text: string): string | null {
  const m = String(text || "").match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/);
  return m ? m[0].replace(/[^\d-]/g, "") : null;
}

function getChannelReliabilityWeight(sourceType: string): number {
  switch (sourceType) {
    case "CALL_RECORDING":
      return 1.0;
    case "BANK_PUSH":
      return 1.0;
    case "EMAIL":
      return 0.9;
    case "SMS":
    case "KAKAO":
      return 0.85;
    case "BUSINESS_CARD":
      return 0.7;
    case "MANUAL":
      return 1.0;
    default:
      return 0.6;
  }
}

function getTimeDecayWeight(occurredAt?: string | null): number {
  if (!occurredAt) return 1.0;
  const parsedMs = new Date(String(occurredAt).replace(" ", "T")).getTime();
  if (!Number.isFinite(parsedMs)) return 1.0;
  const deltaDays = Math.max(0, (Date.now() - parsedMs) / (1000 * 60 * 60 * 24));
  // 반감기 약 45일 (lambda ≈ 0.0154)
  return Math.exp(-0.0154 * deltaDays);
}

/**
 * 베이지안 수축 보정 (소표본 과신 방지)
 * AdjustedScore = (n * weightedAvg + k * priorMean) / (n + k)
 */
function applyBayesianShrinkage(
  weightedAvg: number,
  sampleCount: number,
  priorMean: number,
  k = 2
): number {
  if (sampleCount <= 0) return priorMean;
  return (sampleCount * weightedAvg + k * priorMean) / (sampleCount + k);
}

export function resolveRiskGrade(
  riskScore: number
): "안전" | "보통" | "주의" | "고위험" {
  if (riskScore >= 75) return "고위험";
  if (riskScore >= 50) return "주의";
  if (riskScore >= 25) return "보통";
  return "안전";
}

function safeParseJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 시그널 적재 & 프로필 동적 재집계
// ─────────────────────────────────────────────────────────────────────────────

export async function ingestContactSignal(input: ContactSignalInput): Promise<{
  signalUuid: string;
  contactKey: string;
  profile: any;
}> {
  const cleanEmail = input.userEmail.toLowerCase().trim();
  const extractedPhone =
    input.phoneNumber || extractPhoneFromContactText(input.contactName);
  const contactKey = normalizeContactKey(extractedPhone || input.contactName);
  const nowStr = getKoreanTimeString();
  const signalUuid = crypto.randomUUID();

  const emotion = input.emotion || null;
  const situationalStress = clamp(emotion?.situationalStress ?? 0, 0, 100);
  const interpersonalHostility = clamp(
    emotion?.interpersonalHostility ?? 0,
    0,
    100
  );

  await insertRows("sheetbot_contact_signals", [
    {
      id: Date.now(),
      uuid: signalUuid,
      user_email: cleanEmail,
      contact_key: contactKey,
      contact_name: input.contactName || contactKey,
      source_type: input.sourceType,
      source_ref: input.sourceRef || "",
      multi_labels_json: JSON.stringify(input.multiLabels || []),
      emotion_json: emotion ? JSON.stringify(emotion) : null,
      closeness: clamp(input.closeness ?? 20, 0, 100),
      favorability: clamp(input.favorability ?? 0, -100, 100),
      interest: clamp(input.interest ?? 40, 0, 100),
      risk_urgency: clamp(input.riskUrgency ?? 15, 0, 100),
      fraud_risk: clamp(input.fraudRisk ?? 0, 0, 100),
      authenticity_consistency: clamp(
        input.authenticityConsistency ?? 75,
        0,
        100
      ),
      situational_stress: situationalStress,
      interpersonal_hostility: interpersonalHostility,
      flattery_detected: input.flatteryDetected ? 1 : 0,
      insincerity_detected: input.insincerityDetected ? 1 : 0,
      detected_red_flags_json: JSON.stringify(input.detectedRedFlags || []),
      evidence_text: (input.evidenceText || "").slice(0, 1000),
      confidence: Number.isFinite(input.confidence) ? input.confidence : 0.75,
      occurred_at: input.occurredAt || nowStr,
      created_at: nowStr,
      updated_at: nowStr,
      updated_by: cleanEmail,
    },
  ]).catch((err: any) => {
    console.warn("[RelationshipIntel] signal insert warning:", err?.message);
  });

  const profile = await recomputeContactProfile(
    cleanEmail,
    contactKey,
    input.contactName,
    extractedPhone || undefined
  );

  return { signalUuid, contactKey, profile };
}

export async function recomputeContactProfile(
  userEmail: string,
  contactKey: string,
  fallbackName?: string,
  fallbackPhone?: string
): Promise<any> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const nowStr = getKoreanTimeString();

  const [signalsRes, existingProfileRes, verificationsRes] = await Promise.all([
    queryTable("sheetbot_contact_signals", {
      filters: { user_email: cleanEmail, contact_key: contactKey },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 50,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_profiles", {
      filters: { user_email: cleanEmail, contact_key: contactKey },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 1,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_verifications", {
      filters: {
        user_email: cleanEmail,
        contact_key: contactKey,
        status: "COMPLETED",
      },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 1,
    }).catch(() => ({ rows: [] })),
  ]);

  const signals = (signalsRes.rows || []).filter((r: any) => !r.deleted_at);
  const existingProfile = (existingProfileRes.rows || []).find(
    (r: any) => !r.deleted_at
  );
  const latestVerification = (verificationsRes.rows || []).find(
    (r: any) => !r.deleted_at
  );

  const lockedLabels = safeParseJson<string[]>(
    existingProfile?.locked_labels_json,
    []
  );
  const labelSet = new Set<string>(lockedLabels);

  let totalWeight = 0;
  let sumCloseness = 0;
  let sumFavorability = 0;
  let sumInterest = 0;
  let sumRiskUrgency = 0;
  let sumFraudRisk = 0;
  let sumAuthenticity = 0;
  let flatteryHits = 0;
  let insincerityHits = 0;
  const redFlagsSet = new Set<string>();
  const evidenceSnippets: string[] = [];

  for (const s of signals) {
    const wTime = getTimeDecayWeight(s.occurred_at || s.created_at);
    const wChannel = getChannelReliabilityWeight(String(s.source_type || ""));
    const wConf = Math.max(0.2, Math.min(1.0, Number(s.confidence ?? 0.75)));
    const w = wTime * wChannel * wConf;
    totalWeight += w;

    // 상황적 스트레스 때문에 억울하게 깎이지 않도록 대인 비우호 중심으로 보정
    sumCloseness += w * Number(s.closeness ?? 20);
    sumFavorability += w * Number(s.favorability ?? 0);
    sumInterest += w * Number(s.interest ?? 40);
    sumRiskUrgency += w * Number(s.risk_urgency ?? 15);
    sumFraudRisk += w * Number(s.fraud_risk ?? 0);
    sumAuthenticity += w * Number(s.authenticity_consistency ?? 75);

    if (Number(s.flattery_detected) === 1) flatteryHits++;
    if (Number(s.insincerity_detected) === 1) insincerityHits++;

    const labels = safeParseJson<string[]>(s.multi_labels_json, []);
    labels.forEach((l) => {
      if (l && String(l).trim()) labelSet.add(String(l).trim());
    });

    const flags = safeParseJson<string[]>(s.detected_red_flags_json, []);
    flags.forEach((f) => {
      if (f && String(f).trim()) redFlagsSet.add(String(f).trim());
    });

    if (s.evidence_text && evidenceSnippets.length < 3) {
      evidenceSnippets.push(String(s.evidence_text).trim());
    }
  }

  const n = signals.length;
  const avgCloseness = totalWeight > 0 ? sumCloseness / totalWeight : 20;
  const avgFavorability = totalWeight > 0 ? sumFavorability / totalWeight : 0;
  const avgInterest = totalWeight > 0 ? sumInterest / totalWeight : 40;
  const avgRiskUrgency = totalWeight > 0 ? sumRiskUrgency / totalWeight : 15;
  const avgFraudRisk = totalWeight > 0 ? sumFraudRisk / totalWeight : 0;
  const avgAuthenticity =
    totalWeight > 0 ? sumAuthenticity / totalWeight : 75;

  // 베이지안 수축 보정 적용
  const closeness = clamp(applyBayesianShrinkage(avgCloseness, n, 25, 2), 0, 100);
  const favorability = clamp(
    applyBayesianShrinkage(avgFavorability, n, 0, 2),
    -100,
    100
  );
  const interest = clamp(applyBayesianShrinkage(avgInterest, n, 40, 2), 0, 100);
  const riskUrgency = clamp(
    applyBayesianShrinkage(avgRiskUrgency, n, 15, 2),
    0,
    100
  );
  const fraudRisk = clamp(
    applyBayesianShrinkage(avgFraudRisk, n, 5, 1.5),
    0,
    100
  );
  const authenticity = clamp(
    applyBayesianShrinkage(avgAuthenticity, n, 75, 2),
    0,
    100
  );

  // 아첨/가식 반복 가중치(3회 이상 누적 또는 고위험 플래그 동반 시 추가 반영)
  const repeatPenalty =
    (flatteryHits >= 2 ? 10 : 0) + (insincerityHits >= 2 ? 12 : 0);

  // AI 1차 종합 위험도 / 신뢰도 산출
  const aiRiskScore = clamp(
    0.55 * fraudRisk + 0.3 * riskUrgency + 0.15 * (100 - authenticity) + repeatPenalty,
    0,
    100
  );
  const favNormalized = (favorability + 100) / 2; // 0 ~ 100
  const aiTrustScore = clamp(
    0.45 * authenticity + 0.3 * favNormalized + 0.25 * (100 - fraudRisk),
    0,
    100
  );

  // 이용자 자가 체크 완료 이력이 있다면 최신 재평가 점수 반영
  const finalRiskScore =
    latestVerification && Number.isFinite(Number(latestVerification.recalculated_risk_score))
      ? clamp(Number(latestVerification.recalculated_risk_score), 0, 100)
      : aiRiskScore;
  const finalTrustScore =
    latestVerification && Number.isFinite(Number(latestVerification.recalculated_trust_score))
      ? clamp(Number(latestVerification.recalculated_trust_score), 0, 100)
      : aiTrustScore;

  const riskGrade = resolveRiskGrade(finalRiskScore);

  // 최근 추세 계산 (최신 시그널 vs 이전 시그널 우호도 비교)
  let trend = "유지";
  if (signals.length >= 2) {
    const latestFav = Number(signals[0].favorability ?? 0);
    const prevFav = Number(signals[1].favorability ?? 0);
    if (latestFav - prevFav >= 15) trend = "상승";
    else if (latestFav - prevFav <= -15) trend = "냉각";
  }

  const latestEmotionJson = signals[0]?.emotion_json || null;
  const evidenceSummary = [
    ...Array.from(redFlagsSet).slice(0, 3).map((f) => `⚠️ ${f}`),
    ...evidenceSnippets.slice(0, 2),
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1000);

  const profilePayload = {
    user_email: cleanEmail,
    contact_key: contactKey,
    contact_name:
      fallbackName || existingProfile?.contact_name || signals[0]?.contact_name || contactKey,
    phone_number:
      fallbackPhone ||
      existingProfile?.phone_number ||
      extractPhoneFromContactText(fallbackName || "") ||
      "",
    multi_labels_json: JSON.stringify(Array.from(labelSet)),
    locked_labels_json: JSON.stringify(lockedLabels),
    closeness,
    favorability,
    interest,
    economic_value: clamp(Number(existingProfile?.economic_value ?? 40), 0, 100),
    risk_urgency: riskUrgency,
    reliability: clamp(100 - Math.round(finalRiskScore * 0.8), 0, 100),
    fraud_risk: fraudRisk,
    authenticity_consistency: authenticity,
    final_trust_score: finalTrustScore,
    final_risk_score: finalRiskScore,
    risk_grade: riskGrade,
    trend,
    signal_count: n,
    last_emotion_json: latestEmotionJson,
    evidence_summary: evidenceSummary,
    last_interaction_at: signals[0]?.occurred_at || nowStr,
    updated_at: nowStr,
    updated_by: cleanEmail,
  };

  if (existingProfile?.id) {
    await updateRows("sheetbot_contact_profiles", profilePayload, {
      ids: [Number(existingProfile.id)],
    }).catch((err: any) =>
      console.warn("[RelationshipIntel] profile update warning:", err?.message)
    );
    return { ...existingProfile, ...profilePayload };
  } else {
    const newId = Date.now();
    const newUuid = crypto.randomUUID();
    await insertRows("sheetbot_contact_profiles", [
      {
        id: newId,
        uuid: newUuid,
        ...profilePayload,
        created_at: nowStr,
      },
    ]).catch((err: any) =>
      console.warn("[RelationshipIntel] profile insert warning:", err?.message)
    );
    return { id: newId, uuid: newUuid, ...profilePayload, created_at: nowStr };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AI 상대방 의심 포인트 포착 + 맞춤 검증 키트(체크리스트 · 테스트 질문 · 자가평가) 생성
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCounterpartyVerificationKit(params: {
  userEmail: string;
  contactName: string;
  phoneNumber?: string | null;
  recentContextText?: string; // 최근 통화/문자/상황 메모 (선택)
  persist?: boolean;
}): Promise<CounterpartyVerificationKit> {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const extractedPhone =
    params.phoneNumber || extractPhoneFromContactText(params.contactName);
  const contactKey = normalizeContactKey(extractedPhone || params.contactName);
  const nowStr = getKoreanTimeString();
  const verificationUuid = crypto.randomUUID();

  // 기존 DB 프로필 및 최근 시그널 조회
  const [profileRes, signalsRes] = await Promise.all([
    queryTable("sheetbot_contact_profiles", {
      filters: { user_email: cleanEmail, contact_key: contactKey },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 1,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_signals", {
      filters: { user_email: cleanEmail, contact_key: contactKey },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 10,
    }).catch(() => ({ rows: [] })),
  ]);

  const profile = (profileRes.rows || []).find((r: any) => !r.deleted_at);
  const signals = (signalsRes.rows || []).filter((r: any) => !r.deleted_at);

  const accumulatedFlags = new Set<string>();
  const signalSummaries = signals.map((s: any, idx: number) => {
    const flags = safeParseJson<string[]>(s.detected_red_flags_json, []);
    flags.forEach((f) => accumulatedFlags.add(f));
    return `[${idx + 1}] (${s.source_type}, ${s.occurred_at || s.created_at}) 태그:${s.multi_labels_json} / 우호:${s.favorability} / 기망위험:${s.fraud_risk} / 근거:${s.evidence_text || "-"}`;
  });

  const prompt = `당신은 비즈니스·대인 리스크 검증 코파일럿 AI입니다.
이용자의 상대방("${params.contactName}")에 대해 의심해 보아야 할 부분(Red Flag)을 분석하고, 이용자가 직접 확인하고 테스트해 볼 수 있는 **맞춤형 검증 체크리스트 + 실전 대화 테스트 질문(떠보기 스크립트) + 이용자 관찰 자가 평가 질의**를 JSON으로만 생성하세요.

[누적 시그널 데이터]
${signalSummaries.length > 0 ? signalSummaries.join("\n") : "(누적 시그널 없음 - 아래 최근 맥락 기준으로 분석)"}

[최근 대화/상황 맥락]
${params.recentContextText || "(별도 맥락 없음)"}

[필수 출력 JSON 스키마 - 순수 JSON만 반환]
{
  "triggerReason": "이 상대방에 대해 검증이 필요한 핵심 이유 1~2문장",
  "aiInitialRiskScore": 0,
  "aiInitialTrustScore": 0,
  "detectedRedFlags": ["구체적 의심 포인트 1", "구체적 의심 포인트 2"],
  "factChecklist": [
    {
      "id": "fact_1",
      "category": "재무/실체/서류/평판 중 하나",
      "question": "이용자가 직접 확인할 팩트 체크 질문",
      "whyImportant": "왜 확인해야 하는지 1줄 설명",
      "passRiskDelta": -15,
      "failRiskDelta": 20
    }
  ],
  "testQuestions": [
    {
      "id": "test_1",
      "targetSuspicion": "긴급성 압박 / 립서비스 / 실체 과장 / 이행 의지 등",
      "script": "상대방 기분을 상하게 하지 않으면서 본심·신뢰도를 떠볼 수 있는 자연스러운 실제 멘트",
      "goodReaction": "신뢰할 수 있는 상대방의 정상 반응",
      "redFlagReaction": "의심·주의해야 할 상대방의 위험 반응"
    }
  ],
  "selfCheckQuestions": [
    {
      "id": "self_1",
      "question": "이용자가 테스트나 대면 후 직접 평가할 객관식 질문",
      "options": [
        { "code": "A", "label": "긍정/투명 반응 선택지", "riskDelta": -20, "trustDelta": 20 },
        { "code": "B", "label": "모호/회피 반응 선택지", "riskDelta": 15, "trustDelta": -15 },
        { "code": "C", "label": "방어/압박/불일치 위험 선택지", "riskDelta": 30, "trustDelta": -30 }
      ]
    }
  ]
}

규칙:
- 절대 상대방을 '사기꾼', '거짓말쟁이'로 단정하지 말고, 검증이 필요한 객관적 정황과 확인 방법 중심으로 작성하세요.
- factChecklist는 3개, testQuestions는 3개, selfCheckQuestions는 3개를 정확히 생성하세요.
- aiInitialRiskScore(0~100), aiInitialTrustScore(0~100)를 맥락에 맞게 현실적으로 산정하세요.`;

  let aiParsed: any = null;
  try {
    const aiRes = await callAiCaller(prompt, {
      caller: "sheetbot-counterparty-verification",
      model: "gemini-2.5-flash",
      temperature: 0.2,
    });
    aiParsed = unwrapAiCallerJson(aiRes);
  } catch (err: any) {
    console.warn("[RelationshipIntel] AI verification kit fallback:", err?.message);
  }

  // 안전한 폴백 기본 검증 키트
  const fallbackKit = {
    triggerReason:
      "최근 소통 맥락에서 거래 조건·약속 이행·실체 확인이 필요한 정황이 감지되어 사전 검증을 권장합니다.",
    aiInitialRiskScore: clamp(Number(profile?.final_risk_score ?? 55), 0, 100),
    aiInitialTrustScore: clamp(Number(profile?.final_trust_score ?? 45), 0, 100),
    detectedRedFlags:
      Array.from(accumulatedFlags).length > 0
        ? Array.from(accumulatedFlags)
        : ["구체적 증빙·서류 확인 필요"],
    factChecklist: [
      {
        id: "fact_1",
        category: "재무",
        question: "사업자등록증의 대표자/법인명과 입금 계좌 예금주가 일치하는가?",
        whyImportant: "타인·개인 명의 계좌 요구는 가장 빈번한 거래 사고 신호입니다.",
        passRiskDelta: -15,
        failRiskDelta: 25,
      },
      {
        id: "fact_2",
        category: "서류",
        question: "구두 약속이 아닌 정식 계약서·견적서 초안을 서면으로 먼저 받을 수 있는가?",
        whyImportant: "기록 남기기를 꺼리는 경우 추후 분쟁 시 입증이 어렵습니다.",
        passRiskDelta: -15,
        failRiskDelta: 20,
      },
      {
        id: "fact_3",
        category: "실체",
        question: "국세청 사업자 상태(계속사업자) 및 실제 사무실/유선 연락처가 확인되는가?",
        whyImportant: "휴폐업 또는 실체 불명 업체를 사전에 차단할 수 있습니다.",
        passRiskDelta: -10,
        failRiskDelta: 25,
      },
    ] as FactCheckItem[],
    testQuestions: [
      {
        id: "test_1",
        targetSuspicion: "긴급성 압박 검증",
        script:
          "제안 감사합니다. 내부 검토(세무사 확인) 절차가 있어 이틀 정도만 검토 후 말씀드려도 될까요?",
        goodReaction: "충분히 검토하시라며 자료를 추가로 보내주고 여유 있게 기다림",
        redFlagReaction:
          "오늘 결정 안 하면 끝이라며 강하게 재압박하거나 외부 상담을 막음",
      },
      {
        id: "test_2",
        targetSuspicion: "립서비스·진정성 검증",
        script:
          "좋습니다! 그럼 다음 주 화요일 오후 2시에 계약서 초안과 함께 30분만 뵐까요?",
        goodReaction: "구체적인 일정 확정 또는 명확한 대안 일시 제안",
        redFlagReaction: "추후 연락하겠다며 구체 일정·서류 확정을 반복 회피",
      },
      {
        id: "test_3",
        targetSuspicion: "실체·이행 의지 검증",
        script:
          "비슷하게 진행하신 기존 레퍼런스나 공식 제안서 한 부만 먼저 공유해 주실 수 있을까요?",
        goodReaction: "실제 사례나 검증 가능한 공식 문서를 투명하게 제공",
        redFlagReaction: "비밀유지 등을 핑계로 근거 자료 제공을 전면 회피",
      },
    ] as TestQuestionItem[],
    selfCheckQuestions: [
      {
        id: "self_1",
        question: "검토 기간이나 서류·근거 자료를 요청했을 때 상대방의 태도는 어땠나요?",
        options: [
          { code: "A", label: "흔쾌히 수용하고 투명하게 자료 제공", riskDelta: -20, trustDelta: 20 },
          { code: "B", label: "얼버무리거나 화제를 돌림", riskDelta: 15, trustDelta: -15 },
          { code: "C", label: "불쾌해하며 즉시 결정/입금을 재압박", riskDelta: 30, trustDelta: -30 },
        ],
      },
      {
        id: "self_2",
        question: "소규모 약속(자료 전달, 미팅 시간, 소액 이행)을 기한 내 지켰나요?",
        options: [
          { code: "A", label: "기한 내 정확히 이행함", riskDelta: -15, trustDelta: 20 },
          { code: "B", label: "지연되었으나 사유 설명 후 이행", riskDelta: 5, trustDelta: -5 },
          { code: "C", label: "미이행 또는 핑계 반복", riskDelta: 25, trustDelta: -25 },
        ],
      },
      {
        id: "self_3",
        question: "주변 지인·업계 평판 또는 대면 인상에서 특이사항이 있었나요?",
        options: [
          { code: "A", label: "긍정적 평판 확인 / 일관된 태도", riskDelta: -15, trustDelta: 20 },
          { code: "B", label: "확인 불가 / 판단 보류", riskDelta: 0, trustDelta: 0 },
          { code: "C", label: "금전·신뢰 트러블 소문 또는 말 바뀜 감지", riskDelta: 30, trustDelta: -30 },
        ],
      },
    ] as SelfCheckQuestionItem[],
  };

  const kit: CounterpartyVerificationKit = {
    verificationUuid,
    contactKey,
    contactName: params.contactName,
    triggerReason: aiParsed?.triggerReason || fallbackKit.triggerReason,
    aiInitialRiskScore: clamp(
      Number(aiParsed?.aiInitialRiskScore ?? fallbackKit.aiInitialRiskScore),
      0,
      100
    ),
    aiInitialTrustScore: clamp(
      Number(aiParsed?.aiInitialTrustScore ?? fallbackKit.aiInitialTrustScore),
      0,
      100
    ),
    detectedRedFlags:
      Array.isArray(aiParsed?.detectedRedFlags) && aiParsed.detectedRedFlags.length > 0
        ? aiParsed.detectedRedFlags.map(String)
        : fallbackKit.detectedRedFlags,
    factChecklist:
      Array.isArray(aiParsed?.factChecklist) && aiParsed.factChecklist.length > 0
        ? aiParsed.factChecklist
        : fallbackKit.factChecklist,
    testQuestions:
      Array.isArray(aiParsed?.testQuestions) && aiParsed.testQuestions.length > 0
        ? aiParsed.testQuestions
        : fallbackKit.testQuestions,
    selfCheckQuestions:
      Array.isArray(aiParsed?.selfCheckQuestions) && aiParsed.selfCheckQuestions.length > 0
        ? aiParsed.selfCheckQuestions
        : fallbackKit.selfCheckQuestions,
    status: "PENDING",
    createdAt: nowStr,
  };

  if (params.persist !== false) {
    await insertRows("sheetbot_contact_verifications", [
      {
        id: Date.now(),
        uuid: verificationUuid,
        user_email: cleanEmail,
        contact_key: contactKey,
        contact_name: params.contactName,
        trigger_reason: kit.triggerReason,
        ai_initial_risk_score: kit.aiInitialRiskScore,
        ai_initial_trust_score: kit.aiInitialTrustScore,
        fact_checklist_json: JSON.stringify(kit.factChecklist),
        test_questions_json: JSON.stringify(kit.testQuestions),
        self_check_questions_json: JSON.stringify(kit.selfCheckQuestions),
        user_responses_json: null,
        recalculated_risk_score: null,
        recalculated_trust_score: null,
        final_recommendation: null,
        status: "PENDING",
        completed_at: null,
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: cleanEmail,
      },
    ]).catch((err: any) =>
      console.warn("[RelationshipIntel] verification insert warning:", err?.message)
    );
  }

  return kit;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 이용자 자가 체크 응답 기반 동적 재평가 (Re-Scoring)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 순수 계산 함수 (DB 없이 단위/시뮬레이션 테스트 가능)
 */
export function evaluateSelfCheckResponses(
  kit: CounterpartyVerificationKit,
  responses: VerificationUserResponses,
  alpha = 0.4 // AI 1차 평가 40% + 이용자 실측 자가 체크 60%
): ReEvaluationResult {
  let userRiskScore = kit.aiInitialRiskScore;
  let userTrustScore = kit.aiInitialTrustScore;
  const summaryPoints: string[] = [];

  // 1. 팩트 체크리스트 반영
  const factChecks = responses.factChecks || {};
  for (const item of kit.factChecklist) {
    const ans = factChecks[item.id];
    if (ans === "PASS") {
      const delta = Number(item.passRiskDelta ?? -15);
      userRiskScore += delta;
      userTrustScore += Math.abs(delta);
      summaryPoints.push(`✅ [팩트 통과] ${item.question}`);
    } else if (ans === "FAIL") {
      const delta = Number(item.failRiskDelta ?? 20);
      userRiskScore += delta;
      userTrustScore -= Math.abs(delta);
      summaryPoints.push(`❌ [팩트 불일치] ${item.question}`);
    }
  }

  // 2. 이용자 관찰·테스트 자가 평가 질의 반영
  const selfChecks = responses.selfChecks || {};
  for (const q of kit.selfCheckQuestions) {
    const selectedCode = selfChecks[q.id];
    if (!selectedCode) continue;
    const opt = q.options.find((o) => o.code === selectedCode);
    if (!opt) continue;
    userRiskScore += Number(opt.riskDelta ?? 0);
    userTrustScore += Number(opt.trustDelta ?? 0);
    summaryPoints.push(`📝 [자가 체크] ${q.question} → "${opt.label}"`);
  }

  const clampedUserRisk = clamp(userRiskScore, 0, 100);
  const clampedUserTrust = clamp(userTrustScore, 0, 100);

  // 가중 결합 재평가 공식: 최종 = α * AI 1차 + (1 - α) * 이용자 자가체크 실측
  const recalculatedRiskScore = clamp(
    alpha * kit.aiInitialRiskScore + (1 - alpha) * clampedUserRisk,
    0,
    100
  );
  const recalculatedTrustScore = clamp(
    alpha * kit.aiInitialTrustScore + (1 - alpha) * clampedUserTrust,
    0,
    100
  );

  const riskGrade = resolveRiskGrade(recalculatedRiskScore);
  let finalRecommendation = "일반적인 절차에 따라 정상 진행하셔도 좋습니다.";
  if (riskGrade === "고위험") {
    finalRecommendation =
      "⛔ 고위험 판정: 선입금·보증·단독 계약을 즉시 보류하고, 서면 증빙 및 전문가(세무/법무) 교차 검증 없이는 거래를 진행하지 마세요.";
  } else if (riskGrade === "주의") {
    finalRecommendation =
      "⚠️ 주의 판정: 핵심 조건은 반드시 서면 계약서로 남기고, 소액·단계별 이행 확인 후 본 거래를 진행하는 것을 권장합니다.";
  } else if (riskGrade === "보통") {
    finalRecommendation =
      "🟡 보통 판정: 특이 위험은 낮아졌으나, 표준 계약서 및 입금 확인 절차를 유지하세요.";
  } else {
    finalRecommendation =
      "✅ 안전 판정: 초기 의심 포인트가 자가 검증을 통해 해소되었습니다. 신뢰 기반으로 정상 협업을 진행하셔도 좋습니다.";
  }

  return {
    verificationUuid: kit.verificationUuid,
    contactKey: kit.contactKey,
    contactName: kit.contactName,
    aiInitialRiskScore: kit.aiInitialRiskScore,
    aiInitialTrustScore: kit.aiInitialTrustScore,
    userSelfCheckRiskScore: clampedUserRisk,
    userSelfCheckTrustScore: clampedUserTrust,
    recalculatedRiskScore,
    recalculatedTrustScore,
    riskDelta: recalculatedRiskScore - kit.aiInitialRiskScore,
    trustDelta: recalculatedTrustScore - kit.aiInitialTrustScore,
    riskGrade,
    finalRecommendation,
    summaryPoints,
  };
}

export async function submitVerificationSelfCheck(params: {
  userEmail: string;
  verificationUuid: string;
  responses: VerificationUserResponses;
}): Promise<ReEvaluationResult> {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const nowStr = getKoreanTimeString();

  const res = await queryTable("sheetbot_contact_verifications", {
    filters: { user_email: cleanEmail, uuid: params.verificationUuid },
    limit: 1,
  });
  const row = (res.rows || []).find((r: any) => !r.deleted_at);
  if (!row) {
    throw new Error("해당 검증 체크리스트를 찾을 수 없습니다.");
  }

  const kit: CounterpartyVerificationKit = {
    verificationUuid: String(row.uuid),
    contactKey: String(row.contact_key),
    contactName: String(row.contact_name),
    triggerReason: String(row.trigger_reason || ""),
    aiInitialRiskScore: Number(row.ai_initial_risk_score ?? 50),
    aiInitialTrustScore: Number(row.ai_initial_trust_score ?? 50),
    detectedRedFlags: [],
    factChecklist: safeParseJson<FactCheckItem[]>(row.fact_checklist_json, []),
    testQuestions: safeParseJson<TestQuestionItem[]>(row.test_questions_json, []),
    selfCheckQuestions: safeParseJson<SelfCheckQuestionItem[]>(
      row.self_check_questions_json,
      []
    ),
    status: "COMPLETED",
    createdAt: String(row.created_at || nowStr),
  };

  const result = evaluateSelfCheckResponses(kit, params.responses);

  await updateRows(
    "sheetbot_contact_verifications",
    {
      user_responses_json: JSON.stringify(params.responses),
      recalculated_risk_score: result.recalculatedRiskScore,
      recalculated_trust_score: result.recalculatedTrustScore,
      final_recommendation: result.finalRecommendation,
      status: "COMPLETED",
      completed_at: nowStr,
      updated_at: nowStr,
      updated_by: cleanEmail,
    },
    { ids: [Number(row.id)] }
  );

  // 프로필에도 재평가 점수 즉시 동기화
  await recomputeContactProfile(cleanEmail, kit.contactKey, kit.contactName);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 주소록 메타데이터(그룹/관계/직함/이름 키워드/명함OCR) 기반 초고속 1차 관계 분류
// ─────────────────────────────────────────────────────────────────────────────

export interface ContactMetadataSeed {
  name: string;
  mobile?: string;
  company?: string;
  title?: string;
  note?: string;
  groups?: string[];
  relation?: string;
}

export function inferContactLabelsFromMetadata(contact: ContactMetadataSeed): {
  labels: string[];
  evidence: string;
} {
  const labels = new Set<string>();
  const reasons: string[] = [];

  const name = String(contact.name || "").trim();
  const company = String(contact.company || "").trim();
  const title = String(contact.title || "").trim();
  const note = String(contact.note || "").trim();
  const relation = String(contact.relation || "").trim();
  const groups = (contact.groups || []).map((g) => String(g || "").trim()).filter(Boolean);
  const groupStr = groups.join(" ");

  const familyRegex = /(엄마|아빠|어머니|아버지|부모|와이프|아내|남편|신랑|형님?$|누나|언니|오빠|동생|아들|딸|장모|장인|처형|처제|매형|시어머니|시아버지|가족|집사람|큰집|작은집)/;
  const friendRegex = /(친구|동창|모임|동호회|지인|선배|후배|동기)/;
  const bizTitleRegex = /(대표|사장|이사|상무|전무|부사장|회장|팀장|부장|차장|과장|대리|실장|원장|소장|본부장|지점장|매니저|담당|기사)/;
  const expertRegex = /(세무사|회계사|변호사|노무사|법무사|변리사|의사|원장|교수)/;

  if (relation) {
    if (/(배우자|부모|어머니|아버지|형제|자매|자녀|친척|가족|spouse|parent|mother|father|brother|sister|child|relative)/i.test(relation)) {
      labels.add("가족");
      reasons.push(`주소록 관계필드(${relation})`);
    } else if (/(친구|friend)/i.test(relation)) {
      labels.add("지인");
      reasons.push(`주소록 관계필드(${relation})`);
    } else if (/(동료|상사|매니저|파트너|manager|assistant|partner)/i.test(relation)) {
      labels.add("파트너");
      reasons.push(`주소록 관계필드(${relation})`);
    }
  }

  if (groupStr) {
    if (/가족|친척|집안/.test(groupStr)) {
      labels.add("가족");
      reasons.push(`주소록 그룹(${groupStr})`);
    }
    if (/친구|지인|동창|모임/.test(groupStr)) {
      labels.add("지인");
      reasons.push(`주소록 그룹(${groupStr})`);
    }
    if (/고객|VIP|리드|상담/.test(groupStr)) {
      labels.add("기존고객");
      reasons.push(`주소록 그룹(${groupStr})`);
    }
    if (/거래처|업체|공급|협력|파트너/.test(groupStr)) {
      labels.add("거래처·공급사");
      reasons.push(`주소록 그룹(${groupStr})`);
    }
    if (/투자|IR|VC|엔젤/.test(groupStr)) {
      labels.add("투자자");
      reasons.push(`주소록 그룹(${groupStr})`);
    }
  }

  if (familyRegex.test(name)) {
    labels.add("가족");
    reasons.push("이름 호칭(가족)");
  }
  if (friendRegex.test(name) || friendRegex.test(note)) {
    labels.add("지인");
    reasons.push("이름/메모(지인)");
  }
  if (note.includes("SheetBot 스마트 명함 대장 등록") || note.includes("명함")) {
    labels.add("기존고객");
    reasons.push("명함 OCR 등록 출처");
  }
  if (company || bizTitleRegex.test(name) || bizTitleRegex.test(title)) {
    if (!labels.has("가족")) {
      labels.add(company && /물류|운송|화물/.test(`${name} ${company}`) ? "물류·기사" : "거래처·공급사");
      reasons.push(`회사/직함(${[company, title].filter(Boolean).join(" ") || name})`);
    }
  }
  if (expertRegex.test(`${name} ${title} ${company}`)) {
    labels.add("전문가");
    reasons.push("전문직 호칭");
  }

  return {
    labels: Array.from(labels),
    evidence: reasons.join(", ") || "주소록 기본 동기화",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 구글 시트 [SheetBot] 관계 인텔리전스 대장 자동 동기화
// ─────────────────────────────────────────────────────────────────────────────

export async function syncRelationshipLedgerToSheet(userEmail: string): Promise<{
  success: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  syncedCount: number;
}> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail).catch(() => ({}));

  const resolved = await resolveUserSpreadsheet({
    userEmail: cleanEmail,
    sheetType: "RELATIONSHIP_COPILOT",
    defaultTitle: "[SheetBot] 관계 인텔리전스 대장",
    preferOAuth: true,
    callOptions,
  });

  const profilesRes = await queryTable("sheetbot_contact_profiles", {
    filters: { user_email: cleanEmail },
    orderBy: "id",
    orderDirection: "DESC",
    limit: 200,
  }).catch(() => ({ rows: [] }));

  const profiles = (profilesRes.rows || []).filter((r: any) => !r.deleted_at);

  const headers = [
    "상대방명",
    "전화번호",
    "다중 관계 태그",
    "위험 등급",
    "최종 신뢰도",
    "최종 위험도",
    "친밀도",
    "우호도",
    "관심도",
    "기망위험",
    "진정성",
    "추세",
    "최근 음성 감정",
    "근거 및 요약",
    "최종 갱신일시",
  ];

  const rows = profiles.map((p: any) => {
    const labels = safeParseJson<string[]>(p.multi_labels_json, []).join(", ") || "미분류";
    const emo = safeParseJson<any>(p.last_emotion_json, null);
    const emoText = emo?.primaryEmotion
      ? `${emo.primaryEmotion} (밸런스 ${emo.valence ?? 0})`
      : "-";
    return [
      String(p.contact_name || p.contact_key || ""),
      p.phone_number ? `'${String(p.phone_number)}` : "-",
      labels,
      String(p.risk_grade || "보통"),
      Number(p.final_trust_score ?? 50),
      Number(p.final_risk_score ?? 20),
      Number(p.closeness ?? 20),
      Number(p.favorability ?? 0),
      Number(p.interest ?? 40),
      Number(p.fraud_risk ?? 0),
      Number(p.authenticity_consistency ?? 75),
      String(p.trend || "유지"),
      emoText,
      String(p.evidence_summary || "-"),
      String(p.updated_at || p.created_at || ""),
    ];
  });

  const values = [headers, ...rows];
  await callSheetsTool(
    "sheets_update_range",
    {
      spreadsheetId: resolved.spreadsheetId,
      range: `시트1!A1:O${Math.max(2, values.length)}`,
      values,
      preferOAuth: true,
    },
    callOptions
  );

  return {
    success: true,
    spreadsheetId: resolved.spreadsheetId,
    spreadsheetUrl: resolved.spreadsheetUrl,
    syncedCount: profiles.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 언론·공공 공표·공식 SNS 공개 평판 스캔 + 동명이인 1초 확인 후 평가 반영
// ─────────────────────────────────────────────────────────────────────────────

export type ReputationCategory =
  | "범죄·형사·행정제재"
  | "스캔들·분쟁·논란"
  | "선행·기부·사회공헌"
  | "업적·수상·공적"
  | "공식SNS·활동";

export interface PublicReputationItem {
  id: string;
  category: ReputationCategory;
  polarity: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  sourceTier: "TIER_1" | "TIER_2" | "TIER_3";
  sourceName: string;
  publishedAt: string;
  sourceUrl: string;
  summary: string;
  identityMatchConfidence: number; // 0 ~ 1
  correctionOrAcquittalNote?: string;
  scoreImpact: number; // 긍정 +, 부정 - (Tier 3는 자동 감점 금지 -> 0)
}

export interface PublicReputationScanResult {
  contactKey: string;
  contactName: string;
  affiliation: string;
  identityWarning: string | null;
  overallPublicReputationScore: number; // -100 ~ +100 (참고용 프리뷰)
  items: PublicReputationItem[];
  scannedAt: string;
}

export async function scanPublicReputation(params: {
  contactName: string;
  phoneNumber?: string | null;
  affiliation?: string; // 회사명·직함·지역 등 (동명이인 차단용)
}): Promise<PublicReputationScanResult> {
  const contactName = String(params.contactName || "").trim();
  const affiliation = String(params.affiliation || "").trim();
  const contactKey = normalizeContactKey(params.phoneNumber || contactName);
  const nowStr = getKoreanTimeString();

  const identityWarning = !affiliation
    ? "소속(회사명·직함·지역) 정보가 없어 동명이인 오매칭 위험이 높습니다. 발견 항목은 반드시 본인 여부를 확인한 뒤 반영하세요."
    : null;

  const prompt = `당신은 공개 출처(OSINT) 기반 인물·기업 공개 평판 리서치 AI입니다.
아래 대상에 대해 **누구나 열람 가능한 공개 언론 보도, 정부·공공기관 공식 공표(공정위·금감원·법원 보도·정부 포상·SMPP), 공식 SNS 활동** 중 확인되는 사실만 객관적으로 조사하여 순수 JSON으로 반환하세요.

[조사 대상]
- 성명: ${contactName}
- 소속/직함/지역(동명이인 구분 식별자): ${affiliation || "(미지정 - 동명이인 주의)"}

[필수 출력 JSON 스키마]
{
  "overallPublicReputationScore": 0,
  "items": [
    {
      "id": "rep_1",
      "category": "범죄·형사·행정제재 | 스캔들·분쟁·논란 | 선행·기부·사회공헌 | 업적·수상·공적 | 공식SNS·활동",
      "polarity": "POSITIVE | NEGATIVE | NEUTRAL",
      "sourceTier": "TIER_1 | TIER_2 | TIER_3",
      "sourceName": "매체명 또는 공공기관명",
      "publishedAt": "YYYY-MM-DD 또는 연도",
      "sourceUrl": "확인된 공개 URL (확실하지 않으면 빈 문자열)",
      "summary": "객관적 사실 요약 1~2문장 (단정적 낙인 표현 금지)",
      "identityMatchConfidence": 0.5,
      "correctionOrAcquittalNote": "정정보도/무혐의/진행중 여부 (없으면 빈 문자열)",
      "scoreImpact": 0
    }
  ]
}

절대 준수 원칙:
1. 확인되지 않은 사실이나 가짜 URL을 절대 지어내지 마세요. 공개된 특이 이력이 없다면 items를 빈 배열([])로 반환하세요.
2. TIER_1 = 정부/법원/공공기관 공식 공표·포상(가중치 1.0), TIER_2 = 공신력 있는 등록 언론사 보도(0.8), TIER_3 = 개인 블로그/커뮤니티/SNS(참고 전용, scoreImpact는 반드시 0).
3. 소속 정보가 일치하지 않거나 불확실하면 identityMatchConfidence를 0.5 이하로 보수적 표기하세요.
4. '사기꾼', '범죄자' 같은 단정적 낙인 대신 '언론 보도됨', '공표됨', '수상함' 등 객관적 표현만 사용하세요.`;

  let aiParsed: any = null;
  try {
    const aiRes = await callAiCaller(prompt, {
      caller: "sheetbot-public-reputation-scan",
      model: "gemini-2.5-flash",
      temperature: 0.1,
      tools: [{ googleSearch: {} }],
    } as any);
    aiParsed = unwrapAiCallerJson(aiRes);
  } catch (err: any) {
    // Search tool 미지원 환경 폴백
    try {
      const fallbackRes = await callAiCaller(prompt, {
        caller: "sheetbot-public-reputation-scan",
        model: "gemini-2.5-flash",
        temperature: 0.1,
      });
      aiParsed = unwrapAiCallerJson(fallbackRes);
    } catch (err2: any) {
      console.warn("[RelationshipIntel] Public reputation scan warning:", err2?.message || err?.message);
    }
  }

  const rawItems: any[] = Array.isArray(aiParsed?.items) ? aiParsed.items : [];
  const items: PublicReputationItem[] = rawItems.slice(0, 8).map((it: any, idx: number) => {
    const tier =
      it.sourceTier === "TIER_1" || it.sourceTier === "TIER_2" || it.sourceTier === "TIER_3"
        ? it.sourceTier
        : "TIER_3";
    const polarity =
      it.polarity === "POSITIVE" || it.polarity === "NEGATIVE" ? it.polarity : "NEUTRAL";
    // Tier 3(익명/개인 SNS)는 자동 감점 원천 차단 (참고 링크 전용)
    const rawImpact = Number(it.scoreImpact ?? 0);
    const safeImpact =
      tier === "TIER_3"
        ? 0
        : polarity === "POSITIVE"
        ? clamp(Math.abs(rawImpact || 15), 5, 35)
        : polarity === "NEGATIVE"
        ? -clamp(Math.abs(rawImpact || 20), 5, 45)
        : 0;

    return {
      id: String(it.id || `rep_${idx + 1}`),
      category: (it.category || "공식SNS·활동") as ReputationCategory,
      polarity,
      sourceTier: tier,
      sourceName: String(it.sourceName || "공개 출처"),
      publishedAt: String(it.publishedAt || "-"),
      sourceUrl: String(it.sourceUrl || ""),
      summary: String(it.summary || "").slice(0, 400),
      identityMatchConfidence: Math.max(0, Math.min(1, Number(it.identityMatchConfidence ?? 0.5))),
      correctionOrAcquittalNote: String(it.correctionOrAcquittalNote || ""),
      scoreImpact: safeImpact,
    };
  });

  const previewScore = clamp(
    items.reduce((acc, it) => acc + it.scoreImpact, 0),
    -100,
    100
  );

  return {
    contactKey,
    contactName,
    affiliation,
    identityWarning,
    overallPublicReputationScore: previewScore,
    items,
    scannedAt: nowStr,
  };
}

/**
 * 이용자가 '동일인 맞음'으로 1초 확인한 공개 평판 항목만 관계 점수에 공식 반영
 */
export async function applyConfirmedPublicReputation(params: {
  userEmail: string;
  contactName: string;
  phoneNumber?: string | null;
  item: PublicReputationItem;
}) {
  const { item } = params;
  const isNegative = item.polarity === "NEGATIVE" && item.sourceTier !== "TIER_3";
  const isPositive = item.polarity === "POSITIVE" && item.sourceTier !== "TIER_3";

  const tierWeight = item.sourceTier === "TIER_1" ? 1.0 : item.sourceTier === "TIER_2" ? 0.8 : 0.3;
  const fraudRisk =
    isNegative && item.category === "범죄·형사·행정제재"
      ? clamp(Math.round(70 * tierWeight), 0, 100)
      : isNegative
      ? clamp(Math.round(45 * tierWeight), 0, 100)
      : 0;

  const riskUrgency = isNegative ? clamp(Math.round(65 * tierWeight), 0, 100) : 10;
  const favorability = isPositive
    ? clamp(Math.round(45 * tierWeight), -100, 100)
    : isNegative
    ? -clamp(Math.round(50 * tierWeight), 0, 100)
    : 0;

  const authenticity = isPositive ? 90 : isNegative ? 30 : 75;
  const evidence = `[공개평판 확인 · ${item.sourceTier} · ${item.sourceName}(${item.publishedAt})] ${item.category}: ${item.summary}${
    item.sourceUrl ? ` (${item.sourceUrl})` : ""
  }`;

  const ingested = await ingestContactSignal({
    userEmail: params.userEmail,
    contactName: params.contactName,
    phoneNumber: params.phoneNumber || null,
    sourceType: "MANUAL",
    sourceRef: `PUBLIC_REPUTATION_${item.sourceTier}`,
    multiLabels: isPositive && item.category === "업적·수상·공적" ? ["전문가"] : [],
    closeness: 25,
    favorability,
    interest: 50,
    riskUrgency,
    fraudRisk,
    authenticityConsistency: authenticity,
    detectedRedFlags: isNegative ? [`${item.category}: ${item.summary.slice(0, 80)}`] : [],
    evidenceText: evidence,
    confidence: tierWeight,
  });

  // 부정(범죄/제재/논란) Tier 1·2 확인 시 맞춤 검증 체크리스트 자동 생성
  let verificationKit: CounterpartyVerificationKit | null = null;
  if (isNegative) {
    verificationKit = await generateCounterpartyVerificationKit({
      userEmail: params.userEmail,
      contactName: params.contactName,
      phoneNumber: params.phoneNumber || null,
      recentContextText: evidence,
      persist: true,
    }).catch(() => null);
  }

  return {
    ...ingested,
    verificationKit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 이메일(EMAIL) 수신/발신 기반 관계·도메인·신뢰 시그널 자동 추출 및 적재
// ─────────────────────────────────────────────────────────────────────────────

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "naver.com", "daum.net", "hanmail.net", "nate.com",
  "kakao.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
]);

function isAutomatedOrNewsletterEmail(senderEmail: string, subject: string): boolean {
  const lowerEmail = senderEmail.toLowerCase();
  if (/(no-?reply|noreply|mailer-daemon|newsletter|notification|alert|support@|info@|billing@|admin@)/i.test(lowerEmail)) {
    return true;
  }
  if (/(\[광고\]|\(광고\)|뉴스레터|인증번호|비밀번호 재설정|구독 해지|결제 영수증 자동)/i.test(subject)) {
    return true;
  }
  return false;
}

export async function ingestEmailRelationshipSignal(params: {
  userEmail: string;
  senderName: string;
  senderEmail?: string;
  subject: string;
  bodyText: string;
  occurredAt?: string;
  sourceRef?: string;
}) {
  const senderEmail = String(params.senderEmail || "").trim().toLowerCase();
  const subject = String(params.subject || "").trim();
  const body = String(params.bodyText || "").trim();
  if (isAutomatedOrNewsletterEmail(senderEmail, subject)) {
    return null;
  }

  const combined = `${subject}\n${body}`;
  const labels = new Set<string>();
  const redFlags: string[] = [];
  const reasons: string[] = [];

  // 1. 발신자 이메일 도메인 분석 (법인 도메인 vs 무료 포털)
  const domain = senderEmail.includes("@") ? senderEmail.split("@")[1] : "";
  const isCorporateDomain = Boolean(domain && !FREE_EMAIL_DOMAINS.has(domain));
  if (isCorporateDomain) {
    labels.add("거래처·공급사");
    reasons.push(`공식 기업 도메인(@${domain})`);
  }

  // 2. 비즈니스·재무·관계 키워드 분석
  if (/(견적서|발주서|계약서|거래명세서|세금계산서|납품|입금 확인|정산)/i.test(combined)) {
    labels.add("기존고객");
    reasons.push("공식 거래·서류 키워드");
  }
  if (/(미수금|연체|잔금|채무|변제|상환|차용|독촉|내용증명)/i.test(combined)) {
    labels.add(/(입금 요청|잔금 요청|미수|연체|독촉)/.test(combined) ? "채무자" : "채권자");
    reasons.push("재무·채권/채무 키워드");
  }
  if (/(투자|IR|밸류에이션|지분|펀딩|투자검토|시드|시리즈)/i.test(combined)) {
    labels.add("투자자");
    reasons.push("투자·IR 키워드");
  }
  if (/(세무|회계|법무|변호사|노무|특허|법률 검토)/i.test(combined)) {
    labels.add("전문가");
    reasons.push("전문 자문 키워드");
  }

  // 3. 의심·기망·분쟁 정황 감지
  let fraudRisk = 0;
  let riskUrgency = 15;
  let favorability = 15;
  let authenticity = isCorporateDomain ? 85 : 70;

  if (/(원금 보장|고수익|확정 수익|비밀 유지|개인 계좌|오늘까지 입금|긴급 송금)/i.test(combined)) {
    fraudRisk += 50;
    riskUrgency = 75;
    authenticity = 35;
    redFlags.push("이메일 내 긴급 송금·원금보장·개인계좌 의심 표현 감지");
  }
  if (!isCorporateDomain && /(대표이사|법인|투자 계약|선입금)/i.test(combined) && senderEmail) {
    fraudRisk += 20;
    redFlags.push(`법인/투자 언급 대비 무료 포털 메일(@${domain}) 사용`);
  }
  if (/(불만|클레임|환불|해지|법적 조치|내용증명|책임지지 않|일방적)/i.test(combined)) {
    favorability = -45;
    riskUrgency = Math.max(riskUrgency, 65);
    redFlags.push("이메일 내 클레임·분쟁·책임회피 표현 감지");
  } else if (/(감사합니다|감사드립니다|잘 부탁|협조 감사|긍정적)/i.test(combined)) {
    favorability = 35;
  }

  const contactName = params.senderName || senderEmail || "이메일 상대방";
  const contactKeySource = senderEmail || contactName;
  const evidenceText = `[이메일] ${subject}${reasons.length > 0 ? ` (${reasons.join(", ")})` : ""}`;

  const ingested = await ingestContactSignal({
    userEmail: params.userEmail,
    contactName,
    phoneNumber: extractPhoneFromContactText(combined) || contactKeySource,
    sourceType: "EMAIL",
    sourceRef: params.sourceRef || senderEmail || subject.slice(0, 60),
    multiLabels: Array.from(labels),
    closeness: 25,
    favorability,
    interest: /(견적|계약|미팅|일정|문의|검토)/i.test(combined) ? 70 : 45,
    riskUrgency,
    fraudRisk: clamp(fraudRisk, 0, 100),
    authenticityConsistency: authenticity,
    detectedRedFlags: redFlags,
    evidenceText,
    confidence: isCorporateDomain ? 0.9 : 0.75,
    occurredAt: params.occurredAt,
  });

  if (fraudRisk >= 45 || redFlags.length > 0) {
    await generateCounterpartyVerificationKit({
      userEmail: params.userEmail,
      contactName,
      phoneNumber: extractPhoneFromContactText(combined) || undefined,
      recentContextText: `이메일 제목: ${subject}\n본문 요약: ${body.slice(0, 500)}\n감지 정황: ${redFlags.join(" / ")}`,
      persist: true,
    }).catch(() => {});
  }

  return ingested;
}



