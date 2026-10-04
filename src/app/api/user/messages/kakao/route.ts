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
import { maskRecipient, formatZeroRetentionContent } from "@/lib/privacy";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

// 15초 이내 동일 카카오톡 메시지 중복 기록 방어 캐시 (키: userEmail:roomName:senderName:message, 값: timestamp)
const recentKakaoDedupeCache = new Map<string, number>();

/**
 * POST /api/user/messages/kakao
 * 스마트폰 시트봇 에이전트(KakaoNotificationListener)에서 수신된 카카오톡 메시지를 받아
 * 구글 드라이브 [SheetBot] 카카오톡 메시지 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const body = await req.json().catch(() => ({}));
    const {
      userEmail: bodyEmail,
      chatRoomName,
      sender,
      isGroupChat = false,
      message,
      timestamp,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 카카오톡 메시지 대장",
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
    if (!message) {
      return NextResponse.json({ success: false, error: "메시지 내용이 비어있습니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const roomTypeLabel = isGroupChat ? "단체 단톡방" : "1:1 채팅";
    const roomName = chatRoomName && chatRoomName.trim().length > 0 ? chatRoomName.trim() : (sender || "미지정 방");
    const senderName = sender && sender.trim().length > 0 ? sender.trim() : roomName;
    const nowStr = timestamp || getKoreanTimeString();

    // 0. 15초 이내 동일 카카오톡 메시지 중복 요청 방어 (Idempotency Guard)
    const dedupeKey = `${cleanEmail}:${roomName}:${senderName}:${message.trim()}`;
    const now = Date.now();
    const lastSeen = recentKakaoDedupeCache.get(dedupeKey) || 0;
    if (now - lastSeen < 15_000) {
      return NextResponse.json({
        success: true,
        message: "중복된 카카오톡 메시지가 15초 이내에 감지되어 시트 중복 기록을 안전하게 방어했습니다.",
        isDuplicate: true,
      });
    }
    recentKakaoDedupeCache.set(dedupeKey, now);

    // 오래된 캐시 정리 (최대 200개 유지)
    if (recentKakaoDedupeCache.size > 200) {
      const threshold = now - 60_000;
      for (const [k, v] of recentKakaoDedupeCache.entries()) {
        if (v < threshold) recentKakaoDedupeCache.delete(k);
      }
    }

    // [SheetBot] 표준 네이밍 원칙 준수
    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    // 1. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 행 기록
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      try {
        const resolved = await resolveUserSpreadsheet({
          userEmail: cleanEmail,
          sheetType: "KAKAO",
          defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
          requestedTitle: sheetTitle,
          preferOAuth: true,
        });

        const targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;

        // 시트에 신규 카카오톡 메시지 행 추가 (자가 치유: 1행 헤더 보장)
        if (targetSpreadsheetId) {
          const headerValues = [
            ["수신 일시", "채팅방 구분", "채팅방/상대방 이름", "발신자", "메시지 내용", "기기명"]
          ];

          // 1행 A1 셀 확인하여 비어있으면 헤더 선제 주입
          const firstRowCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: targetSpreadsheetId,
            range: "A1:A1",
            preferOAuth: true,
          }).catch(() => null);

          const hasHeaderOrData = firstRowCheck?.values && firstRowCheck.values.length > 0 && firstRowCheck.values[0]?.[0];

          if (!hasHeaderOrData) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:F1",
              values: headerValues,
              preferOAuth: true,
            }).catch(() => {});

            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#3c1e1e",
              headerTextColor: "#fee500",
              preferOAuth: true,
            }).catch(() => {});
          }

          const newRowValues = [
            [nowStr, roomTypeLabel, roomName, senderName, message, deviceId]
          ];
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:F",
            values: newRowValues,
            preferOAuth: true,
          }).catch((err: any) => console.warn("[KakaoSync] append_values warning:", err.message));
        }
      } catch (sheetErr: any) {
        console.warn("[KakaoSync] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 2. 발송/수신 감사 대장 DB 적재 (Zero-Retention: 고객 개인정보 마스킹 및 대화 본문 서버 미보관 정책 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "INBOUND_KAKAO",
        rule_name: "🟡 카카오톡 메시지 실시간 수신",
        device_id: deviceId,
        recipient: `[${roomTypeLabel}] ${roomName} (${maskRecipient(senderName)})`,
        content: formatZeroRetentionContent("카카오톡 메시지", message.length),
        status: "INBOUND",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[KakaoSync] DB log insert warning:", err.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: "agent2_inbound_kakao",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "카카오톡 메시지가 구글 시트에 안전하게 기록되었습니다.",
      spreadsheetUrl,
      logId,
    });
  } catch (err: any) {
    console.error("[KakaoSync] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
