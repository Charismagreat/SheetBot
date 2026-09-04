export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { sendSystemEmail } from "@/lib/admin-email";

export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { testEmail, host, port, user, pass, fromName } = body;

    if (!testEmail || !testEmail.includes("@")) {
      return NextResponse.json({ success: false, error: "올바른 테스트 수신 이메일 주소를 입력해 주세요." }, { status: 400 });
    }

    if (!user || !pass) {
      return NextResponse.json({ success: false, error: "발송용 이메일 주소(ID)와 앱 비밀번호를 먼저 입력해 주세요." }, { status: 400 });
    }

    const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const res = await sendSystemEmail({
      to: testEmail.trim(),
      subject: `[SheetBot] SMTP 메일 발송 연동 테스트 성공 안내`,
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background: #ffffff;">
          <div style="margin-bottom: 20px;">
            <span style="background: #ecfdf5; color: #059669; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 9999px; border: 1px solid #a7f3d0;">
              연동 테스트 성공
            </span>
          </div>
          <h2 style="color: #0f172a; margin: 0 0 12px 0; font-size: 20px; font-weight: 900;">
            SheetBot SMTP 메일 서버 연동 성공!
          </h2>
          <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
            관리자 센터에서 설정하신 SMTP 발송 계정이 정상적으로 동작하고 있습니다.<br/>
            이제 1:1 고객 문의, 세금계산서 신청, 토큰 결제 알림 메일이 안전하게 자동 발송됩니다.
          </p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 12px; color: #334155; line-height: 1.8;">
              <tr><td style="width: 120px; font-weight: bold; color: #64748b;">SMTP 호스트</td><td>${host || "smtp.gmail.com"}:${port || 465}</td></tr>
              <tr><td style="font-weight: bold; color: #64748b;">발송 계정</td><td>${user}</td></tr>
              <tr><td style="font-weight: bold; color: #64748b;">발송자 명칭</td><td>${fromName || "SheetBot"}</td></tr>
              <tr><td style="font-weight: bold; color: #64748b;">수신 테스트 주소</td><td style="color: #4f46e5; font-weight: bold;">${testEmail}</td></tr>
              <tr><td style="font-weight: bold; color: #64748b;">테스트 발송 시각</td><td>${nowStr}</td></tr>
            </table>
          </div>

          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            본 메일은 SheetBot 관리자 설정 페이지의 [실시간 메일 연동 테스트] 요청에 의해 발송되었습니다.
          </p>
        </div>
      `,
      smtpConfig: {
        host: host || "smtp.gmail.com",
        port: Number(port) || 465,
        user: user.trim(),
        pass: pass.trim(),
        fromName: fromName || "SheetBot",
      },
      eventType: "test",
      ruleName: "관리자 SMTP 테스트 발송",
      recipientType: "ADMIN",
    });

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error || "메일 전송에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `[${testEmail}] 주소로 테스트 이메일이 성공적으로 발송되었습니다. 메일함을 확인해 주세요!`,
    });
  } catch (err: any) {
    console.error("[AdminEmail Test] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "테스트 발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
