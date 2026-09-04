import { queryTable, sendPhoneSms, listPhoneDevices, checkPhoneDevice } from "@/lib/egdesk-helpers";
import { getAdminSmtpSettings, sendSystemEmail } from "@/lib/admin-email";
import { AdminSmsSettings, DEFAULT_SMS_SETTINGS } from "./admin-sms-types";
export * from "./admin-sms-types";

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
 * SMS 발송 장애 시 관리자 이메일로 긴급 자동 폴백(Fallback) 발송
 */
async function fallbackToAdminEmail(
  eventType: "inquiry" | "tax_invoice" | "payment",
  payload: {
    userName?: string;
    userEmail?: string;
    title?: string;
    amount?: number;
    companyName?: string;
    extra?: string;
    ruleName?: string;
  },
  smsText: string,
  failureReason: string
) {
  try {
    const smtpSettings = await getAdminSmtpSettings();
    if (!smtpSettings.enabled || !smtpSettings.user || !smtpSettings.pass) {
      console.warn("[AdminSMS Fallback] SMTP not configured, fallback email skipped.");
      return;
    }

    const targetEmail = smtpSettings.adminEmail || smtpSettings.user;
    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const subject = `[긴급 폴백] SMS 문자 발송 실패로 인한 긴급 이메일 통보: ${payload.title || eventType}`;
    const html = `
      <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 2px solid #ef4444; border-radius: 16px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="background-color: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 20px;">
            🚨 SMS 장애 자동 폴백(Fallback)
          </span>
        </div>
        <h2 style="color: #1e293b; margin: 0 0 8px 0; font-size: 18px;">
          구글메시지 발송 장애로 인해 알림이 이메일로 자동 전환되었습니다
        </h2>
        <p style="color: #64748b; font-size: 13px; margin-bottom: 16px;">
          <strong>장애 원인:</strong> ${failureReason}
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; font-size: 13px; color: #334155; line-height: 1.7;">
          <div style="font-weight: bold; color: #0f172a; margin-bottom: 8px;">[원래 전송 예정이던 문자 내용]</div>
          <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">${smsText}</pre>
        </div>
        <div style="margin-top: 16px; font-size: 12px; color: #94a3b8; text-align: right;">
          발생시각: ${nowStr}
        </div>
      </div>
    `;

    await sendSystemEmail({
      to: targetEmail,
      subject,
      text: `[SMS 장애 폴백]\n${failureReason}\n\n${smsText}`,
      html,
      eventType,
      ruleName: `${payload.ruleName || "기본 SMS"} (이메일 폴백 전환)`,
      recipientType: "ADMIN",
    });

    console.info(`[AdminSMS Fallback] Successfully dispatched fallback email to ${targetEmail}`);
  } catch (fallbackErr) {
    console.error("[AdminSMS Fallback] Failed to dispatch fallback email:", fallbackErr);
  }
}

/**
 * 관리할 주요 이벤트 발생 시 관리자에게 구글메시지 SMS 전송
 * (기기 상태 사전 점검 + 발송 실패 시 이메일 자동 폴백 지원)
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
): Promise<{ success: boolean; message?: string; fallback?: boolean }> {
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

    // 1단계: 기기 사전 헬스체크 (Phone MCP phone_check)
    let deviceOnline = true;
    let checkReason = "";
    try {
      const checkRes = await checkPhoneDevice(settings.deviceId);
      let parsed = checkRes;
      if (typeof checkRes === "string") {
        try { parsed = JSON.parse(checkRes); } catch {}
      }
      if (parsed?.paired === false || (parsed?.device && parsed.device.status !== "paired")) {
        deviceOnline = false;
        checkReason = "스마트폰이 페어링되어 있지 않거나 오프라인 상태입니다.";
      }
    } catch (checkErr: any) {
      // 체크 API 실패 시에도 우선 발송 시도를 이어가되 경고 로깅
      console.warn("[AdminSMS] Device pre-check warning:", checkErr.message);
    }

    // 기기가 확실하게 오프라인인 경우 즉시 이메일 폴백
    if (!deviceOnline) {
      const errReason = `[기기 오프라인 감지] ${checkReason}`;
      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      await recordDispatchLog({
        channel: "SMS",
        eventType,
        ruleName: payload.ruleName || "관리자 기본 SMS 알림",
        recipient: settings.adminPhone,
        recipientType: "ADMIN",
        title: `[SMS] ${payload.title || eventType}`,
        content: smsText,
        status: "FAILED",
        errorMessage: `${errReason} (이메일로 자동 전환)`,
      }).catch((logErr) => console.warn("[AdminSMS Log Error]", logErr));

      // 자동 이메일 폴백 실행
      await fallbackToAdminEmail(eventType, payload, smsText, errReason);

      return {
        success: false,
        fallback: true,
        message: "휴대폰 기기가 오프라인 상태여서 관리자 이메일로 자동 전환 발송되었습니다.",
      };
    }

    // 2단계: EGDesk 구글메시지 MCP 전송 호출
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
      const errReason = `[발송 전송 오류] ${sendErr.message}`;

      // 발송 실패 이력 기록
      const { recordDispatchLog } = await import("@/lib/dispatch-logger");
      await recordDispatchLog({
        channel: "SMS",
        eventType,
        ruleName: payload.ruleName || "관리자 기본 SMS 알림",
        recipient: settings.adminPhone,
        recipientType: "ADMIN",
        title: `[SMS] ${payload.title || eventType}`,
        content: smsText,
        status: "FAILED",
        errorMessage: `${errReason} (이메일로 자동 전환)`,
      }).catch((logErr) => console.warn("[AdminSMS Log Error]", logErr));

      // 발송 실패 시에도 즉시 이메일 폴백
      await fallbackToAdminEmail(eventType, payload, smsText, errReason);

      return {
        success: false,
        fallback: true,
        message: `SMS 발송 실패(${sendErr.message})로 인해 관리자 이메일로 자동 전환 발송되었습니다.`,
      };
    }
  } catch (err: any) {
    console.error("[AdminSMS] Send SMS error:", err);
    return { success: false, message: err.message };
  }
}
