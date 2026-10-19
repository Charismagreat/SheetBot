export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows, queryTable } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import * as crypto from "crypto";

const DEFAULT_BRIDGE_KEY = "sb_bridge_sec_98f41e0a82b3d17c";

function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";
  let clean = phone.replace(/[^0-9]/g, "").trim();
  if (clean.startsWith("82") && clean.length >= 10) {
    clean = "0" + clean.slice(2);
  }
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return clean;
}

/**
 * POST /api/sms/bridge/dispatch
 * 
 * 파일투시트(FileToSheet) 및 외부 시스템으로부터 발송 요청을 받아
 * 스마트폰 시트봇 모바일 에이전트 발송 대기 큐(sheetbot_sms_dispatch_queue)에 안전 적재합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const configuredKey = process.env.SHEETBOT_BRIDGE_API_KEY || DEFAULT_BRIDGE_KEY;
    const headerKey = req.headers.get("x-sheetbot-bridge-key") ||
      req.headers.get("x-sheetbot-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!headerKey || headerKey.trim() !== configuredKey.trim()) {
      return NextResponse.json(
        { success: false, error: "인증 실패: 유효하지 않은 브릿지 API 키입니다 (x-sheetbot-bridge-key)." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      sourceService = "FileToSheet",
      recipient,
      message,
      senderPhone,
      callbackUrl,
      userEmail: requestedUserEmail,
    } = body;

    if (!recipient || !message) {
      return NextResponse.json(
        { success: false, error: "수신번호(recipient)와 메시지 본문(message)은 필수입니다." },
        { status: 400 }
      );
    }

    const cleanRecipient = normalizePhoneNumber(String(recipient));
    if (!cleanRecipient) {
      return NextResponse.json(
        { success: false, error: "유효하지 않은 수신 전화번호입니다." },
        { status: 400 }
      );
    }

    // 대상 시트봇 매니저 사용자 이메일 확정
    let targetEmail = (requestedUserEmail && String(requestedUserEmail).includes("@"))
      ? String(requestedUserEmail).toLowerCase().trim()
      : "";

    if (!targetEmail) {
      // 등록된 활성 디바이스 중 최신 연결된 기기의 계정 탐색
      const devRes = await queryTable("sheetbot_user_devices", {
        limit: 10,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));

      const activeDev = (devRes.rows || []).find((d: any) => !d.deleted_at && d.user_email);
      if (activeDev?.user_email) {
        targetEmail = String(activeDev.user_email).toLowerCase().trim();
      } else {
        // 기본 서비스 관리자 계정 Fallback
        targetEmail = "charismagreat@gmail.com";
      }
    }

    const nowIso = new Date().toISOString();
    const nowKr = getKoreanTimeString();
    const itemUuid = crypto.randomUUID();

    // 1. 발송 대기 큐(sheetbot_sms_dispatch_queue)에 등록
    const queueInsertRes = await insertRows("sheetbot_sms_dispatch_queue", [
      {
        uuid: itemUuid,
        source_service: String(sourceService),
        recipient_phone: cleanRecipient,
        message_text: String(message),
        sender_phone: senderPhone ? String(senderPhone) : null,
        callback_url: callbackUrl ? String(callbackUrl) : null,
        user_email: targetEmail,
        device_id: null,
        status: "PENDING",
        error_message: null,
        sent_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        updated_by: "sms-bridge",
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);

    const dispatchId = queueInsertRes?.insertedIds?.[0] || itemUuid;

    // 2. 통합 알림 이력 대장(sheetbot_dispatch_logs)에도 감사 기록 누적
    try {
      await insertRows("sheetbot_dispatch_logs", [
        {
          uuid: crypto.randomUUID(),
          channel: "SMS_BRIDGE",
          event_type: "BRIDGE_DISPATCH",
          rule_name: `[${sourceService}] 원격 문자 중계`,
          recipient: cleanRecipient,
          recipient_type: "CUSTOMER",
          title: `[${sourceService}] 문자 발송 대기`,
          content: String(message),
          status: "QUEUED",
          error_message: null,
          created_at: nowIso,
          updated_at: nowIso,
          updated_by: "sms-bridge",
          deleted_at: null,
          deleted_by: null,
          restored_at: null,
          restored_by: null,
        },
      ]);
    } catch (e: any) {
      console.warn("[SmsBridge] dispatch_logs warning:", e?.message || e);
    }

    return NextResponse.json({
      success: true,
      message: `[${sourceService}] 발송 요청이 시트봇 대기 큐에 성공적으로 적재되었습니다.`,
      dispatchId,
      uuid: itemUuid,
      status: "QUEUED",
      targetEmail,
      recipient: cleanRecipient,
      queuedAt: nowKr,
    });
  } catch (error: any) {
    console.error("[SmsBridgeDispatch] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "원격 발송 처리 중 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
