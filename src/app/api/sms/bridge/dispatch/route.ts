export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows } from "@/lib/egdesk-helpers";
import { getKoreanTimeString } from "@/lib/date-utils";
import * as crypto from "crypto";
import { ALLOWED_SMS_PURPOSES, isAnyManagerOnline, safeEqual } from "@/lib/manager-devices";

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

function maskCode(text: string): string {
  return String(text || "").replace(/\d{4,8}/g, "••••••");
}

/**
 * POST /api/sms/bridge/dispatch
 *
 * FileToSheet 등 외부 시스템의 **인증번호 SMS** 발송 요청을 받아
 * 매니저 휴대폰의 Agent M 앱(android-agent, 인증번호 SMS 릴레이)의 발송 대기 큐에 적재합니다.
 *
 * 헤더: x-sheetbot-bridge-key  (서버 환경변수 SHEETBOT_BRIDGE_API_KEY 와 일치해야 함)
 * 본문: { purpose: 'send-code' | 'emergency-recovery' | 'transfer-account',
 *         recipient, message, sourceService?, callbackUrl? }
 *
 * 매니저 폰이 오프라인이면 503 + code:"NO_MANAGER_ONLINE" 을 반환하므로
 * 호출 측이 대체 수단(예: Aligo)으로 폴백할지 결정할 수 있습니다.
 */
export async function POST(req: NextRequest) {
  try {
    const configuredKey = process.env.SHEETBOT_BRIDGE_API_KEY;
    if (!configuredKey) {
      console.error("[SmsBridgeDispatch] SHEETBOT_BRIDGE_API_KEY is not configured");
      return NextResponse.json(
        { success: false, error: "브릿지가 구성되지 않았습니다 (SHEETBOT_BRIDGE_API_KEY 미설정)." },
        { status: 503 }
      );
    }

    const headerKey = (
      req.headers.get("x-sheetbot-bridge-key") ||
      req.headers.get("x-sheetbot-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      ""
    ).trim();

    if (!headerKey || !safeEqual(headerKey, configuredKey.trim())) {
      return NextResponse.json(
        { success: false, error: "인증 실패: 유효하지 않은 브릿지 API 키입니다 (x-sheetbot-bridge-key)." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { sourceService = "FileToSheet", purpose, recipient, message, callbackUrl } = body;

    if (!ALLOWED_SMS_PURPOSES.includes(purpose)) {
      return NextResponse.json(
        {
          success: false,
          error: `purpose는 ${ALLOWED_SMS_PURPOSES.join(", ")} 중 하나여야 합니다 (인증번호 SMS 전용).`,
        },
        { status: 400 }
      );
    }

    if (!recipient || !message) {
      return NextResponse.json(
        { success: false, error: "수신번호(recipient)와 메시지 본문(message)은 필수입니다." },
        { status: 400 }
      );
    }

    const cleanRecipient = normalizePhoneNumber(String(recipient));
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(cleanRecipient)) {
      return NextResponse.json({ success: false, error: "유효하지 않은 휴대전화 번호입니다." }, { status: 400 });
    }

    if (callbackUrl) {
      const urlStr = String(callbackUrl);
      const isHttps = /^https:\/\//i.test(urlStr);
      const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(urlStr);
      if (!isHttps && !isLocal) {
        return NextResponse.json({ success: false, error: "callbackUrl은 https 주소이거나 로컬호스트 주소여야 합니다." }, { status: 400 });
      }
    }

    if (!(await isAnyManagerOnline())) {
      return NextResponse.json(
        {
          success: false,
          code: "NO_MANAGER_ONLINE",
          error: "온라인 상태의 매니저 휴대폰이 없습니다.",
        },
        { status: 503 }
      );
    }

    const nowIso = new Date().toISOString();
    const itemUuid = crypto.randomUUID();

    const queueInsertRes = await insertRows("sheetbot_sms_dispatch_queue", [
      {
        uuid: itemUuid,
        source_service: String(sourceService),
        recipient_phone: cleanRecipient,
        message_text: String(message),
        sender_phone: null,
        callback_url: callbackUrl ? String(callbackUrl) : null,
        user_email: "manager",
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

    try {
      await insertRows("sheetbot_dispatch_logs", [
        {
          uuid: crypto.randomUUID(),
          channel: "SMS_BRIDGE",
          event_type: "BRIDGE_DISPATCH",
          rule_name: `[${sourceService}] ${purpose} 인증번호 중계`,
          recipient: cleanRecipient,
          recipient_type: "CUSTOMER",
          title: `[${sourceService}] 인증번호 발송 대기 (${purpose})`,
          content: maskCode(String(message)),
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
      message: `[${sourceService}] 발송 요청이 매니저 폰 대기 큐에 적재되었습니다.`,
      dispatchId,
      uuid: itemUuid,
      status: "QUEUED",
      recipient: cleanRecipient,
      queuedAt: getKoreanTimeString(),
    });
  } catch (error: any) {
    console.error("[SmsBridgeDispatch] Error:", error);
    return NextResponse.json({ success: false, error: "원격 발송 처리 중 내부 오류가 발생했습니다." }, { status: 500 });
  }
}
