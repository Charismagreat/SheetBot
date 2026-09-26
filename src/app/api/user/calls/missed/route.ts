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
 * POST /api/user/calls/missed
 * 스마트폰 시트봇 에이전트에서 부재중 전화(Missed Call) 감지 및 자동 회신 발송 시
 * 구글 드라이브 [SheetBot] 부재중 전화 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      callerPhone,
      contactName,
      callTime = new Date().toISOString().replace("T", " ").slice(0, 19),
      autoReplied = true,
      replyMessage = "",
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 부재중 전화 대장",
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
    if (!callerPhone) {
      return NextResponse.json({ success: false, error: "발신자 전화번호가 필요합니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const displayName = contactName && contactName.trim().length > 0 ? contactName.trim() : "미등록 연락처";
    const replyStatusLabel = autoReplied ? "자동 회신 완료" : "미발송 (수동)";

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
            console.warn("[MissedCalls] sheets_create_spreadsheet warning:", err.message);
            return null;
          });

          targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;

          if (targetSpreadsheetId) {
            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

            // 초기 헤더 기입
            const headers = [
              ["부재중 일시", "상대방 이름", "전화번호", "자동 회신 여부", "회신 내용", "기기명"]
            ];
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:F1",
              values: headers,
              preferOAuth: true,
            }).catch(() => {});

            // 헤더 서식 스타일링 (앰버/레드 테마)
            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#7c2d12",
              headerTextColor: "#fed7aa",
              preferOAuth: true,
            }).catch(() => {});
          }
        }

        // 시트에 신규 부재중 기록 행 추가
        if (targetSpreadsheetId) {
          const newRowValues = [
            [callTime, displayName, callerPhone, replyStatusLabel, replyMessage, deviceId]
          ];
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:F",
            values: newRowValues,
            preferOAuth: true,
          }).catch((err: any) => console.warn("[MissedCalls] append_values warning:", err.message));
        }
      } catch (sheetErr: any) {
        console.warn("[MissedCalls] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 2. 발송/수신 감사 대장 DB 적재 (SQLite INTEGER id 규격 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "MISSED_CALL",
        rule_name: "📞 부재중 전화 감지 및 스마트 회신",
        device_id: deviceId,
        recipient: `${displayName} (${callerPhone})`,
        content: `[부재중 통화] 회신: ${replyStatusLabel} - ${replyMessage.slice(0, 80)}`,
        status: autoReplied ? "SUCCESS" : "INBOUND",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[MissedCalls] DB log insert warning:", err.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: "agent2_missed_call",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "부재중 전화 내역이 구글 시트에 안전하게 기록되었습니다.",
      spreadsheetUrl,
      logId,
    });
  } catch (err: any) {
    console.error("[MissedCalls] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
