export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import * as crypto from "crypto";

/**
 * POST /api/user/agent2/sms-queue/report
 * 
 * 시트봇 모바일 에이전트(스마트폰)가 실제 통신사 SMS/LMS 발송을 완료한 후
 * 성공/실패 결과 및 단말기 정보를 서버로 보고하고, 등록된 웹훅 callbackUrl로 회신합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      dispatchId,
      uuid: itemUuid,
      success,
      error,
      sentAt,
      deviceId = "SheetBot Mobile Agent",
    } = body;

    if (!dispatchId && !itemUuid) {
      return NextResponse.json(
        { success: false, error: "dispatchId 또는 uuid가 누락되었습니다." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const finalSentAt = sentAt || getKoreanTimeString();
    const isSuccess = !!success;
    const finalStatus = isSuccess ? "SENT" : "FAILED";

    // 1. 기존 발송 큐 레코드 탐색
    const queryFilters: Record<string, string> = {};
    if (dispatchId) queryFilters.id = String(dispatchId);
    else if (itemUuid) queryFilters.uuid = String(itemUuid);

    const res = await queryTable("sheetbot_sms_dispatch_queue", {
      filters: queryFilters,
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const existingRow = (res.rows || [])[0];

    // 2. 발송 결과 업데이트
    if (existingRow) {
      await updateRows(
        "sheetbot_sms_dispatch_queue",
        {
          filters: { id: String(existingRow.id) },
          updates: {
            status: finalStatus,
            error_message: isSuccess ? null : (error || "알 수 없는 발송 오류"),
            sent_at: finalSentAt,
            device_id: deviceId,
            updated_at: nowIso,
            updated_by: "agent-report",
          },
        }
      ).catch((e: any) => console.warn("[SmsQueueReport] update warning:", e?.message));
    }

    // 3. 파일투시트 등 의뢰 서비스의 callbackUrl이 존재하는 경우 실시간 비동기 콜백 전송
    const callbackUrl = existingRow?.callback_url;
    let callbackExecuted = false;
    let callbackStatus = "NONE";

    if (callbackUrl && typeof callbackUrl === "string" && callbackUrl.startsWith("http")) {
      callbackExecuted = true;
      try {
        const callbackPayload = {
          success: isSuccess,
          status: isSuccess ? "SUCCESS" : "FAILED",
          dispatchId: existingRow.id,
          uuid: existingRow.uuid,
          sourceService: existingRow.source_service || "FileToSheet",
          recipient: existingRow.recipient_phone,
          error: isSuccess ? null : (error || null),
          sentAt: finalSentAt,
          deviceId,
          reportedAt: nowIso,
        };

        const cbRes = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SheetBot-SMS-Bridge-Callback/1.0",
          },
          body: JSON.stringify(callbackPayload),
          signal: AbortSignal.timeout(6000), // 6초 타임아웃
        });

        callbackStatus = cbRes.ok ? "DELIVERED" : `HTTP_${cbRes.status}`;
      } catch (cbErr: any) {
        callbackStatus = `ERROR: ${cbErr.message}`;
        console.warn("[SmsBridgeCallback] Webhook notification failed:", cbErr.message);
      }
    }

    // 4. 회원 알림 발송 이력(sheetbot_user_dispatch_logs) 감사 기록 누적
    try {
      if (existingRow) {
        await insertRows("sheetbot_user_dispatch_logs", [
          {
            uuid: crypto.randomUUID(),
            user_email: existingRow.user_email || "system",
            rule_id: "sms_bridge",
            rule_name: `[${existingRow.source_service || "FileToSheet"}] 모바일 브릿지 발송`,
            device_id: deviceId,
            recipient: existingRow.recipient_phone,
            content: existingRow.message_text,
            status: finalStatus,
            error_message: isSuccess ? null : error,
            created_at: nowIso,
            updated_at: nowIso,
            updated_by: "sms-bridge",
            deleted_at: null,
            deleted_by: null,
            restored_at: null,
            restored_by: null,
          },
        ]);
      }
    } catch (_: any) {}

    return NextResponse.json({
      success: true,
      dispatchId: existingRow?.id || dispatchId,
      status: finalStatus,
      callbackExecuted,
      callbackStatus,
      sentAt: finalSentAt,
    });
  } catch (error: any) {
    console.error("[SmsQueueReport] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "발송 결과 보고 처리 중 오류 발생" },
      { status: 500 }
    );
  }
}
