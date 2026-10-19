export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { authenticateManagerDevice, SMS_JOB_EXPIRY_MS } from "@/lib/manager-devices";

const QUEUE_TABLE = "sheetbot_sms_dispatch_queue";

/**
 * GET /api/manager-agent/sms-queue   (header: x-manager-device-key)
 *
 * 매니저 휴대폰 앱이 폴링하여 인증번호 SMS 발송 작업을 가져갑니다.
 * - 페어링된 활성 매니저 기기만 호출 가능 (기기 키 인증)
 * - PENDING → PROCESSING 으로 선점(claim)하여 여러 대가 있어도 중복 발송 방지
 * - 인증번호 수명(3분)을 넘긴 작업은 발송하지 않고 FAILED(만료) 처리
 */
export async function GET(req: NextRequest) {
  try {
    const device = await authenticateManagerDevice(req);
    if (!device) {
      return NextResponse.json({ success: false, error: "인증되지 않은 기기입니다." }, { status: 401 });
    }

    const limit = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("limit") || "3", 10) || 3, 1), 5);
    const deviceId = String(device.id);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const res = await queryTable(QUEUE_TABLE, {
      filters: { status: "PENDING" },
      limit: 50,
      orderBy: "id",
      orderDirection: "ASC",
    }).catch(() => ({ rows: [] as any[] }));

    const claimed: any[] = [];

    for (const r of res.rows || []) {
      if (claimed.length >= limit) break;
      if (r.deleted_at || r.status !== "PENDING") continue;

      const created = Date.parse(r.created_at);
      if (Number.isFinite(created) && now - created > SMS_JOB_EXPIRY_MS) {
        await updateRows(QUEUE_TABLE, {
          updates: {
            status: "FAILED",
            error_message: "만료: 인증번호 유효시간 내에 발송되지 않았습니다.",
            message_text: "[expired]",
            updated_at: nowIso,
            updated_by: "manager-expire",
          },
          filters: { id: String(r.id), status: "PENDING" },
        }).catch(() => {});
        continue;
      }

      // 선점: status=PENDING 조건부 갱신 후 내가 선점했는지 재확인
      await updateRows(QUEUE_TABLE, {
        updates: { status: "PROCESSING", device_id: deviceId, updated_at: nowIso, updated_by: "manager-fetch" },
        filters: { id: String(r.id), status: "PENDING" },
      }).catch(() => {});

      const check = await queryTable(QUEUE_TABLE, { filters: { id: String(r.id) }, limit: 1 }).catch(() => ({
        rows: [] as any[],
      }));
      const fresh = (check.rows || [])[0];
      if (!fresh || fresh.status !== "PROCESSING" || fresh.device_id !== deviceId) continue;

      claimed.push({
        id: r.id,
        uuid: r.uuid,
        sourceService: r.source_service || "FileToSheet",
        recipient: r.recipient_phone,
        message: r.message_text,
        createdAt: r.created_at,
      });
    }

    return NextResponse.json({ success: true, count: claimed.length, items: claimed });
  } catch (error: any) {
    console.error("[ManagerSmsQueue] Error:", error);
    return NextResponse.json({ success: false, error: "대기열 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
