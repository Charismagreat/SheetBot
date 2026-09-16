export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, listPhoneDevices, sendPhoneSms } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_SMS_SETTINGS, AdminSmsSettings } from "@/lib/admin-sms";
import { sendSystemEmail } from "@/lib/admin-email";
import { recordDispatchLog } from "@/lib/dispatch-logger";

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const {
      inquiryId,
      source,
      channel, // "SMS" | "EMAIL"
      recipient, // 휴대폰 번호 또는 이메일
      customerName,
      message,
      subject,
      saveAsAnswer = true,
    } = body;

    if (!channel || !["SMS", "EMAIL"].includes(channel)) {
      return NextResponse.json({ success: false, error: "올바른 발송 채널(SMS 또는 EMAIL)을 지정해 주세요." }, { status: 400 });
    }

    if (!recipient || !recipient.trim()) {
      return NextResponse.json({ success: false, error: "수신자 정보(전화번호 또는 이메일)가 필요합니다." }, { status: 400 });
    }

    if (!message || !message.trim()) {
      return NextResponse.json({ success: false, error: "발송할 메시지(답변) 내용을 입력해 주세요." }, { status: 400 });
    }

    const trimmedMsg = message.trim();
    const now = new Date().toISOString();
    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // ==========================================
    // 1. [SMS 채널] 스마트폰 0원 문자 발송
    // ==========================================
    if (channel === "SMS") {
      const cleanPhone = recipient.replace(/[^0-9]/g, "");
      if (cleanPhone.length < 9) {
        return NextResponse.json({ success: false, error: "유효하지 않은 수신 전화번호입니다." }, { status: 400 });
      }

      // 1) SMS 설정에서 기본 deviceId 조회
      const settingsRes = await queryTable("sheetbot_settings", {
        filters: { key: "sheetbot_sms_settings" },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      let deviceId = DEFAULT_SMS_SETTINGS.deviceId;
      const validRows = (settingsRes.rows || []).filter((r: any) => !r.deleted_at);
      if (validRows.length > 0 && validRows[0].value) {
        try {
          const parsed = JSON.parse(validRows[0].value);
          if (parsed.deviceId) deviceId = parsed.deviceId;
        } catch {}
      }

      // 2) 만약 디바이스가 없거나 기본값이면 MCP 디바이스 목록에서 활성 디바이스 자동 탐지
      if (!deviceId || deviceId === "default") {
        try {
          const devList = await listPhoneDevices();
          let devArr: any[] = [];
          if (Array.isArray(devList)) devArr = devList;
          else if (devList && Array.isArray((devList as any).devices)) devArr = (devList as any).devices;
          else if (typeof devList === "string") {
            try { devArr = JSON.parse(devList); } catch {}
          }
          if (devArr.length > 0) {
            const activeDev = devArr.find((d: any) => d.status === "CONNECTED" || d.connected) || devArr[0];
            deviceId = activeDev.id || activeDev.deviceId || deviceId;
          }
        } catch (e) {
          console.warn("[AdminReply SMS] Device auto-detect failed:", e);
        }
      }

      if (!deviceId) {
        return NextResponse.json(
          {
            success: false,
            error: "연동된 스마트폰 디바이스가 없습니다. [관리자 설정 > SMS 구글메시지]에서 스마트폰을 먼저 연결해 주세요.",
          },
          { status: 400 }
        );
      }

      // 3) SMS 메시지 포맷 조립
      const formattedSms = `[SheetBot 고객센터]\n${customerName ? `${customerName} 고객님, ` : ""}문의하신 사항에 대한 공식 답변 안내드립니다.\n\n${trimmedMsg}\n\n■ 상세 확인: https://sheetbot.cloud/contact\n■ 발송시각: ${nowStr}`;

      try {
        const smsRes = await sendPhoneSms({
          deviceId,
          phoneNumber: cleanPhone,
          message: formattedSms,
          isMarketing: false,
        });

        // 발송 성공 감사 로그 기록
        recordDispatchLog({
          channel: "SMS",
          eventType: "inquiry",
          ruleName: "고객 문의 0원 스마트폰 회신",
          recipient: cleanPhone,
          recipientType: "CUSTOMER",
          title: "[SheetBot] 고객 문의 답변 안내",
          content: formattedSms,
          status: "SUCCESS",
        }).catch((e) => console.warn("[Reply SMS Log Error]", e));

        // 4) 문의 상태 자동 완료 업데이트
        if (saveAsAnswer && inquiryId) {
          await updateInquiryStatus(inquiryId, source, trimmedMsg, adminEmail, now);
        }

        return NextResponse.json({
          success: true,
          channel: "SMS",
          message: `[${cleanPhone}] 번호로 0원 스마트폰 문자가 성공적으로 발송되었습니다.`,
          result: smsRes,
        });
      } catch (smsErr: any) {
        recordDispatchLog({
          channel: "SMS",
          eventType: "inquiry",
          ruleName: "고객 문의 0원 스마트폰 회신",
          recipient: cleanPhone,
          recipientType: "CUSTOMER",
          title: "[SheetBot] 고객 문의 답변 안내",
          content: formattedSms,
          status: "FAILED",
          errorMessage: smsErr.message,
        }).catch((e) => console.warn("[Reply SMS Log Error]", e));

        return NextResponse.json(
          { success: false, error: `문자 발송 실패: ${smsErr.message || "스마트폰 연결 상태를 확인해 주세요."}` },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // 2. [EMAIL 채널] 공식 브랜드 HTML 메일 발송
    // ==========================================
    if (channel === "EMAIL") {
      const cleanEmail = recipient.trim();
      if (!cleanEmail.includes("@")) {
        return NextResponse.json({ success: false, error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
      }

      const emailSubject = subject?.trim() || `[SheetBot] 문의하신 사항에 대해 공식 답변을 안내해 드립니다`;

      // 공식 HTML 메일 템플릿 생성
      const emailHtml = `
        <div style="font-family: 'Apple SD Gothic Neo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 36px 28px; border: 1px solid #e2e8f0; border-radius: 24px; background: #ffffff; color: #0f172a;">
          <!-- 헤더 브랜딩 -->
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 18px; margin-bottom: 24px;">
            <table style="width: 100%;">
              <tr>
                <td>
                  <span style="font-size: 22px; font-weight: 900; color: #047857; letter-spacing: -0.5px;">SheetBot</span>
                  <span style="font-size: 11px; font-weight: 900; color: #64748b; margin-left: 6px; text-transform: uppercase;">Enterprise AX</span>
                </td>
                <td style="text-align: right;">
                  <span style="background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 9999px; border: 1px solid #a7f3d0;">
                    공식 상담 회신
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- 인사말 -->
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0; line-height: 1.4;">
            ${customerName ? `${customerName} 고객님, ` : ""}안녕하세요.<br/>
            SheetBot 고객 지원 센터입니다.
          </h2>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
            고객님께서 문의해 주신 소중한 내용에 대해 솔루션 전문 컨설턴트의 검토 결과를 안내해 드립니다.
          </p>

          <!-- 공식 답변 내용 박스 -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 16px; padding: 22px; margin-bottom: 26px;">
            <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 4px;">
              <span>💬</span> <span>공식 회신 내용</span>
            </div>
            <div style="font-size: 13px; color: #1e293b; line-height: 1.8; white-space: pre-wrap; word-break: break-word;">
              ${escapeHtml(trimmedMsg)}
            </div>
          </div>

          <!-- 추가 안내 및 버튼 -->
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="https://sheetbot.cloud/contact" target="_blank" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 800; padding: 12px 24px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              🚀 SheetBot 서비스 바로가기
            </a>
          </div>

          <!-- 푸터 -->
          <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; font-size: 11px; color: #94a3b8; line-height: 1.6;">
            <p style="margin: 0 0 4px 0;">
              본 메일은 고객님의 문의에 대한 공식 안내 메일입니다. 추가 문의사항이 있으시면 언제든 회신해 주시기 바랍니다.
            </p>
            <p style="margin: 0;">
              © SheetBot Enterprise AX Solutions. 서울특별시 강남구 테헤란로 152 | 대표 02-555-8900
            </p>
          </div>
        </div>
      `;

      try {
        const mailRes = await sendSystemEmail({
          to: cleanEmail,
          subject: emailSubject,
          text: trimmedMsg,
          html: emailHtml,
          eventType: "inquiry",
          ruleName: "고객 문의 공식 HTML 메일 회신",
          recipientType: "CUSTOMER",
        });

        if (!mailRes.success) {
          return NextResponse.json({ success: false, error: mailRes.error || "메일 전송에 실패했습니다." }, { status: 500 });
        }

        // 4) 문의 상태 자동 완료 업데이트
        if (saveAsAnswer && inquiryId) {
          await updateInquiryStatus(inquiryId, source, trimmedMsg, adminEmail, now);
        }

        return NextResponse.json({
          success: true,
          channel: "EMAIL",
          message: `[${cleanEmail}] 주소로 공식 안내 이메일이 성공적으로 발송되었습니다.`,
          result: mailRes,
        });
      } catch (mailErr: any) {
        return NextResponse.json(
          { success: false, error: `이메일 발송 실패: ${mailErr.message || "SMTP 설정을 확인해 주세요."}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (err: any) {
    console.error("[Admin Reply Omnichannel] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "발송 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// HTML 이스케이프 헬퍼
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 문의 대장 답변 및 상태 업데이트 헬퍼
async function updateInquiryStatus(
  inquiryId: string | number,
  source: string | undefined,
  answer: string,
  adminEmail: string,
  now: string
) {
  try {
    if (source === "ENTERPRISE_INQUIRY") {
      await updateRows("sheetbot_enterprise_inquiries", {
        filters: { id: inquiryId },
        updates: {
          answer,
          consultation_notes: answer,
          status: "COMPLETED",
          updated_at: now,
          updated_by: adminEmail,
        },
      });
    } else {
      await updateRows("sheetbot_inquiries", {
        filters: { id: inquiryId },
        updates: {
          answer,
          status: "ANSWERED",
          answered_at: now,
          updated_at: now,
          updated_by: adminEmail,
        },
      });
    }
  } catch (err) {
    console.warn("[AdminReply] Auto-update inquiry status failed:", err);
  }
}
