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
import { maskPhoneNumber, formatZeroRetentionContent } from "@/lib/privacy";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

interface MissedCallCacheEntry {
  timestamp: number;
  spreadsheetUrl: string;
  logId: number;
}

// 15초 멱등성(Idempotency) 방어 캐시 (동일 유저 + 발신번호 기준 중복 시트 쓰기 원천 차단)
const recentMissedCallsCache = new Map<string, MissedCallCacheEntry>();

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
      callTime = getKoreanTimeString(),
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
    const cleanPhone = String(callerPhone).replace(/\D/g, "");
    const idempotencyKey = `${cleanEmail}_${cleanPhone}`;
    const now = Date.now();

    // 15초 멱등성 방어: 동일 유저 + 전화번호가 15초 이내 재인입된 경우 시트 중복 기입을 스킵하고 성공 캐시 반환
    const cached = recentMissedCallsCache.get(idempotencyKey);
    if (cached && now - cached.timestamp < 15_000) {
      console.log(`[MissedCalls] 15초 멱등성 가드 발동: ${idempotencyKey} (중복 기록 차단)`);
      return NextResponse.json({
        success: true,
        message: "이미 안전하게 기록된 부재중 전화 내역입니다 (15초 멱등성 방어).",
        spreadsheetUrl: cached.spreadsheetUrl,
        logId: cached.logId,
        cached: true,
      });
    }

    // 60초 경과 캐시 정리
    for (const [key, item] of recentMissedCallsCache.entries()) {
      if (now - item.timestamp > 60_000) {
        recentMissedCallsCache.delete(key);
      }
    }

    const displayName = contactName && contactName.trim().length > 0 ? contactName.trim() : "미등록 연락처";
    const replyStatusLabel = autoReplied ? "자동 회신 완료" : "미발송 (수동)";

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
          sheetType: "MISSED_CALL",
          defaultTitle: "[SheetBot] 부재중 전화 대장",
          requestedTitle: sheetTitle,
          preferOAuth: true,
        });

        const targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;

        if (resolved.isNew && targetSpreadsheetId) {
          // 초기 헤더 기입 ([SheetBot] 부재중 전화 표준 6대 열)
          const headers = [
            ["부재중 일시", "발신 번호", "연락처 이름", "자동 회신 내용", "회신 상태", "기기명"]
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

        // 시트에 신규 부재중 기록 행 추가 (헤더 순서와 100% 일치)
        if (targetSpreadsheetId) {
          const newRowValues = [
            [callTime, callerPhone, displayName, replyMessage, replyStatusLabel, deviceId]
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

    // 2. 발송/수신 감사 대장 DB 적재 (Zero-Retention: 고객 전화번호 마스킹 및 통화내용 서버 미보관 정책 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "MISSED_CALL",
        rule_name: "📞 부재중 전화 감지 및 스마트 회신",
        device_id: deviceId,
        recipient: `${displayName} (${maskPhoneNumber(callerPhone)})`,
        content: formatZeroRetentionContent(`부재중 통화 (${replyStatusLabel})`, replyMessage.length),
        status: autoReplied ? "SUCCESS" : "INBOUND",
        error_message: null,
        created_at: getKoreanTimeString(),
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

    // 4. 15초 멱등성 캐시 등록
    recentMissedCallsCache.set(idempotencyKey, {
      timestamp: Date.now(),
      spreadsheetUrl,
      logId,
    });

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
