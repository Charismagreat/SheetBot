export interface SmartDispatchRule {
  id: string;
  name: string;
  prompt: string;
  triggerEvent: "inquiry" | "tax_invoice" | "payment" | "all";
  channels: ("sms" | "email")[];
  targetRecipient: "admin" | "customer" | "both";
  conditionSummary: string;
  minAmount?: number;
  enabled: boolean;
  created_at: string;
}

export const DEFAULT_SMART_RULES: SmartDispatchRule[] = [
  {
    id: "rule_inquiry_default",
    name: "1:1 문의 접수 시 관리자 SMS & 고객 확인 메일",
    prompt: "고객 문의가 등록되면 관리자 휴대폰으로 문자를 보내고, 고객에게는 접수 완료 이메일을 보내줘",
    triggerEvent: "inquiry",
    channels: ["sms", "email"],
    targetRecipient: "both",
    conditionSummary: "모든 1:1 고객 문의 등록 시 즉시 발송",
    enabled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule_tax_default",
    name: "세금계산서 신청 접수 시 관리자 문자/메일 동시 알림",
    prompt: "세금계산서나 현금영수증 신청이 접수되면 관리자에게 문자와 이메일로 즉시 알려줘",
    triggerEvent: "tax_invoice",
    channels: ["sms", "email"],
    targetRecipient: "admin",
    conditionSummary: "전자세금계산서 / 현금영수증 발행 신청 시",
    enabled: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "rule_payment_default",
    name: "유료 토큰 결제 완료 시 관리자 문자 통보",
    prompt: "토큰 충전 결제가 발생하면 관리자에게 알림 문자를 발송해줘",
    triggerEvent: "payment",
    channels: ["sms"],
    targetRecipient: "admin",
    conditionSummary: "유료 요금제 / 토큰 패키지 결제 승인 시",
    enabled: true,
    created_at: new Date().toISOString(),
  },
];
