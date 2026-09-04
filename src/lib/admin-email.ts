import nodemailer from "nodemailer";
import { queryTable } from "@/lib/egdesk-helpers";
import { AdminSmtpSettings, DEFAULT_SMTP_SETTINGS } from "./admin-email-types";
export * from "./admin-email-types";

/**
 * DB에서 SMTP 설정 조회
 */
export async function getAdminSmtpSettings(): Promise<AdminSmtpSettings> {
  try {
    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_smtp_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    if (validRows.length > 0 && validRows[0].value) {
      const parsed = JSON.parse(validRows[0].value);
      return { ...DEFAULT_SMTP_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn("[AdminEmail] Failed to read SMTP settings, using default:", err);
  }
  return DEFAULT_SMTP_SETTINGS;
}

/**
 * 이메일 발송 기본 함수
 */
export async function sendSystemEmail(options: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  smtpConfig?: Partial<AdminSmtpSettings>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = options.smtpConfig 
      ? { ...DEFAULT_SMTP_SETTINGS, ...options.smtpConfig }
      : await getAdminSmtpSettings();

    if (!settings.user || !settings.pass) {
      return { success: false, error: "SMTP 발송 계정(아이디 또는 앱 비밀번호)이 설정되지 않았습니다." };
    }

    const transporter = nodemailer.createTransport({
      host: settings.host || "smtp.gmail.com",
      port: Number(settings.port) || 465,
      secure: Number(settings.port) === 465,
      auth: {
        user: settings.user,
        pass: settings.pass.replace(/\s+/g, ""), // 공백 제거
      },
    });

    const fromAddress = `"${settings.fromName || "SheetBot"}" <${settings.user}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error("[AdminEmail] sendSystemEmail error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 비즈니스 이벤트 발생 시 관리자 및 고객에게 알림 메일 발송
 */
export async function sendAdminNotificationEmail(
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
    const settings = await getAdminSmtpSettings();
    if (!settings.enabled || !settings.user || !settings.pass) return;

    const targetAdminEmail = settings.adminEmail || settings.user;
    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    switch (eventType) {
      case "inquiry": {
        if (!settings.notifyOnInquiry) break;
        // 1. 관리자에게 알림
        await sendSystemEmail({
          to: targetAdminEmail,
          subject: `[SheetBot] 새 1:1 고객 문의가 접수되었습니다: ${payload.title}`,
          html: `
            <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 16px;">
              <h2 style="color: #4f46e5; margin-bottom: 8px;">새 1:1 고객 문의 접수 안내</h2>
              <p style="color: #64748b; font-size: 13px;">고객으로부터 새로운 문의가 등록되었습니다.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
              <table style="width: 100%; font-size: 13px; color: #334155; line-height: 1.6;">
                <tr><td style="width: 90px; font-weight: bold;">작성자</td><td>${payload.userName || "고객"} (${payload.userEmail})</td></tr>
                <tr><td style="font-weight: bold;">문의 제목</td><td style="font-weight: bold; color: #1e293b;">${payload.title}</td></tr>
                <tr><td style="font-weight: bold;">접수 일시</td><td>${nowStr}</td></tr>
              </table>
              <div style="margin-top: 16px; padding: 14px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #334155; white-space: pre-line;">
                ${payload.content || "(내용 없음)"}
              </div>
              <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">SheetBot 관리자 센터에서 확인 후 답변하실 수 있습니다.</p>
            </div>
          `,
        });

        // 2. 문의 등록한 고객에게 접수 확인 메일 발송
        if (payload.userEmail) {
          await sendSystemEmail({
            to: payload.userEmail,
            subject: `[SheetBot] 문의가 정상적으로 접수되었습니다.`,
            html: `
              <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
                <h2 style="color: #059669; margin-bottom: 8px;">문의 접수 확인</h2>
                <p style="color: #64748b; font-size: 13px;">안녕하세요! SheetBot 고객지원팀입니다.</p>
                <p style="color: #334155; font-size: 13px; line-height: 1.6;">
                  고객님께서 남겨주신 문의가 안전하게 접수되었습니다.<br/>
                  영업일 기준 24시간 이내에 신속하고 정확하게 답변드리겠습니다.
                </p>
                <div style="margin: 16px 0; padding: 14px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #334155;">
                  <strong>문의 제목:</strong> ${payload.title}
                </div>
                <p style="font-size: 12px; color: #94a3b8;">감사합니다.<br/>SheetBot 팀 드림</p>
              </div>
            `,
          });
        }
        break;
      }

      case "tax_invoice": {
        if (!settings.notifyOnTaxInvoice) break;
        await sendSystemEmail({
          to: targetAdminEmail,
          subject: `[SheetBot] 세금계산서 발행 신청 접수: ${payload.companyName}`,
          html: `
            <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
              <h2 style="color: #0284c7; margin-bottom: 8px;">세금계산서 발행 신청 접수</h2>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
              <table style="width: 100%; font-size: 13px; color: #334155; line-height: 1.6;">
                <tr><td style="width: 90px; font-weight: bold;">신청 기업</td><td>${payload.companyName || "고객사"}</td></tr>
                <tr><td style="font-weight: bold;">신청자</td><td>${payload.userEmail}</td></tr>
                <tr><td style="font-weight: bold;">신청 금액</td><td style="color: #0284c7; font-weight: bold;">${(payload.amount || 0).toLocaleString()}원</td></tr>
                <tr><td style="font-weight: bold;">접수 일시</td><td>${nowStr}</td></tr>
              </table>
            </div>
          `,
        });
        break;
      }

      case "payment": {
        if (!settings.notifyOnPayment) break;
        await sendSystemEmail({
          to: targetAdminEmail,
          subject: `[SheetBot] 유료 토큰 패키지 결제 완료: ${(payload.amount || 0).toLocaleString()}원`,
          html: `
            <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
              <h2 style="color: #d97706; margin-bottom: 8px;">유료 결제 완료 안내</h2>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
              <table style="width: 100%; font-size: 13px; color: #334155; line-height: 1.6;">
                <tr><td style="width: 90px; font-weight: bold;">결제 회원</td><td>${payload.userEmail}</td></tr>
                <tr><td style="font-weight: bold;">충전 상품</td><td>${payload.title || "토큰 패키지"}</td></tr>
                <tr><td style="font-weight: bold;">결제 금액</td><td style="color: #d97706; font-weight: bold;">${(payload.amount || 0).toLocaleString()}원</td></tr>
                <tr><td style="font-weight: bold;">결제 일시</td><td>${nowStr}</td></tr>
              </table>
            </div>
          `,
        });
        break;
      }
    }
  } catch (err) {
    console.warn("[AdminEmail] sendAdminNotificationEmail warning:", err);
  }
}
