export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import { authenticateManagerDevice } from "@/lib/manager-devices";

const QUEUE_TABLE = "sheetbot_sms_dispatch_queue";

/** 로그/이력에는 인증번호(연속 4~8자리 숫자)를 남기지 않음 */
function maskCode(text: string): string {
  return String(text || "").replace(/\d{4,8}/g, "••••••");
}

/**
 * POST /api/manager-agent/sms-queue/report   (header: x-manager-device-key)
 * body: { dispatchId, success, error?, sentAt? }
 *
 * 자신이 선점(PROCESSING)한 작업에 대해서만 결과를 보고할 수 있으며,
 * 의뢰 서비스의 callbackUrl 로 결과를 회신합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const device = await authenticateManagerDevice(req);
    if (!device) {
      return NextResponse.json({ success: false, error: "인증되지 않은 기기입니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { dispatchId, success, error, sentAt } = body;
    if (!dispatchId) {
      return NextResponse.json({ success: false, error: "dispatchId가 필요합니다." }, { status: 400 });
    }

    const res = await queryTable(QUEUE_TABLE, { filters: { id: String(dispatchId) }, limit: 1 }).catch(() => ({
      rows: [] as any[],
    }));
    const row = (res.rows || [])[0];

    if (!row || row.deleted_at || row.device_id !== String(device.id)) {
      return NextResponse.json({ success: false, error: "보고 권한이 없는 작업입니다." }, { status: 403 });
    }
    if (row.status !== "PROCESSING") {
      // 이미 보고되었거나 만료됨 → 멱등 처리
      return NextResponse.json({ success: true, dispatchId: row.id, status: row.status, duplicate: true });
    }

    const nowIso = new Date().toISOString();
    const isSuccess = !!success;
    const finalStatus = isSuccess ? "SENT" : "FAILED";
    const finalSentAt = sentAt || getKoreanTimeString();
    const deviceLabel = String(device.label || device.id);
    const errorText = isSuccess ? null : String(error || "알 수 없는 발송 오류").slice(0, 200);

    const originalMessage = row.message_text;

    await updateRows(QUEUE_TABLE, {
      updates: {
        status: finalStatus,
        error_message: errorText,
        sent_at: finalSentAt,
        message_text: maskCode(originalMessage), // 발송 완료 후 인증번호 평문 제거
        updated_at: nowIso,
        updated_by: "manager-report",
      },
      filters: { id: String(row.id), status: "PROCESSING" },
    });

    let callbackStatus = "NONE";
    const callbackUrl = row.callback_url;
    if (typeof callbackUrl === "string" && callbackUrl.startsWith("http")) {
      try {
        const cbRes = await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "SheetBot-SMS-Bridge-Callback/1.0" },
          body: JSON.stringify({
            success: isSuccess,
            status: isSuccess ? "SUCCESS" : "FAILED",
            dispatchId: row.id,
            uuid: row.uuid,
            sourceService: row.source_service || "FileToSheet",
            recipient: row.recipient_phone,
            error: errorText,
            sentAt: finalSentAt,
            deviceId: deviceLabel,
            reportedAt: nowIso,
          }),
          signal: AbortSignal.timeout(6000),
        });
        callbackStatus = cbRes.ok ? "DELIVERED" : `HTTP_${cbRes.status}`;
      } catch (cbErr: any) {
        callbackStatus = `ERROR: ${cbErr.message}`;
      }
    }

    try {
      await insertRows("sheetbot_dispatch_logs", [
        {
          uuid: crypto.randomUUID(),
          channel: "SMS_BRIDGE",
          event_type: "MANAGER_SMS",
          rule_name: `[${row.source_service || "FileToSheet"}] 매니저 폰 인증번호 발송`,
          recipient: row.recipient_phone,
          recipient_type: "CUSTOMER",
          title: `인증번호 SMS ${isSuccess ? "발송 완료" : "발송 실패"}`,
          content: maskCode(originalMessage),
          status: finalStatus,
          error_message: errorText,
          created_at: nowIso,
          updated_at: nowIso,
          updated_by: "manager-report",
          deleted_at: null,
          deleted_by: null,
          restored_at: null,
          restored_by: null,
        },
      ]);
    } catch (_) {}

    return NextResponse.json({ success: true, dispatchId: row.id, status: finalStatus, callbackStatus });
  } catch (error: any) {
    console.error("[ManagerSmsReport] Error:", error);
    return NextResponse.json({ success: false, error: "결과 보고 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
