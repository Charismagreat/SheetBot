export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { callGmailTool } from "@/lib/egdesk-helpers";
import { sendSystemEmail } from "@/lib/admin-email";
import { recordAiCopilotActivity } from "@/lib/ai-copilot-learning";
import { downloadDriveFileToLocalTemp } from "@/app/api/user/files/drive-download/route";

/**
 * POST /api/user/messages/email/send
 * 모바일 시트봇 AI 비서에서 구글 드라이브/PC 파일 이메일 전송 요청을 처리하고(실제 원본 파일 첨부 지원)
 * [SheetBot] AI 비서 활동 및 업무 학습 대장(구글 시트 + 파투 시트 + SQLite)에 발송 결과를 기록하는 엔드포인트
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      recipientEmail,
      fileId: rawFileId = "",
      fileName = "파일",
      mimeType: rawMimeType = "",
      fileSizeFormatted = "",
      subject = "",
      body: rawBody = "",
      webViewLink = "",
      webContentLink = "",
      userEmail: bodyEmail,
      mode = "DIRECT_SEND", // "DIRECT_SEND" (방식 A) | "LOG_METHOD_B" (방식 B: 스마트폰 메일 앱 선택 기록)
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail =
      bodyEmail && bodyEmail.includes("@")
        ? bodyEmail.toLowerCase().trim()
        : sessionEmail ||
          (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    const to = String(recipientEmail || "").trim();
    if (!to || !to.includes("@")) {
      return NextResponse.json(
        { success: false, error: "유효한 수신자 이메일 주소를 입력해 주세요." },
        { status: 400 }
      );
    }

    const linkIdMatch = (webViewLink || webContentLink || "").match(
      /(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{10,})/
    );
    const resolvedFileId =
      rawFileId && rawFileId !== "learned_file" ? String(rawFileId).trim() : linkIdMatch?.[1] || "";

    // [방식 B: 스마트폰 기본 메일 앱 발송 선택] 시트 및 학습 대장 기록 전용 분기
    if (mode === "LOG_METHOD_B") {
      await recordAiCopilotActivity({
        userEmail: userEmail || "anonymous",
        req,
        command: `[방식 B 선택] '${fileName}' 파일을 ${to} 앞으로 스마트폰 메일 앱(첨부파일 포함) 발송`,
        actionType: "EMAIL_DISPATCH",
        domainTag: "이메일발송",
        targetFile: fileName,
        fileId: resolvedFileId,
        fileSizeFormatted,
        webViewLink,
        webContentLink,
        targetEmail: to,
        targetRecipient: to,
        dispatchMethod: "방식 B (스마트폰 메일 앱 + 원본파일 첨부)",
        resultSummary: `📱 '${fileName}' 원본 파일을 첨부하여 [${to}] 앞으로 스마트폰 기본 메일 앱(방식 B) 발송 실행`,
        status: "SUCCESS",
      });

      return NextResponse.json({
        success: true,
        method: "LOCAL_MAIL_APP",
        recipientEmail: to,
        message: "스마트폰 메일 앱 발송 이력이 시트에 기록되었습니다.",
      });
    }

    const mailSubject =
      subject.trim() || `[SheetBot] ${fileName} 파일 공유 안내`;
    const mailBodyText =
      rawBody.trim() ||
      `안녕하세요.\n요청하신 [${fileName}] (${fileSizeFormatted}) 파일이 첨부되어 있습니다.\n\n▶ 구글 드라이브 바로보기:\n${webViewLink}\n\n▶ 파일 다운로드:\n${webContentLink}\n\n시트봇(SheetBot)에서 발송되었습니다.`;

    // 원본 파일을 구글 드라이브에서 로컬 임시 경로로 다운로드하여 실제 이메일 첨부파일(Attachment)로 준비
    const downloadedAttachment = resolvedFileId
      ? await downloadDriveFileToLocalTemp(resolvedFileId, fileName)
      : null;

    const mailHtml = `
      <div style="font-family: 'Pretendard', sans-serif, -apple-system, BlinkMacSystemFont; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF;">
        <div style="border-bottom: 2px solid #2563EB; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #1E293B; margin: 0; font-size: 20px;">🚀 SheetBot 파일 공유 안내</h2>
          <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">시트봇 AI 비서가 원본 첨부파일과 함께 공유해 드리는 메일입니다.</p>
        </div>
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="color: #0F172A; margin: 0 0 8px 0; font-size: 16px;">📎 ${fileName}</h3>
          ${fileSizeFormatted ? `<p style="color: #64748B; font-size: 13px; margin: 0;">용량: <strong>${fileSizeFormatted}</strong> ${downloadedAttachment ? "(메일에 원본 파일 직접 첨부됨)" : ""}</p>` : ""}
        </div>
        <div style="margin-bottom: 24px;">
          <a href="${webViewLink}" target="_blank" style="display: inline-block; background: #2563EB; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 14px; margin-right: 10px;">🔍 구글 드라이브 바로보기</a>
          ${webContentLink ? `<a href="${webContentLink}" target="_blank" style="display: inline-block; background: #059669; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 14px;">⬇️ 파일 다운로드</a>` : ""}
        </div>
        <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 20px 0;" />
        <p style="color: #94A3B8; font-size: 12px; margin: 0;">본 메일은 SheetBot AI 모바일 비서 시스템에서 자동 발송되었습니다.</p>
      </div>
    `;

    let dispatchSuccess = false;
    let dispatchMethod = "";
    let dispatchError = "";

    // 1차: 이지데스크 Gmail MCP 도구(개인 OAuth 또는 서비스 계정)로 원본 첨부 발송 시도
    try {
      const gmailArgs: Record<string, any> = {
        to,
        subject: mailSubject,
        body: mailBodyText,
      };
      if (downloadedAttachment) {
        gmailArgs.attachments = [
          {
            filename: fileName,
            path: downloadedAttachment.localPath,
            mimeType: rawMimeType || downloadedAttachment.mimeType,
          },
        ];
      }

      const gmailRes = await callGmailTool("gmail_send_message", gmailArgs).catch((e: any) => ({
        error: e.message,
      }));

      if (gmailRes && !gmailRes.error && gmailRes.success !== false) {
        dispatchSuccess = true;
        dispatchMethod = "GMAIL_MCP";
      } else {
        dispatchError = gmailRes?.error || "Gmail MCP 발송 불가";
      }
    } catch (e: any) {
      dispatchError = e.message;
    }

    // 2차: 사내 SMTP 발송 시도 (Admin SMTP + 원본 파일 첨부)
    if (!dispatchSuccess) {
      try {
        const smtpRes = await sendSystemEmail({
          to,
          subject: mailSubject,
          text: mailBodyText,
          html: mailHtml,
          attachments: downloadedAttachment
            ? [
                {
                  filename: fileName,
                  path: downloadedAttachment.localPath,
                  contentType: rawMimeType || downloadedAttachment.mimeType,
                },
              ]
            : undefined,
          eventType: "other",
          ruleName: "AI 비서 파일 공유 발송",
        });

        if (smtpRes.success) {
          dispatchSuccess = true;
          dispatchMethod = "SMTP";
        } else {
          dispatchError = smtpRes.error || dispatchError || "SMTP 발송 실패";
        }
      } catch (smtpErr: any) {
        dispatchError = smtpErr.message;
      }
    }

    // 통합 학습 대장(DB + 구글 시트 + 파투 시트) 기록
    await recordAiCopilotActivity({
      userEmail: userEmail || "anonymous",
      req,
      command: `[방식 A 선택] '${fileName}' 파일을 ${to} 앞으로 시트봇 자동 발송`,
      actionType: "EMAIL_DISPATCH",
      domainTag: "이메일발송",
      targetFile: fileName,
      fileId: resolvedFileId,
      fileSizeFormatted,
      webViewLink,
      webContentLink,
      targetEmail: to,
      targetRecipient: to,
      dispatchMethod: `방식 A (시트봇 자동/${dispatchMethod || "FAILED"})`,
      resultSummary: dispatchSuccess
        ? `⚡ '${fileName}' 원본 파일을 첨부하여 [${to}] 앞으로 시트봇 자동 발송(방식 A) 완료`
        : `⚠️ 방식 A 발송 실패(${dispatchError}) -> 방식 B 안내`,
      status: dispatchSuccess ? "SUCCESS" : "FAILED",
    });

    if (dispatchSuccess) {
      return NextResponse.json({
        success: true,
        method: dispatchMethod,
        recipientEmail: to,
        attachedFile: Boolean(downloadedAttachment),
        message: `✉️ '${fileName}' 원본 파일을 첨부하여 [${to}] 앞으로 성공적으로 발송했습니다.`,
      });
    }

    // 발송 수단이 설정되지 않았거나 전송 실패 시, 모바일 앱에서 방식 B(기본 메일 앱)를 이용하도록 명확하고 친절히 안내
    return NextResponse.json({
      success: false,
      requireLocalApp: true,
      error: `서버 직접 발송에 실패했습니다 (${dispatchError}).\n아래 [방식 B: 내 메일 앱에서 발송]을 선택하시면 원본 파일이 자동 첨부된 스마트폰 메일 작성창이 열립니다.`,
    });
  } catch (err: any) {
    console.error("[EmailSend] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
