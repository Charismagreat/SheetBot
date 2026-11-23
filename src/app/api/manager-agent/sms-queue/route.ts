export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import {
  authenticateManagerDevice,
  markSmsQueueEmpty,
  setManagerPollerActive,
  shouldCheckSmsQueueDb,
  SMS_JOB_EXPIRY_MS,
  waitForSmsQueueJob,
} from "@/lib/manager-devices";

const QUEUE_TABLE = "sheetbot_sms_dispatch_queue";
const MAX_WAIT_MS = 30_000;

async function claimPendingSmsJobs(deviceId: string, limit: number): Promise<any[]> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const res = await queryTable(QUEUE_TABLE, {
    filters: { status: "PENDING" },
    limit: 50,
    orderBy: "id",
    orderDirection: "ASC",
  }).catch(() => ({ rows: [] as any[] }));

  const rows = (res.rows || []).filter((r: any) => !r.deleted_at && r.status === "PENDING");
  if (rows.length === 0) {
    markSmsQueueEmpty();
    return [];
  }

  const claimed: any[] = [];
  let remainingPending = 0;

  for (const r of rows) {
    if (claimed.length >= limit) {
      remainingPending++;
      continue;
    }

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

  if (remainingPending === 0) {
    markSmsQueueEmpty();
  }

  return claimed;
}

/**
 * GET /api/manager-agent/sms-queue   (header: x-manager-device-key or x-sheetbot-user-email)
 *
 * 매니저 휴대폰 앱(Agent M)이 인증번호 SMS 발송 작업을 가져갑니다.
 * - ?waitMs=25000 (최대 30초): 대기열이 비어 있을 때 메모리 이벤트로 대기(유휴 SQLite 쿼리 0건) 후,
 *   신규 OTP 적재 즉시(<100ms) 깨어나 동일 응답으로 반환합니다.
 * - waitMs 미지정(구버전 APK) 시 기존처럼 즉시 반환하여 100% 하위 호환을 유지합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const device = await authenticateManagerDevice(req);
    if (!device) {
      return NextResponse.json({ success: false, error: "인증되지 않은 기기입니다." }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "3", 10) || 3, 1), 5);
    const rawWaitMs = parseInt(searchParams.get("waitMs") || "0", 10) || 0;
    const waitMs = Math.min(Math.max(rawWaitMs, 0), MAX_WAIT_MS);
    const deviceId = String(device.id);

    setManagerPollerActive(deviceId, true);
    try {
      let claimed: any[] = [];

      if (shouldCheckSmsQueueDb()) {
        claimed = await claimPendingSmsJobs(deviceId, limit);
      }

      if (claimed.length === 0 && waitMs > 0 && !req.signal.aborted) {
        const woke = await waitForSmsQueueJob(waitMs, req.signal);
        if (woke && !req.signal.aborted) {
          claimed = await claimPendingSmsJobs(deviceId, limit);
        }
      }

      return NextResponse.json(
        { success: true, count: claimed.length, items: claimed },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
      );
    } finally {
      setManagerPollerActive(deviceId, false);
    }
  } catch (error: any) {
    console.error("[ManagerSmsQueue] Error:", error);
    return NextResponse.json({ success: false, error: "대기열 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
