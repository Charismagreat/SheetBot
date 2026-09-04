import { queryTable, insertRows, updateRows, callAiCaller } from "@/lib/egdesk-helpers";
import { sendAdminNotificationSms } from "@/lib/admin-sms";
import { sendSystemEmail, getAdminSmtpSettings } from "@/lib/admin-email";
import { SmartDispatchRule, DEFAULT_SMART_RULES } from "./smart-dispatch-types";
export * from "./smart-dispatch-types";

/**
 * DB에서 스마트 발송 규칙 목록 조회
 */
export async function getSmartDispatchRules(): Promise<SmartDispatchRule[]> {
  try {
    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_smart_rules" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    if (validRows.length > 0 && validRows[0].value) {
      const parsed = JSON.parse(validRows[0].value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[SmartRules] Failed to load rules, using defaults:", err);
  }
  return DEFAULT_SMART_RULES;
}

/**
 * DB에 스마트 발송 규칙 목록 저장
 */
export async function saveSmartDispatchRules(rules: SmartDispatchRule[], adminEmail: string = "admin@sheetbot.io"): Promise<void> {
  const now = new Date().toISOString();
  const valString = JSON.stringify(rules);

  const existRes = await queryTable("sheetbot_settings", {
    filters: { key: "sheetbot_smart_rules" },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  if (existRes.rows && existRes.rows.length > 0) {
    await updateRows("sheetbot_settings", {
      filters: { key: "sheetbot_smart_rules" },
      updates: {
        value: valString,
        description: "AI 자연어 기반 스마트 발송 규칙 목록",
        updated_at: now,
        updated_by: adminEmail,
      },
    });
  } else {
    await insertRows("sheetbot_settings", [
      {
        id: `set_rules_${Date.now()}`,
        key: "sheetbot_smart_rules",
        value: valString,
        description: "AI 자연어 기반 스마트 발송 규칙 목록",
        created_at: now,
        updated_at: now,
        updated_by: adminEmail,
        deleted_at: null,
      },
    ]);
  }
}

/**
 * callAiCaller를 활용하여 사용자의 자연어 명령을 정형화된 SmartDispatchRule로 파싱
 */
export async function parseNaturalLanguageRule(prompt: string): Promise<SmartDispatchRule> {
  const systemPrompt = `당신은 SheetBot의 알림 규칙을 파싱하는 AI 분석관입니다.
사용자가 입력한 자연어 발송 조건을 분석하여 반드시 다음 JSON 형식으로만 응답하세요. 다른 설명 문구는 일체 넣지 마세요:
{
  "name": "규칙 요약 이름 (예: 1:1 문의 접수 시 문자 & 메일 발송)",
  "triggerEvent": "inquiry" 또는 "tax_invoice" 또는 "payment" 또는 "all",
  "channels": ["sms", "email"] 중 포함될 채널 배열,
  "targetRecipient": "admin" 또는 "customer" 또는 "both",
  "conditionSummary": "이 규칙이 발송되는 조건 요약 (예: 모든 신규 문의 등록 시)",
  "minAmount": 금액 조건이 있을 경우 숫자(원 단위, 없으면 0)
}`;

  try {
    const aiRes = await callAiCaller(
      `${systemPrompt}\n\n사용자 자연어 요청: "${prompt}"`,
      { temperature: 0.1 }
    );

    const text = typeof aiRes === "string" ? aiRes : aiRes?.text || aiRes?.content || "";
    // JSON 블록 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: parsed.name || "자연어 발송 규칙",
        prompt: prompt.trim(),
        triggerEvent: ["inquiry", "tax_invoice", "payment", "all"].includes(parsed.triggerEvent) ? parsed.triggerEvent : "all",
        channels: Array.isArray(parsed.channels) && parsed.channels.length > 0 ? parsed.channels : ["sms", "email"],
        targetRecipient: ["admin", "customer", "both"].includes(parsed.targetRecipient) ? parsed.targetRecipient : "both",
        conditionSummary: parsed.conditionSummary || "자연어 조건 일치 시",
        minAmount: Number(parsed.minAmount) || undefined,
        enabled: true,
        created_at: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn("[SmartRules] AI parsing fallback:", err);
  }

  // 지능형 규칙 폴백 (Rule-based Fallback)
  const lower = prompt.toLowerCase();
  const hasSms = lower.includes("문자") || lower.includes("sms") || lower.includes("메시지") || lower.includes("폰");
  const hasEmail = lower.includes("메일") || lower.includes("이메일") || lower.includes("email");
  const channels: ("sms" | "email")[] = [];
  if (hasSms) channels.push("sms");
  if (hasEmail) channels.push("email");
  if (channels.length === 0) channels.push("sms", "email");

  let triggerEvent: SmartDispatchRule["triggerEvent"] = "all";
  let conditionSummary = "자연어 조건 일치 시";
  if (lower.includes("문의") || lower.includes("질문") || lower.includes("상담")) {
    triggerEvent = "inquiry";
    conditionSummary = "신규 1:1 고객 문의 접수 시";
  } else if (lower.includes("세금") || lower.includes("계산서") || lower.includes("영수증")) {
    triggerEvent = "tax_invoice";
    conditionSummary = "세금계산서 / 현금영수증 신청 시";
  } else if (lower.includes("결제") || lower.includes("토큰") || lower.includes("충전") || lower.includes("요금제")) {
    triggerEvent = "payment";
    conditionSummary = "유료 결제 완료 시";
  }

  let targetRecipient: SmartDispatchRule["targetRecipient"] = "admin";
  if ((lower.includes("고객") || lower.includes("회원")) && lower.includes("관리자")) {
    targetRecipient = "both";
  } else if (lower.includes("고객") || lower.includes("회원")) {
    targetRecipient = "customer";
  }

  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: `${conditionSummary} [${channels.join("+").toUpperCase()}] 자동 발송`,
    prompt: prompt.trim(),
    triggerEvent,
    channels,
    targetRecipient,
    conditionSummary,
    enabled: true,
    created_at: new Date().toISOString(),
  };
}

/**
 * 비즈니스 이벤트 발생 시 등록된 자연어 기반 스마트 규칙들을 매칭하여 실행
 */
export async function executeSmartDispatchRules(
  eventType: "inquiry" | "tax_invoice" | "payment",
  payload: {
    userEmail: string;
    userName?: string;
    title?: string;
    content?: string;
    amount?: number;
    companyName?: string;
  }
): Promise<void> {
  try {
    const rules = await getSmartDispatchRules();
    const activeRules = rules.filter((r) => r.enabled);

    for (const rule of activeRules) {
      // 1. 이벤트 타입 매칭
      if (rule.triggerEvent !== "all" && rule.triggerEvent !== eventType) {
        continue;
      }

      // 2. 금액 조건 확인
      if (rule.minAmount && rule.minAmount > 0) {
        if ((payload.amount || 0) < rule.minAmount) {
          continue;
        }
      }

      // 3. 발송 채널별 실행
      if (rule.channels.includes("sms")) {
        if (rule.targetRecipient === "admin" || rule.targetRecipient === "both") {
          sendAdminNotificationSms(eventType, {
            userName: payload.userName,
            userEmail: payload.userEmail,
            title: payload.title,
            amount: payload.amount,
            companyName: payload.companyName,
          }).catch((e) => console.warn("[SmartRules SMS Error]", e));
        }
      }

      if (rule.channels.includes("email")) {
        const smtp = await getAdminSmtpSettings();
        if (smtp.enabled && smtp.user && smtp.pass) {
          const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
          // 관리자 발송
          if (rule.targetRecipient === "admin" || rule.targetRecipient === "both") {
            const adminTo = smtp.adminEmail || smtp.user;
            sendSystemEmail({
              to: adminTo,
              subject: `[SheetBot 자동알림] ${rule.name} - ${payload.title || payload.companyName || eventType}`,
              html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                  <div style="font-size: 11px; color: #4f46e5; font-weight: bold; margin-bottom: 6px;">
                    ✨ AI 스마트 발송 규칙 적용: ${rule.prompt}
                  </div>
                  <h3 style="color: #0f172a; margin-top: 0;">${rule.name}</h3>
                  <p style="font-size: 13px; color: #475569;">${rule.conditionSummary}</p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
                  <div style="font-size: 12px; color: #334155; line-height: 1.6;">
                    <strong>회원/고객:</strong> ${payload.userEmail}<br/>
                    ${payload.title ? `<strong>제목:</strong> ${payload.title}<br/>` : ""}
                    ${payload.amount ? `<strong>금액:</strong> ${payload.amount.toLocaleString()}원<br/>` : ""}
                    <strong>발송일시:</strong> ${nowStr}
                  </div>
                </div>
              `,
            }).catch((e) => console.warn("[SmartRules Admin Email Error]", e));
          }

          // 고객 발송 (고객 이메일이 있는 경우)
          if ((rule.targetRecipient === "customer" || rule.targetRecipient === "both") && payload.userEmail) {
            sendSystemEmail({
              to: payload.userEmail,
              subject: `[SheetBot] 안내 말씀드립니다: ${payload.title || "서비스 알림"}`,
              html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                  <h3 style="color: #059669; margin-top: 0;">SheetBot 알림 안내</h3>
                  <p style="font-size: 13px; color: #334155; line-height: 1.6;">
                    고객님의 요청사항(${payload.title || "비즈니스 작업"})이 정상적으로 접수 및 처리되고 있습니다.<br/>
                    궁금하신 사항은 언제든 고객센터로 문의해 주시기 바랍니다.
                  </p>
                  <p style="font-size: 11px; color: #94a3b8; margin-top: 16px;">감사합니다.<br/>SheetBot 팀</p>
                </div>
              `,
            }).catch((e) => console.warn("[SmartRules Customer Email Error]", e));
          }
        }
      }
    }
  } catch (err) {
    console.warn("[SmartRules] executeSmartDispatchRules warning:", err);
  }
}
