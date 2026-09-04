import { queryTable, sendPhoneSms, listPhoneDevices } from "@/lib/egdesk-helpers";

export interface AdminSmsSettings {
  enabled: boolean;
  deviceId: string;
  adminPhone: string;
  notifyOnInquiry: boolean;
  notifyOnTaxInvoice: boolean;
  notifyOnPayment: boolean;
}

export const DEFAULT_SMS_SETTINGS: AdminSmsSettings = {
  enabled: true,
  deviceId: "devmspmxh9g",
  adminPhone: "010-7216-5884",
  notifyOnInquiry: true,
  notifyOnTaxInvoice: true,
  notifyOnPayment: true,
};

/**
 * DB에서 관리자 SMS 설정 조회
 */
export async function getAdminSmsSettings(): Promise<AdminSmsSettings> {
  try {
    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_sms_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    if (validRows.length > 0 && validRows[0].value) {
      const parsed = JSON.parse(validRows[0].value);
      return { ...DEFAULT_SMS_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("[AdminSMS] Failed to read settings, using default:", err);
  }
  return DEFAULT_SMS_SETTINGS;
}

/**
 * 관리할 주요 이벤트 발생 시 관리자에게 구글메시지 SMS 전송
 */
export async function sendAdminNotificationSms(
  eventType: "inquiry" | "tax_invoice" | "payment",
  payload: {
    userName?: string;
    userEmail?: string;
    title?: string;
    amount?: number;
    companyName?: string;
    extra?: string;
    ruleName?: string;
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    const settings = await getAdminSmsSettings();

    if (!settings.enabled) {
      return { success: false, message: "SMS 알림 기능이 비활성화되어 있습니다." };
    }

    if (!settings.deviceId || !settings.adminPhone) {
      return { success: false, message: "발송 디바이스 또는 관리자 전화번호가 등록되지 않았습니다." };
    }

    // 이벤트별 활성화 여부 확인
    if (eventType === "inquiry" && !settings.notifyOnInquiry) {
      return { success: false, message: "문의 알림이 꺼져 있습니다." };
    }
    if (eventType === "tax_invoice" && !settings.notifyOnTaxInvoice) {
      return { success: false, message: "세금계산서 알림이 꺼져 있습니다." };
    }
    if (eventType === "payment" && !settings.notifyOnPayment) {
      return { success: false, message: "결제 알림이 꺼져 있습니다." };
    }

    // 메시지 본문 조립
    let smsText = "";
    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    switch (eventType) {
      case "inquiry":
        smsText = `[SheetBot] 새 1:1 문의 접수\n- 작성자: ${payload.userEmail || payload.userName || "고객"}\n- 제목: ${payload.title || "문의"}\n- 접수일시: ${nowStr}\n관리자 센터에서 답변을 확인해 주세요.`;
        break;
      case "tax_invoice":
        smsText = `[SheetBot] 세금계산서 발행 신청 접수\n- 신청기업: ${payload.companyName || "고객사"}\n- 신청금액: ${(payload.amount || 0).toLocaleString()}원\n- 신청자: ${payload.userEmail}\n- 접수일시: ${nowStr}`;
        break;
      case "payment":
        smsText = `[SheetBot] 유료 토큰 결제 완료\n- 회원: ${payload.userEmail}\n- 패키지: ${payload.title || "토큰 충전"}\n- 결제금액: ${(payload.amount || 0).toLocaleString()}원\n- 일시: ${nowStr}`;
        break;
    }

    // 전화번호 정제 (하이픈 제거)
    const cleanPhone = settings.adminPhone.replace(/[^0-9]/g, "");

    // EGDesk 구글메시지 MCP 전송 호출
    try {
      await sendPhoneSms({
        deviceId: settings.deviceId,
        phoneNumber: cleanPhone,
        message: smsText,
        isMarketing: false, // 시스템 관리자 알림이므로 광고성 문구 제외
      });

      // 발송 성공 이력 기록
      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      recordDispatchLog({
        channel: "SMS",
        eventType,
        ruleName: payload.ruleName || "관리자 기본 SMS 알림",
        recipient: settings.adminPhone,
        recipientType: "ADMIN",
        title: `[SMS] ${payload.title || eventType}`,
        content: smsText,
        status: "SUCCESS",
      }).catch((logErr) => console.warn("[AdminSMS Log Error]", logErr));

      return { success: true, message: "관리자 SMS 발송 완료" };
    } catch (sendErr: any) {
      // 발송 실패 이력 기록
      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      recordDispatchLog({
        channel: "SMS",
        eventType,
        ruleName: payload.ruleName || "관리자 기본 SMS 알림",
        recipient: settings.adminPhone,
        recipientType: "ADMIN",
        title: `[SMS] ${payload.title || eventType}`,
        content: smsText,
        status: "FAILED",
        errorMessage: sendErr.message,
      }).catch((logErr) => console.warn("[AdminSMS Log Error]", logErr));

      throw sendErr;
    }
  } catch (err: any) {
    console.error("[AdminSMS] Send SMS error:", err);
    return { success: false, message: err.message };
  }
}
