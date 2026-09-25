export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  queryTable,
  insertRows,
  updateRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/devices
 * 이용자용 전용 앱(시트봇 에이전트 / SheetBot Agent) 기기 목록 및 실시간 상태 조회
 * (과거 구글 메시지 QR 방식은 완전히 차단 및 자동 정리)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);

    const userEmail = (queryEmail && queryEmail.includes("@"))
      ? queryEmail.toLowerCase().trim()
      : (headerEmail && headerEmail.includes("@"))
      ? headerEmail.toLowerCase().trim()
      : (sessionEmail || "");

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const nowIso = new Date().toISOString();

    // 1. DB에서 회원의 디바이스 목록 조회
    const dbRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail },
      limit: 50,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const rawRows = (dbRes.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 과거 방식(구글 메시지 QR 등) 기기는 DB에서 즉시 자동 소프트 삭제 정리
    const legacyRows = rawRows.filter(
      (r: any) => r.pairing_mode !== "agent2" && r.pairing_mode !== "android_agent"
    );
    for (const leg of legacyRows) {
      void updateRows(
        "sheetbot_user_devices",
        {
          status: "DISCONNECTED",
          deleted_at: nowIso,
          deleted_by: "system_legacy_cleanup",
        },
        { filters: { id: leg.id, user_email: cleanEmail } }
      ).catch(() => {});
    }

    // 3. 오직 시트봇 에이전트(Agent2) 기기만 필터링
    const agentDevices = rawRows.filter(
      (r: any) => r.pairing_mode === "agent2" || r.pairing_mode === "android_agent"
    );

    // 마지막 하트비트 경과 시간 계산 헬퍼 (초 단위)
    const getSecondsSinceLastHeartbeat = (dateStr?: string | null): number => {
      if (!dateStr) return 999999;
      try {
        const normalized = dateStr.includes("T")
          ? dateStr
          : dateStr.replace(" ", "T") + (dateStr.endsWith("Z") ? "" : "Z");
        const lastTime = new Date(normalized).getTime();
        if (isNaN(lastTime)) {
          const fallback = new Date(dateStr).getTime();
          return isNaN(fallback) ? 999999 : Math.floor((Date.now() - fallback) / 1000);
        }
        return Math.floor((Date.now() - lastTime) / 1000);
      } catch {
        return 999999;
      }
    };

    const HEARTBEAT_TIMEOUT_SECONDS = 1800; // 30분 이내 하트비트 시 정상 연결 유지

    // 4. 상태 판정 및 서식화
    const sanitizedDevices = agentDevices.map((d: any) => {
      let computedStatus: "CONNECTED" | "DISCONNECTED" = "DISCONNECTED";

      if (d.status === "DISCONNECTED") {
        computedStatus = "DISCONNECTED";
      } else {
        const lastSignal = d.last_connected_at || d.updated_at;
        const secondsAgo = getSecondsSinceLastHeartbeat(lastSignal);
        computedStatus = secondsAgo <= HEARTBEAT_TIMEOUT_SECONDS ? "CONNECTED" : "DISCONNECTED";
      }

      const rawLast = d.last_connected_at || d.created_at;
      const normalizedLast =
        rawLast && !rawLast.includes("Z") && !rawLast.includes("+")
          ? rawLast.replace(" ", "T") + "Z"
          : rawLast;

      const batteryVal = d.battery_level ?? null;
      const isChargingVal = d.is_charging === 1;

      return {
        id: d.id,
        deviceId: d.device_id || d.id,
        label: d.label || "시트봇 에이전트 폰",
        phoneNumber: d.phone_number || "",
        pairingMode: "agent2",
        status: computedStatus,
        battery: batteryVal,
        battery_level: batteryVal,
        isCharging: isChargingVal,
        is_charging: isChargingVal ? 1 : 0,
        networkType: d.network_type || "Wi-Fi",
        lastConnectedAt: normalizedLast,
        last_connected_at: normalizedLast,
        createdAt: d.created_at,
      };
    });

    return NextResponse.json({ success: true, devices: sanitizedDevices });
  } catch (err: any) {
    console.error("[UserDevices] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/user/devices
 * 시트봇 에이전트 기기 등록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase().catch(() => {});
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const label = body.label?.trim() || "내 스마트폰";
    const phoneNumber = body.phoneNumber?.trim() || "";

    const now = new Date().toISOString();
    const newRecordId = `udev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const deviceId = `sa2_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

    await insertRows("sheetbot_user_devices", [
      {
        id: newRecordId,
        user_email: cleanEmail,
        label,
        phone_number: phoneNumber,
        device_id: deviceId,
        pairing_mode: "agent2",
        status: "PAIRING",
        last_connected_at: now,
        created_at: now,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: `시트봇 에이전트 '${label}' 등록이 시작되었습니다.`,
      device: {
        id: newRecordId,
        deviceId,
        label,
        pairingMode: "agent2",
        status: "PAIRING",
      },
    });
  } catch (err: any) {
    console.error("[UserDevices] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/user/devices
 * 시트봇 에이전트 기기 등록 해제 (소프트 삭제)
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase().catch(() => {});
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    const deviceId = searchParams.get("deviceId")?.trim();

    if (!id && !deviceId) {
      return NextResponse.json({ success: false, error: "삭제할 디바이스 식별자가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (id) {
      await updateRows(
        "sheetbot_user_devices",
        {
          status: "DISCONNECTED",
          deleted_at: now,
          deleted_by: cleanEmail,
        },
        { filters: { id, user_email: cleanEmail } }
      );
    } else if (deviceId) {
      await updateRows(
        "sheetbot_user_devices",
        {
          status: "DISCONNECTED",
          deleted_at: now,
          deleted_by: cleanEmail,
        },
        { filters: { device_id: deviceId, user_email: cleanEmail } }
      );
    }

    return NextResponse.json({
      success: true,
      message: "디바이스 연동이 성공적으로 해제되었습니다.",
    });
  } catch (err: any) {
    console.error("[UserDevices] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
