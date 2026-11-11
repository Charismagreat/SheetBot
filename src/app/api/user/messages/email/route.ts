export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callSheetsTool,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { maskRecipient, formatZeroRetentionContent } from "@/lib/privacy";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import { extractAndCreateTasksFromMessage } from "@/lib/task-hub-helper";

// 15초 이내 동일 이메일 중복 기록 방어 캐시 (키: userEmail:sender:subject:body, 값: timestamp)
const recentEmailDedupeCache = new Map<string, number>();

/**
 * POST /api/user/messages/email
 * 스마트폰 시트봇 에이전트(BankNotificationListener)에서 수신된 이메일 푸시 알림을 받아
 * 구글 드라이브 [SheetBot] 이메일 수신 대장 시트에 실시간 자동 기록하고 AI로 할 일(Action Item) 추출
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      userPhone,
      ftsProjectId,
      mailApp = "이메일",
      sender = "",
      senderEmail = "",
      subject = "",
      bodyPreview = "",
      message = "",
      timestamp,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 이메일 수신 대장",
      autoRecordSheet = true,
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail =
      bodyEmail && bodyEmail.includes("@")
        ? bodyEmail.toLowerCase().trim()
        : sessionEmail ||
          (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const subjectText = String(subject || "").trim();
    const bodyText = String(bodyPreview || message || "").trim();
    if (!subjectText && !bodyText) {
      return NextResponse.json(
        { success: false, error: "이메일 제목 또는 본문이 비어있습니다." },
        { status: 400 }
      );
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const mailAppLabel = String(mailApp || "이메일").trim();
    const senderName = String(sender || senderEmail || "발신자 미상").trim();
    const senderDisplay =
      senderEmail && !senderName.includes(senderEmail)
        ? `${senderName} <${senderEmail}>`
        : senderName;
    const nowStr = timestamp || getKoreanTimeString();

    // 0. 15초 이내 동일 이메일 중복 요청 방어 (Idempotency Guard)
    const dedupeKey = `${cleanEmail}:${senderDisplay}:${subjectText}:${bodyText.slice(0, 120)}`;
    const now = Date.now();
    const lastSeen = recentEmailDedupeCache.get(dedupeKey) || 0;
    if (now - lastSeen < 15_000) {
      return NextResponse.json({
        success: true,
        message: "중복된 이메일 알림이 15초 이내에 감지되어 중복 기록을 안전하게 방어했습니다.",
        isDuplicate: true,
      });
    }
    recentEmailDedupeCache.set(dedupeKey, now);

    if (recentEmailDedupeCache.size > 200) {
      const threshold = now - 60_000;
      for (const [k, v] of recentEmailDedupeCache.entries()) {
        if (v < threshold) recentEmailDedupeCache.delete(k);
      }
    }

    let sheetTitle = String(rawSheetTitle || "[SheetBot] 이메일 수신 대장").trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    // 1. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 행 기록 (구글 계정 연동 시)
    let spreadsheetUrl = "";
    if (autoRecordSheet && !cleanEmail.endsWith("@filetosheet.cloud")) {
      try {
        const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);
        const resolved = await resolveUserSpreadsheet({
          userEmail: cleanEmail,
          sheetType: "EMAIL",
          defaultTitle: "[SheetBot] 이메일 수신 대장",
          requestedTitle: sheetTitle,
          preferOAuth: true,
          callOptions,
        });

        const targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;

        if (targetSpreadsheetId) {
          const headerValues = [
            ["수신 일시", "메일앱/수신계정", "발신자", "메일 제목", "본문 요약", "기기명"],
          ];

          const firstRowCheck = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:A1",
              preferOAuth: true,
            },
            callOptions
          ).catch(() => null);

          const hasHeaderOrData =
            firstRowCheck?.values &&
            firstRowCheck.values.length > 0 &&
            firstRowCheck.values[0]?.[0];

          if (!hasHeaderOrData) {
            await callSheetsTool(
              "sheets_update_range",
              {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:F1",
                values: headerValues,
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});

            await callSheetsTool(
              "sheets_format_headers",
              {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#1e3a8a",
                headerTextColor: "#ffffff",
                preferOAuth: true,
              },
              callOptions
            ).catch(() => {});
          }

          const newRowValues = [
            [
              nowStr,
              mailAppLabel,
              senderDisplay,
              subjectText || "(제목 없음)",
              bodyText || subjectText,
              deviceId,
            ],
          ];
          await callSheetsTool(
            "sheets_append_values",
            {
              spreadsheetId: targetSpreadsheetId,
              range: "A:F",
              values: newRowValues,
              preferOAuth: true,
            },
            callOptions
          ).catch((err: any) => console.warn("[EmailSync] append_values warning:", err.message));
        }
      } catch (sheetErr: any) {
        console.warn("[EmailSync] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 2. 발송/수신 감사 대장 DB 적재 (Zero-Retention 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "INBOUND_EMAIL",
        rule_name: "📧 이메일 실시간 수신",
        device_id: deviceId,
        recipient: `[${mailAppLabel}] ${maskRecipient(senderName)}`,
        content: formatZeroRetentionContent("이메일", (subjectText + bodyText).length),
        status: "INBOUND",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[EmailSync] DB log insert warning:", err.message));

    // 2-1. 수신된 이메일에서 비즈니스 할 일(Action Item) 실시간 자동 추출 및 할 일 허브 등록 (Zero-Block 백그라운드)
    void extractAndCreateTasksFromMessage({
      userEmail: cleanEmail,
      userPhone: userPhone || undefined,
      ftsProjectId: ftsProjectId || undefined,
      sourceType: "EMAIL",
      emailSubject: subjectText,
      message: bodyText || subjectText,
      senderEmail: senderEmail || undefined,
      contactName: senderName,
      timestamp: nowStr,
      deepLink: spreadsheetUrl || undefined,
    }).catch((err) => console.warn("[EmailSync] Task extraction warning:", err?.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: "agent2_inbound_email",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "수신 이메일이 시트에 기록되고 할 일 분석이 시작되었습니다.",
      spreadsheetUrl,
      logId,
    });
  } catch (err: any) {
    console.error("[EmailSync] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
