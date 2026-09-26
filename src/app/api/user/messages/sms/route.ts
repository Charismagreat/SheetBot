export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callSheetsTool,
  listDriveFiles,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";

/**
 * POST /api/user/messages/sms
 * 스마트폰 시트봇 에이전트(SmsReceiver 및 SmsSentObserver)에서 수신/발신된 문자를 수신하여
 * 구글 드라이브 [SheetBot] 스마트폰 문자(SMS) 송수신 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      direction = "INBOUND", // "INBOUND" (수신) 또는 "OUTBOUND" (발신)
      phoneNumber,
      contactName,
      message,
      timestamp,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
      autoRecordSheet = true,
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!phoneNumber || !message) {
      return NextResponse.json({ success: false, error: "전화번호와 메시지 내용은 필수입니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const isOutbound = direction.toUpperCase() === "OUTBOUND";
    const directionLabel = isOutbound ? "발신" : "수신";
    const displayName = contactName && contactName.trim().length > 0 ? contactName.trim() : "미등록 연락처";
    const nowStr = timestamp || new Date().toISOString().replace("T", " ").slice(0, 19);

    // [SheetBot] 표준 네이밍 원칙 준수
    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    // 1. 구글 스프레드시트 대장 자동 생성 및 행 기록
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      try {
        let targetSpreadsheetId: string | null = null;

        // 드라이브 내 대장 시트 검색
        const queryStr = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`;
        const sheetSearch = await listDriveFiles({
          query: queryStr,
          preferOAuth: true,
        }).catch(() => ({ files: [] }));

        const foundSheets = sheetSearch?.files || [];
        if (foundSheets.length > 0) {
          targetSpreadsheetId = foundSheets[0].id;
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
        } else {
          // 대장 시트 신규 생성
          const createRes = await callSheetsTool("sheets_create_spreadsheet", {
            title: sheetTitle,
            preferOAuth: true,
          }).catch((err: any) => {
            console.warn("[SmsSync] sheets_create_spreadsheet warning:", err.message);
            return null;
          });

          targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;

          if (targetSpreadsheetId) {
            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

            // 초기 헤더 기입
            const headers = [
              ["일시", "구분", "상대방 이름", "상대방 전화번호", "메시지 내용", "기기명"]
            ];
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:F1",
              values: headers,
              preferOAuth: true,
            }).catch(() => {});

            // 헤더 서식 스타일링 (다크 네이비 테마)
            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#1e293b",
              headerTextColor: "#ffffff",
              preferOAuth: true,
            }).catch(() => {});
          }
        }

        // 시트에 신규 문자 기록 행 추가
        if (targetSpreadsheetId) {
          const newRowValues = [
            [nowStr, directionLabel, displayName, phoneNumber, message, deviceId]
          ];
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:F",
            values: newRowValues,
            preferOAuth: true,
          }).catch((err: any) => console.warn("[SmsSync] append_values warning:", err.message));
        }
      } catch (sheetErr: any) {
        console.warn("[SmsSync] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 2. 발송/수신 감사 대장 DB 적재 (SQLite INTEGER id 규격 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: isOutbound ? "OUTBOUND_SMS" : "INBOUND_SMS",
        rule_name: isOutbound ? "📱 스마트폰 고객 문자 직접 발신" : "📱 스마트폰 고객 문자 수신",
        device_id: deviceId,
        recipient: `${displayName} (${phoneNumber})`,
        content: `[${directionLabel}] ${message.take ? message.take(100) : message.slice(0, 100)}`,
        status: isOutbound ? "SUCCESS" : "INBOUND",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[SmsSync] DB log insert warning:", err.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: isOutbound ? "agent2_outbound_sms" : "agent2_inbound_sms",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `문자(${directionLabel}) 내역이 구글 시트에 안전하게 기록되었습니다.`,
      spreadsheetUrl,
      logId,
    });
  } catch (err: any) {
    console.error("[SmsSync] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
