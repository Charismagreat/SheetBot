export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";

/**
 * POST /api/user/agent2/heartbeat
 * SheetBot Agent2 앱에서 주기적으로 기기 상태(온라인, 배터리 등)를 보고
 * - 단일 최신 기기 행만 갱신하여 DB 부하 최소화
 * - FileToSheet 전용(@filetosheet.cloud) 가상 계정은 DB 조회 없이 즉시 응답
 */
export async function POST(req: NextRequest) {
  try {
    setupDatabase().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const rawEmail =
      body?.userEmail ||
      req.headers.get("x-sheetbot-user-email") ||
      req.headers.get("x-user-email") ||
      (await getCurrentUserEmail(req).catch(() => null));

    if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.includes("@")) {
      return NextResponse.json({ success: false, error: "userEmail이 필요합니다." }, { status: 400 });
    }

    const cleanEmail = rawEmail.toLowerCase().trim();
    const now = new Date().toISOString();

    // FileToSheet 전용 가상 계정은 SheetBot DB에 기기 레코드가 없으므로 즉시 경량 응답
    if (cleanEmail.endsWith("@filetosheet.cloud") || cleanEmail.endsWith("@fts.local")) {
      return NextResponse.json({
        success: true,
        status: "CONNECTED",
        timestamp: now,
        visitorSessionId: null,
      });
    }

    const { battery, batteryLevel, isCharging, networkType } = body || {};
    const resolvedBattery = batteryLevel !== undefined && batteryLevel !== null ? Number(batteryLevel) : battery !== undefined && battery !== null ? Number(battery) : undefined;
    const resolvedCharging = isCharging !== undefined && isCharging !== null ? (isCharging ? 1 : 0) : undefined;

    const existing = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const targetDev = (existing.rows || []).find((r: any) => !r.deleted_at);

    if (targetDev) {
      const updates: Record<string, any> = {
        status: "CONNECTED",
        last_connected_at: now,
        last_ping: now,
        updated_at: now,
      };
      if (resolvedBattery !== undefined && Number.isFinite(resolvedBattery)) {
        updates.battery_level = resolvedBattery;
      }
      if (resolvedCharging !== undefined) {
        updates.is_charging = resolvedCharging;
      }
      if (networkType) {
        updates.network_type = networkType;
      }

      await updateRows("sheetbot_user_devices", {
        filters: { id: targetDev.id },
        updates,
      }).catch(() => {});
    }

    const existingSid =
      req.headers.get("x-visitor-session-id")?.trim() ||
      req.headers.get("x-egdesk-visitor-session")?.trim() ||
      null;
    let resolvedVisitorSid = existingSid;
    if (!resolvedVisitorSid) {
      const wsOptions: any = await getWorkspaceCallOptionsForEmail(cleanEmail, req).catch(() => ({}));
      resolvedVisitorSid = wsOptions.visitorSessionId || null;
    }

    const res = NextResponse.json({
      success: true,
      status: "CONNECTED",
      timestamp: now,
      visitorSessionId: resolvedVisitorSid,
    });
    if (resolvedVisitorSid) {
      res.headers.set("x-visitor-session-id", resolvedVisitorSid);
    }
    return res;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
