/**
 * 🚀 시트봇 관계 코파일럿 7대 고급 인텔리전스 스위트 (Phase 1 ~ Phase 3)
 *
 * [Phase 1]
 *  1. buildInCallTacticalCoach     : 통화 전 5초 대응 전략 코치 (In-Call Tactical Coach)
 *  2. buildEvidenceVaultHtml       : 원클릭 증거 보존 타임라인 HTML/PDF 패키지 (Evidence Vault)
 * [Phase 2]
 *  3. computeMutualPromiseLedger   : 쌍방 약속 성적표 (Mutual Promise Ledger)
 *  4. detectRelationshipDecayRadar : 관계 냉각 경보 & 맥락 기반 안부 초안 (Decay Radar)
 * [Phase 3]
 *  5. analyzeNetworkContagion      : 인맥 연결망·소개자 그래프 & 연쇄 리스크 경보 (Network Contagion)
 *  6. computeRoiEmotionalMatrix    : 수익성 vs 감정 소모 4분면 매트릭스 (ROI vs Emotional Cost)
 *  7. generateSelfCoachingMirror   : 이용자 본인 소통 패턴 미러링 (Self-Coaching Mirror)
 */

import { callAiCaller, queryTable } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import {
  normalizeContactKey,
  unwrapAiCallerJson,
  unwrapAiCallerText,
} from "@/lib/relationship-intelligence";

function safeJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const ms = new Date(String(dateStr).replace(" ", "T")).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 1 - ①] 통화 전 5초 대응 전략 코치 (In-Call Tactical Coach)
// ─────────────────────────────────────────────────────────────────────────────

export function buildInCallTacticalCoach(params: {
  labels: string[];
  riskGrade: string;
  riskScore: number;
  trustScore: number;
  favorability: number;
  trend?: string;
  lastInteractionAt?: string | null;
  evidenceSummary?: string | null;
  pendingVerificationCount?: number;
}): {
  headline: string;
  tacticalTip: string;
  avoidAction: string;
  urgencyLevel: "CRITICAL" | "WARN" | "INFO" | "POSITIVE";
} {
  const {
    labels,
    riskGrade,
    riskScore,
    favorability,
    trend,
    lastInteractionAt,
    pendingVerificationCount = 0,
  } = params;
  const idleDays = daysSince(lastInteractionAt);

  if (riskGrade === "고위험" || riskScore >= 75) {
    return {
      headline: "🚨 고위험 상대 · 즉답 및 선입금 방어 모드",
      tacticalTip:
        "통화 중 확정 답변·송금 약속을 피하고 '세무사/내부 검토 후 이틀 뒤 서면 회신'으로 방어하세요.",
      avoidAction: "개인 계좌 입금, 구두 계약 확정, 즉시 결정 금지",
      urgencyLevel: "CRITICAL",
    };
  }

  if (labels.includes("채무자")) {
    return {
      headline: "⚠️ 미수·채무 관리 · 분할 이행 및 문자 확약 유도",
      tacticalTip:
        "감정적 추궁 대신 '오늘 일부 분할 입금 + 잔액 일정 문자 확약'을 차분히 요청하세요.",
      avoidAction: "기한 없는 구두 연장 수용 금지",
      urgencyLevel: "WARN",
    };
  }

  if (riskGrade === "주의" || pendingVerificationCount > 0) {
    return {
      headline: "🛡️ 주의 단계 · 서면 근거 및 검증 질문 활용",
      tacticalTip:
        "구체적 일정·계약서 초안·예금주 일치 여부를 부드럽게 확인하고 상대방 반응을 관찰하세요.",
      avoidAction: "증빙 없는 선진행 금지",
      urgencyLevel: "WARN",
    };
  }

  if (labels.includes("가족")) {
    return {
      headline: "👨‍👩‍👧 가족 통화 · 업무 오버레이 최소화",
      tacticalTip:
        idleDays >= 14
          ? `${idleDays}일 만의 연락입니다. 안부와 건강부터 따뜻하게 챙겨보세요.`
          : "편안한 가족 통화입니다.",
      avoidAction: "업무용 명함 문자 자동 발송 제외 권장",
      urgencyLevel: "POSITIVE",
    };
  }

  if ((labels.includes("VIP") || labels.includes("기존고객") || labels.includes("투자자")) && (idleDays >= 25 || trend === "냉각")) {
    return {
      headline: "🔥 관계 냉각 주의 · 안부 우선 & 신뢰 회복",
      tacticalTip: `최근 ${idleDays}일 공백 또는 온도 하락이 감지되었습니다. 본론 전에 직전 건 만족도와 안부부터 확인하세요.`,
      avoidAction: "안부 없는 즉각 영업·청구 언급 지양",
      urgencyLevel: "WARN",
    };
  }

  if (favorability >= 40) {
    return {
      headline: "✨ 우호적 관계 · 협업/소개 기회 확장",
      tacticalTip:
        "상대방 우호도가 높습니다. 핵심 요구사항을 명확히 정리하고 후속 일정을 바로 확정하세요.",
      avoidAction: "후속 약속 기한 누락 주의",
      urgencyLevel: "POSITIVE",
    };
  }

  return {
    headline: "💼 일반 비즈니스 응대 · 핵심 약속 기록",
    tacticalTip: "통화 핵심 요점과 마감 기한을 확인하고 종료 후 요약 문자로 남기면 신뢰가 올라갑니다.",
    avoidAction: "모호한 일정 마무리 지양",
    urgencyLevel: "INFO",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 1 - ②] 원클릭 증거 보존 패키지 (Evidence Vault HTML/PDF)
// ─────────────────────────────────────────────────────────────────────────────

export async function buildEvidenceVaultHtml(params: {
  userEmail: string;
  contactKey: string;
}): Promise<{
  contactName: string;
  generatedAt: string;
  signalCount: number;
  verificationCount: number;
  taskCount: number;
  html: string;
}> {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const cKey = normalizeContactKey(params.contactKey);
  const nowStr = getKoreanTimeString();

  const [profileRes, signalsRes, verificationsRes, tasksRes] = await Promise.all([
    queryTable("sheetbot_contact_profiles", {
      filters: { user_email: cleanEmail, contact_key: cKey },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 1,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_signals", {
      filters: { user_email: cleanEmail, contact_key: cKey },
      orderBy: "id",
      orderDirection: "ASC",
      limit: 100,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_verifications", {
      filters: { user_email: cleanEmail, contact_key: cKey },
      orderBy: "id",
      orderDirection: "ASC",
      limit: 20,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_tasks", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] })),
  ]);

  const profile = (profileRes.rows || []).find((r: any) => !r.deleted_at) || null;
  const signals = (signalsRes.rows || []).filter((r: any) => !r.deleted_at);
  const verifications = (verificationsRes.rows || []).filter((r: any) => !r.deleted_at);
  const contactName = profile?.contact_name || signals[0]?.contact_name || params.contactKey;
  const cleanDigits = cKey.replace(/\D/g, "");

  const relatedTasks = (tasksRes.rows || [])
    .filter((t: any) => !t.deleted_at)
    .filter((t: any) => {
      const tPhone = String(t.contact_phone || t.contact_name || "").replace(/\D/g, "");
      if (cleanDigits.length >= 8 && tPhone && tPhone.includes(cleanDigits.slice(-8))) return true;
      if (contactName && String(t.contact_name || "").includes(contactName)) return true;
      return false;
    });

  const labels = safeJson<string[]>(profile?.multi_labels_json, []).join(", ") || "미분류";

  const signalRowsHtml = signals
    .map((s: any, idx: number) => {
      const emo = safeJson<any>(s.emotion_json, null);
      const flags = safeJson<string[]>(s.detected_red_flags_json, []);
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.occurred_at || s.created_at || "-")}</td>
        <td><strong>${escapeHtml(s.source_type || "-")}</strong><br/><span class="muted">${escapeHtml(s.source_ref || "")}</span></td>
        <td>${escapeHtml(emo?.primaryEmotion || "-")} (우호 ${s.favorability ?? 0} / 기망 ${s.fraud_risk ?? 0})</td>
        <td>${escapeHtml(s.evidence_text || "-")}${flags.length > 0 ? `<div class="flag">⚠️ ${escapeHtml(flags.join(" / "))}</div>` : ""}</td>
      </tr>`;
    })
    .join("");

  const verifyRowsHtml = verifications
    .map((v: any, idx: number) => {
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(v.completed_at || v.created_at || "-")}</td>
        <td>${escapeHtml(v.trigger_reason || "-")}</td>
        <td>AI ${v.ai_initial_risk_score ?? "-"} → 재평가 <strong>${v.recalculated_risk_score ?? "-"}</strong></td>
        <td>${escapeHtml(v.final_recommendation || v.status || "-")}</td>
      </tr>`;
    })
    .join("");

  const taskRowsHtml = relatedTasks
    .map((t: any, idx: number) => {
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(t.created_at || "-")}</td>
        <td>${escapeHtml(t.title || "-")}</td>
        <td>${escapeHtml(t.due_date || "-")}</td>
        <td><strong>${escapeHtml(t.status || "PENDING")}</strong></td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>[증거 보존 타임라인] ${escapeHtml(contactName)}</title>
<style>
  body { font-family: 'Malgun Gothic', -apple-system, sans-serif; color: #0f172a; margin: 28px; line-height: 1.55; }
  .header { border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .title { font-size: 22px; font-weight: 800; margin: 0; }
  .meta { font-size: 12px; color: #475569; text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
  .card .k { font-size: 11px; color: #64748b; }
  .card .v { font-size: 18px; font-weight: 800; margin-top: 4px; }
  h2 { font-size: 15px; margin: 22px 0 8px; border-left: 4px solid #0284c7; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; font-weight: 700; }
  .flag { color: #b91c1c; font-weight: 700; margin-top: 4px; }
  .muted { color: #64748b; font-size: 11px; }
  .notice { margin-top: 24px; padding: 12px; background: #fefce8; border: 1px solid #fde047; border-radius: 8px; font-size: 11.5px; color: #713f12; }
  @media print { .no-print { display: none; } body { margin: 12px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">🔒 상대방 증거 보존 타임라인 패키지</p>
      <div style="font-size:13px;margin-top:4px;">대상: <strong>${escapeHtml(contactName)}</strong> (${escapeHtml(profile?.phone_number || cKey)}) · 분류: ${escapeHtml(labels)}</div>
    </div>
    <div class="meta">
      <div>생성 일시: ${escapeHtml(nowStr)} (KST)</div>
      <div>소유 계정: ${escapeHtml(cleanEmail)}</div>
      <button class="no-print" onclick="window.print()" style="margin-top:6px;padding:5px 10px;background:#0f172a;color:#fff;border:none;border-radius:6px;cursor:pointer;">🖨️ 인쇄 / PDF 저장</button>
    </div>
  </div>

  <div class="grid">
    <div class="card"><div class="k">위험 등급 / 최종 위험도</div><div class="v">${escapeHtml(profile?.risk_grade || "보통")} (${profile?.final_risk_score ?? 0})</div></div>
    <div class="card"><div class="k">최종 신뢰도</div><div class="v">${profile?.final_trust_score ?? 50} / 100</div></div>
    <div class="card"><div class="k">기망 위험 / 진정성</div><div class="v">${profile?.fraud_risk ?? 0} / ${profile?.authenticity_consistency ?? 75}</div></div>
    <div class="card"><div class="k">누적 기록 건수</div><div class="v">시그널 ${signals.length} · 검증 ${verifications.length}</div></div>
  </div>

  <h2>1. 시간순 소통 · 음성 감정 · 의심 정황 타임라인 (${signals.length}건)</h2>
  <table>
    <thead><tr><th style="width:40px">#</th><th style="width:130px">발생 일시</th><th style="width:130px">채널/출처</th><th style="width:160px">감정·수치</th><th>근거 및 감지 정황</th></tr></thead>
    <tbody>${signalRowsHtml || '<tr><td colspan="5">기록된 시그널이 없습니다.</td></tr>'}</tbody>
  </table>

  <h2>2. AI 의심 검증 체크리스트 &amp; 이용자 자가 체크 재평가 이력 (${verifications.length}건)</h2>
  <table>
    <thead><tr><th style="width:40px">#</th><th style="width:130px">일시</th><th>검증 사유</th><th style="width:140px">점수 변화</th><th>최종 권고</th></tr></thead>
    <tbody>${verifyRowsHtml || '<tr><td colspan="5">완료/진행 중인 검증 이력이 없습니다.</td></tr>'}</tbody>
  </table>

  <h2>3. 쌍방 약속 및 할 일 이행 기록 (${relatedTasks.length}건)</h2>
  <table>
    <thead><tr><th style="width:40px">#</th><th style="width:130px">등록 일시</th><th>약속/할 일 내용</th><th style="width:110px">마감 기한</th><th style="width:90px">상태</th></tr></thead>
    <tbody>${taskRowsHtml || '<tr><td colspan="5">연결된 약속/할 일이 없습니다.</td></tr>'}</tbody>
  </table>

  <div class="notice">
    ※ 본 문서는 SheetBot 관계 코파일럿에 축적된 통화 녹음 분석·이메일·문자·자가 체크 기록을 시간순으로 정리한 참고용 증거 패키지입니다. 법적 절차(내용증명, 지급명령, 소송 등) 진행 시 원본 녹음 파일 및 공식 금융·계약 서류와 함께 전문가 검토를 권장합니다.
  </div>
</body>
</html>`;

  return {
    contactName,
    generatedAt: nowStr,
    signalCount: signals.length,
    verificationCount: verifications.length,
    taskCount: relatedTasks.length,
    html,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 2 - ③] 쌍방 약속 성적표 (Mutual Promise Ledger)
// ─────────────────────────────────────────────────────────────────────────────

export async function computeMutualPromiseLedger(params: {
  userEmail: string;
  contactKey: string;
}) {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const cKey = normalizeContactKey(params.contactKey);
  const digits = cKey.replace(/\D/g, "");

  const [profileRes, tasksRes] = await Promise.all([
    queryTable("sheetbot_contact_profiles", {
      filters: { user_email: cleanEmail, contact_key: cKey },
      limit: 1,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_tasks", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 150,
    }).catch(() => ({ rows: [] })),
  ]);

  const profile = (profileRes.rows || []).find((r: any) => !r.deleted_at);
  const contactName = profile?.contact_name || params.contactKey;

  const matched = (tasksRes.rows || [])
    .filter((t: any) => !t.deleted_at)
    .filter((t: any) => {
      const p = String(t.contact_phone || t.contact_name || "").replace(/\D/g, "");
      if (digits.length >= 8 && p && p.includes(digits.slice(-8))) return true;
      if (contactName && String(t.contact_name || "").includes(contactName)) return true;
      return false;
    });

  const nowMs = Date.now();
  const myPromises: any[] = [];
  const counterpartyPromises: any[] = [];

  for (const t of matched) {
    const title = String(t.title || "");
    const isCounterparty = /(입금 대기|송금 예정|상대방|회신 대기|자료 수령|잔금 수령|결제 예정)/.test(title);
    const dueMs = t.due_date ? new Date(String(t.due_date).replace(" ", "T")).getTime() : NaN;
    const isOverdue = t.status !== "DONE" && Number.isFinite(dueMs) && dueMs < nowMs;
    const item = {
      id: t.id,
      title,
      dueDate: t.due_date || null,
      status: t.status || "PENDING",
      isOverdue,
    };
    if (isCounterparty) counterpartyPromises.push(item);
    else myPromises.push(item);
  }

  const calcRate = (list: any[]) => {
    if (list.length === 0) return 100;
    const done = list.filter((i) => i.status === "DONE").length;
    return Math.round((done / list.length) * 100);
  };

  const myOverdue = myPromises.filter((i) => i.isOverdue);
  const counterpartyOverdue = counterpartyPromises.filter((i) => i.isOverdue);

  return {
    contactKey: cKey,
    contactName,
    myFulfillmentRate: calcRate(myPromises),
    counterpartyFulfillmentRate: calcRate(counterpartyPromises),
    myTotal: myPromises.length,
    counterpartyTotal: counterpartyPromises.length,
    myOverdueCount: myOverdue.length,
    counterpartyOverdueCount: counterpartyOverdue.length,
    myOverdueAlert:
      myOverdue.length > 0
        ? `⚠️ 내가 지키지 못한 지연 약속 ${myOverdue.length}건("${myOverdue[0].title}")이 상대방 신뢰도에 영향을 줄 수 있습니다.`
        : null,
    counterpartyOverdueAlert:
      counterpartyOverdue.length > 0
        ? `🚨 상대방 미이행/지연 약속 ${counterpartyOverdue.length}건("${counterpartyOverdue[0].title}") 확인 필요`
        : null,
    myPromises: myPromises.slice(0, 10),
    counterpartyPromises: counterpartyPromises.slice(0, 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 2 - ④] 관계 냉각 경보 & 맥락 기반 안부 초안 (Relationship Decay Radar)
// ─────────────────────────────────────────────────────────────────────────────

export async function detectRelationshipDecayRadar(params: {
  userEmail: string;
  thresholdDays?: number;
  withAiDraft?: boolean;
}) {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const threshold = params.thresholdDays ?? 21;

  const profilesRes = await queryTable("sheetbot_contact_profiles", {
    filters: { user_email: cleanEmail },
    orderBy: "id",
    orderDirection: "DESC",
    limit: 150,
  }).catch(() => ({ rows: [] }));

  const profiles = (profilesRes.rows || []).filter((r: any) => !r.deleted_at);
  const priorityTags = new Set(["VIP", "기존고객", "투자자", "가족", "지인", "파트너"]);

  const coolingList = profiles
    .map((p: any) => {
      const labels = safeJson<string[]>(p.multi_labels_json, []);
      const idleDays = daysSince(p.last_interaction_at || p.updated_at || p.created_at);
      const isImportant =
        labels.some((l) => priorityTags.has(l)) || Number(p.final_trust_score ?? 50) >= 65;
      const isCooling = (isImportant && idleDays >= threshold) || p.trend === "냉각";
      return {
        contactKey: p.contact_key,
        contactName: p.contact_name,
        phoneNumber: p.phone_number || "",
        labels,
        idleDays,
        trend: p.trend || "유지",
        favorability: Number(p.favorability ?? 0),
        evidenceSummary: String(p.evidence_summary || ""),
        isCooling,
      };
    })
    .filter((item: any) => item.isCooling)
    .sort((a: any, b: any) => b.idleDays - a.idleDays)
    .slice(0, 10);

  const enriched = await Promise.all(
    coolingList.map(async (item: any, idx: number) => {
      let draftMessage = `${item.contactName}님, 안녕하세요! 요즘 잘 지내고 계신가요? 문득 생각나서 안부 여쭙니다. 편하실 때 차 한잔이나 통화 한번 나누어요.`;
      if (item.labels.includes("가족")) {
        draftMessage = `${item.contactName}, 요즘 잘 지내고 있어? 바빠서 연락을 못 했네. 시간 될 때 전화할게!`;
      } else if (params.withAiDraft && idx < 3) {
        try {
          const aiRes = await callAiCaller(
            `상대방(${item.contactName}, 관계:${item.labels.join(",")}, 마지막 연락 ${item.idleDays}일 전, 과거 맥락:${item.evidenceSummary || "없음"})에게 보낼 자연스럽고 따뜻한 한국어 안부 문자/카톡 2문장만 작성하세요.`,
            { caller: "sheetbot-decay-draft", model: "gemini-2.5-flash", temperature: 0.6 }
          );
          const txt = unwrapAiCallerText(aiRes);
          if (txt && txt.length >= 10) draftMessage = txt.slice(0, 260);
        } catch {}
      }
      return { ...item, draftMessage };
    })
  );

  return {
    thresholdDays: threshold,
    coolingCount: enriched.length,
    items: enriched,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 3 - ⑤] 인맥 연결망 & 연쇄 리스크 경보 (Network Contagion)
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeNetworkContagion(userEmail: string) {
  const cleanEmail = userEmail.toLowerCase().trim();
  const [profilesRes, signalsRes] = await Promise.all([
    queryTable("sheetbot_contact_profiles", {
      filters: { user_email: cleanEmail },
      limit: 200,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_signals", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 200,
    }).catch(() => ({ rows: [] })),
  ]);

  const profiles = (profilesRes.rows || []).filter((r: any) => !r.deleted_at);
  const signals = (signalsRes.rows || []).filter((r: any) => !r.deleted_at);

  // 클러스터 키(이메일 도메인 또는 회사/소속 토큰)로 인맥 그룹핑
  const clusters = new Map<string, any[]>();
  const referrerCounts = new Map<string, number>();

  for (const p of profiles) {
    const name = String(p.contact_name || "");
    const ev = String(p.evidence_summary || "");
    const domainMatch = `${p.phone_number || ""} ${ev}`.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
    const corpMatch = name.match(/\(([^)]+)\)|([가-힣A-Za-z0-9]{2,}(?:기업|주식회사|상사|물류|컨설팅|파트너스|자산|투자))/);
    const clusterKey = domainMatch
      ? `도메인:@${domainMatch[1].toLowerCase()}`
      : corpMatch
      ? `소속:${(corpMatch[1] || corpMatch[2]).trim()}`
      : null;

    if (clusterKey) {
      const arr = clusters.get(clusterKey) || [];
      arr.push(p);
      clusters.set(clusterKey, arr);
    }
  }

  for (const s of signals) {
    const m = String(s.evidence_text || "").match(/([가-힣]{2,4})\s*(?:대표|팀장|님|씨)?\s*소개/);
    if (m) {
      referrerCounts.set(m[1], (referrerCounts.get(m[1]) || 0) + 1);
    }
  }

  const contagionAlerts: any[] = [];
  for (const [clusterName, members] of clusters.entries()) {
    if (members.length < 2) continue;
    const highRiskMembers = members.filter(
      (m) => m.risk_grade === "고위험" || Number(m.final_risk_score ?? 0) >= 65
    );
    if (highRiskMembers.length > 0) {
      const others = members.filter((m) => !highRiskMembers.includes(m));
      contagionAlerts.push({
        clusterName,
        sourceRiskContact: highRiskMembers[0].contact_name,
        sourceRiskScore: highRiskMembers[0].final_risk_score,
        affectedContacts: others.map((o) => ({
          contactKey: o.contact_key,
          contactName: o.contact_name,
          currentRiskGrade: o.risk_grade,
        })),
        alertMessage: `🕸️ [${clusterName}] 동일 라인의 '${highRiskMembers[0].contact_name}'에서 고위험(${highRiskMembers[0].final_risk_score}) 감지 → 연계 인물 ${others.length}명 사전 점검 권장`,
      });
    }
  }

  const superConnectors = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, referralCount: count }));

  return {
    clusterCount: clusters.size,
    contagionAlerts,
    superConnectors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 3 - ⑥] 수익성 vs 감정 소모 4분면 매트릭스 (ROI vs Emotional Cost)
// ─────────────────────────────────────────────────────────────────────────────

export async function computeRoiEmotionalMatrix(userEmail: string) {
  const cleanEmail = userEmail.toLowerCase().trim();
  const profilesRes = await queryTable("sheetbot_contact_profiles", {
    filters: { user_email: cleanEmail },
    limit: 200,
  }).catch(() => ({ rows: [] }));

  const profiles = (profilesRes.rows || []).filter((r: any) => !r.deleted_at);

  const points = profiles.map((p: any) => {
    const labels = safeJson<string[]>(p.multi_labels_json, []);
    const baseEco = Number(p.economic_value ?? 40);
    const labelBonus = labels.includes("VIP") ? 35 : labels.includes("투자자") ? 30 : labels.includes("기존고객") ? 15 : 0;
    const roiScore = Math.min(100, baseEco + labelBonus);

    const negFav = Math.max(0, -Number(p.favorability ?? 0));
    const emotionalCost = Math.min(
      100,
      Math.round(0.45 * Number(p.final_risk_score ?? 20) + 0.35 * negFav + 0.2 * Number(p.risk_urgency ?? 15))
    );

    let quadrant: "핵심 VIP" | "고수익·고스트레스 관리" | "안정 유지" | "에너지 뱀파이어 주의" = "안정 유지";
    if (roiScore >= 55 && emotionalCost < 45) quadrant = "핵심 VIP";
    else if (roiScore >= 55 && emotionalCost >= 45) quadrant = "고수익·고스트레스 관리";
    else if (roiScore < 55 && emotionalCost >= 50) quadrant = "에너지 뱀파이어 주의";

    return {
      contactKey: p.contact_key,
      contactName: p.contact_name,
      labels,
      roiScore,
      emotionalCost,
      quadrant,
    };
  });

  return {
    total: points.length,
    vipCount: points.filter((p: any) => p.quadrant === "핵심 VIP").length,
    vampireCount: points.filter((p: any) => p.quadrant === "에너지 뱀파이어 주의").length,
    points,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 3 - ⑦] 이용자 본인 소통 패턴 미러링 (Self-Coaching Mirror)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSelfCoachingMirror(userEmail: string) {
  const cleanEmail = userEmail.toLowerCase().trim();
  const [signalsRes, verificationsRes] = await Promise.all([
    queryTable("sheetbot_contact_signals", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 150,
    }).catch(() => ({ rows: [] })),
    queryTable("sheetbot_contact_verifications", {
      filters: { user_email: cleanEmail, status: "COMPLETED" },
      limit: 50,
    }).catch(() => ({ rows: [] })),
  ]);

  const signals = (signalsRes.rows || []).filter((r: any) => !r.deleted_at);
  const verifications = (verificationsRes.rows || []).filter((r: any) => !r.deleted_at);

  let eveningCount = 0;
  let eveningFavSum = 0;
  let daytimeCount = 0;
  let daytimeFavSum = 0;
  let flatteryExposureCount = 0;
  let highStressCallCount = 0;

  for (const s of signals) {
    const dt = String(s.occurred_at || s.created_at || "");
    const hourMatch = dt.match(/\s(\d{2}):/);
    const hour = hourMatch ? Number(hourMatch[1]) : 12;
    const fav = Number(s.favorability ?? 0);
    if (hour >= 18 || hour < 8) {
      eveningCount++;
      eveningFavSum += fav;
    } else {
      daytimeCount++;
      daytimeFavSum += fav;
    }
    if (Number(s.flattery_detected) === 1) flatteryExposureCount++;
    if (Number(s.situational_stress ?? 0) >= 60) highStressCallCount++;
  }

  const daytimeAvgFav = daytimeCount > 0 ? Math.round(daytimeFavSum / daytimeCount) : 0;
  const eveningAvgFav = eveningCount > 0 ? Math.round(eveningFavSum / eveningCount) : 0;

  const insights: string[] = [];
  if (eveningCount >= 3 && daytimeAvgFav - eveningAvgFav >= 12) {
    insights.push(
      `🌙 오후 6시 이후 소통의 평균 우호도(${eveningAvgFav})가 주간(${daytimeAvgFav})보다 ${daytimeAvgFav - eveningAvgFav}점 낮습니다. 중요한 협상·견적 통화는 가급적 낮 시간대에 배치해 보세요.`
    );
  }
  if (flatteryExposureCount >= 2) {
    insights.push(
      `🎭 과잉 칭찬/아첨 패턴이 감지된 소통이 ${flatteryExposureCount}회 있었습니다. 칭찬 직후 조건·할인·입금 요구가 나올 때는 '이틀 검토' 규칙을 고정 적용해 보세요.`
    );
  }
  if (highStressCallCount >= 3) {
    insights.push(
      `⚡ 상황적 스트레스·조급함이 높은 통화가 ${highStressCallCount}건 누적되었습니다. 급박한 통화 직후에는 10분 냉각 후 문자/이메일로 조건을 재확인하는 습관이 분쟁을 줄입니다.`
    );
  }
  if (verifications.length > 0) {
    const avoided = verifications.filter((v: any) => Number(v.recalculated_risk_score ?? 0) >= 75).length;
    insights.push(
      `🛡️ 지금까지 총 ${verifications.length}건의 자가 체크 검증을 수행했으며, 그중 ${avoided}건의 고위험 거래를 사전에 식별했습니다.`
    );
  }
  if (insights.length === 0) {
    insights.push(
      "✨ 현재까지 안정적인 소통 패턴을 유지하고 있습니다. 통화·이메일 기록이 쌓일수록 시간대별 톤 변화와 협상 습관 분석이 더욱 정교해집니다."
    );
  }

  return {
    analyzedSignalCount: signals.length,
    daytimeAvgFav,
    eveningAvgFav,
    flatteryExposureCount,
    completedVerifications: verifications.length,
    insights,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// [Pre-Outbound Coach] 전화 걸기 전 · 문자 발송 전 · 이메일 작성 시 사전 AI 코칭
// ─────────────────────────────────────────────────────────────────────────────

export type OutboundChannel = "CALL" | "SMS" | "EMAIL";

export interface PreOutboundCoachResult {
  channel: OutboundChannel;
  contactName: string;
  riskGrade: string;
  riskWarnings: string[];
  openingOrSubject: string;
  keyStrategy: string;
  avoidPhrases: string[];
  rewriteOptions: {
    soft: string; // 🤝 관계 회복·부드럽게
    firm: string; // ⚖️ 단호·증거 보존형
    concise: string; // ⚡ 핵심 3줄
  };
  attachmentReminder: string | null;
}

export async function generatePreOutboundCoach(params: {
  userEmail: string;
  channel: OutboundChannel;
  contactKey?: string;
  contactName?: string;
  goal?: string;
  draftSubject?: string;
  draftText?: string;
}): Promise<PreOutboundCoachResult> {
  const cleanEmail = params.userEmail.toLowerCase().trim();
  const cKey = params.contactKey
    ? normalizeContactKey(params.contactKey)
    : params.contactName
    ? normalizeContactKey(params.contactName)
    : "";

  let profile: any = null;
  let signals: any[] = [];
  if (cKey && cKey !== "unknown") {
    const [pRes, sRes] = await Promise.all([
      queryTable("sheetbot_contact_profiles", {
        filters: { user_email: cleanEmail, contact_key: cKey },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 1,
      }).catch(() => ({ rows: [] })),
      queryTable("sheetbot_contact_signals", {
        filters: { user_email: cleanEmail, contact_key: cKey },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 5,
      }).catch(() => ({ rows: [] })),
    ]);
    profile = (pRes.rows || []).find((r: any) => !r.deleted_at) || null;
    signals = (sRes.rows || []).filter((r: any) => !r.deleted_at);
  }

  const contactName = params.contactName || profile?.contact_name || "상대방";
  const labels = safeJson<string[]>(profile?.multi_labels_json, []);
  const riskGrade = String(profile?.risk_grade || "보통");
  const riskScore = Number(profile?.final_risk_score ?? 20);
  const trustScore = Number(profile?.final_trust_score ?? 50);
  const favorability = Number(profile?.favorability ?? 0);

  const recentHistory = signals
    .map((s: any, i: number) => `[${i + 1}] (${s.source_type}, ${s.occurred_at || ""}) 우호:${s.favorability} / 기망:${s.fraud_risk} / 내용:${s.evidence_text || "-"}`)
    .join("\n");

  const draftText = String(params.draftText || "").trim();
  const draftSubject = String(params.draftSubject || "").trim();
  const goal = String(params.goal || "").trim();

  // 이메일 첨부 누락 사전 감지
  const attachmentReminder =
    params.channel === "EMAIL" && /(첨부|붙임|별첨|파일 보내|견적서 확인|계약서 확인)/.test(`${draftSubject} ${draftText}`)
      ? "📎 본문에 첨부파일 언급이 있습니다. 발송 전 실제 첨부파일이 포함되었는지 꼭 확인하세요."
      : null;

  const channelLabel =
    params.channel === "CALL"
      ? "전화 걸기 전 (구두 통화 스크립트)"
      : params.channel === "EMAIL"
      ? "이메일 작성·발송 전 (공식 서면)"
      : "문자·카카오톡 발송 전 (메신저)";

  const prompt = `당신은 비즈니스·대인 커뮤니케이션 전문 '사전 발신 AI 코치'입니다.
이용자가 아래 상대방에게 [${channelLabel}] 연락을 하기 직전입니다.
상대방의 누적 관계·위험도·감정 이력을 반영해, 말실수·불리한 양보·감정적 분쟁을 예방하고 목적을 달성할 수 있는 사전 코칭을 순수 JSON으로만 작성하세요.

[상대방 프로필]
- 이름: ${contactName}
- 다중 관계 태그: ${labels.join(", ") || "미분류"}
- 위험 등급: ${riskGrade} (위험도 ${riskScore} / 신뢰도 ${trustScore} / 우호도 ${favorability})
- 최근 이력:
${recentHistory || "(누적 이력 없음)"}

[이용자 발신 정보]
- 연락 목적/용건: ${goal || "(초안 내용 기준 추론)"}
- 작성 중인 제목(이메일): ${draftSubject || "-"}
- 작성 중인 초안: ${draftText || "(초안 없음 - 목적에 맞게 새로 작성)"}

[필수 출력 JSON 스키마]
{
  "riskWarnings": ["초안이나 상대방 위험도 기준 주의해야 할 경고 1~3개 (없으면 빈 배열)"],
  "openingOrSubject": "전화인 경우 추천 첫 마디 오프닝 멘트 / 이메일인 경우 추천 제목 / 문자인 경우 핵심 첫 문장",
  "keyStrategy": "이번 연락에서 반드시 지켜야 할 핵심 전략 1~2문장",
  "avoidPhrases": ["절대 쓰지 말아야 할 표현이나 함정 2~3개"],
  "rewriteOptions": {
    "soft": "🤝 부드럽고 관계 친화적인 버전 (실제 바로 보낼 수 있는 완성 문장)",
    "firm": "⚖️ 단호하고 조건·기한이 명확한 증거 보존형 버전 (실제 바로 보낼 수 있는 완성 문장)",
    "concise": "⚡ 바쁜 상대방용 2~3줄 핵심 요약 버전"
  }
}

규칙:
- 상대방이 고위험/주의/채무자라면 불리한 구두 약속이나 감정적 표현을 반드시 riskWarnings에서 경고하세요.
- 초안에 화가 나거나 거친 표현이 있다면 법적·캡처 리스크를 경고하고 쿨다운된 문장으로 순화하세요.
- 한국어로 자연스럽고 즉시 복사해 쓸 수 있게 작성하세요.`;

  let aiParsed: any = null;
  try {
    const res = await callAiCaller(prompt, {
      caller: "sheetbot-pre-outbound-coach",
      model: "gemini-2.5-flash",
      temperature: 0.3,
    });
    aiParsed = unwrapAiCallerJson(res);
  } catch (err: any) {
    console.warn("[PreOutboundCoach] AI fallback:", err?.message);
  }

  const baseFallbackText =
    draftText ||
    (goal
      ? `안녕하세요, ${contactName}님. ${goal} 관련하여 연락드렸습니다. 확인 후 회신 부탁드립니다.`
      : `안녕하세요, ${contactName}님. 논의드린 건 확인차 연락드렸습니다.`);

  const defaultWarnings: string[] = [];
  if (riskGrade === "고위험" || riskScore >= 75) {
    defaultWarnings.push(`🚨 고위험 상대(${riskScore}점)입니다. 선입금·구두 확정·개인계좌 송금 표현을 피하고 서면 검토 절차를 명시하세요.`);
  }
  if (labels.includes("채무자")) {
    defaultWarnings.push("⚠️ 채무/미수 관리 대상입니다. 구체적 금액과 입금 기한을 문자로 명확히 남기세요.");
  }

  return {
    channel: params.channel,
    contactName,
    riskGrade,
    riskWarnings:
      Array.isArray(aiParsed?.riskWarnings) ? aiParsed.riskWarnings.map(String) : defaultWarnings,
    openingOrSubject:
      aiParsed?.openingOrSubject ||
      (params.channel === "EMAIL"
        ? draftSubject || `[확인 요청] ${goal || "협의 사항"} 안내드립니다.`
        : `안녕하세요 ${contactName}님, 잠시 통화 가능하실까요?`),
    keyStrategy:
      aiParsed?.keyStrategy ||
      "상대방의 감정선을 자극하지 않으면서 핵심 조건·기한을 명확히 확인하고 기록으로 남기세요.",
    avoidPhrases:
      Array.isArray(aiParsed?.avoidPhrases) && aiParsed.avoidPhrases.length > 0
        ? aiParsed.avoidPhrases.map(String)
        : ["기한 없는 '천천히 주세요'", "검토 없는 즉시 확정", "감정적 추궁 표현"],
    rewriteOptions: {
      soft: aiParsed?.rewriteOptions?.soft || baseFallbackText,
      firm:
        aiParsed?.rewriteOptions?.firm ||
        `${contactName}님, 안녕하세요. ${goal || "진행 건"}에 대해 정확한 일정과 조건을 서면으로 확인하고자 연락드립니다. 금일 중 확인 후 회신 부탁드립니다.`,
      concise:
        aiParsed?.rewriteOptions?.concise ||
        `안녕하세요 ${contactName}님. ${goal || "논의 건"} 일정 확인 부탁드립니다. 감사합니다.`,
    },
    attachmentReminder,
  };
}

