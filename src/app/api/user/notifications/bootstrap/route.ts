export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";

function mapNotificationDevice(d: any) {
  const rawLast = d.last_connected_at || d.last_ping || d.updated_at || d.created_at;
  let computedStatus: "CONNECTED" | "DISCONNECTED" = "DISCONNECTED";
  if (d.status === "DISCONNECTED") {
    computedStatus = "DISCONNECTED";
  } else if (d.status === "CONNECTED" && !rawLast) {
    computedStatus = "CONNECTED";
  } else if (rawLast) {
    const norm = rawLast.includes("T") ? rawLast : rawLast.replace(" ", "T") + (rawLast.endsWith("Z") ? "" : "Z");
    const lastTime = new Date(norm).getTime();
    const secondsAgo = isNaN(lastTime) ? 999999 : Math.floor((Date.now() - lastTime) / 1000);
    computedStatus = (secondsAgo <= 7200 || d.status === "CONNECTED") ? "CONNECTED" : "DISCONNECTED";
  } else if (d.status === "CONNECTED") {
    computedStatus = "CONNECTED";
  }

  const batteryVal = d.battery_level ?? null;
  const isChargingVal = d.is_charging === 1;

  return {
    id: d.id,
    deviceId: d.device_id || d.id,
    label: d.label || "시트봇 에이전트 폰",
    phoneNumber: d.phone_number || "",
    pairingMode: d.pairing_mode || "agent2",
    status: computedStatus,
    battery: batteryVal,
    battery_level: batteryVal,
    isCharging: isChargingVal,
    is_charging: isChargingVal ? 1 : 0,
    networkType: d.network_type || "Wi-Fi",
    lastConnectedAt: rawLast,
    last_connected_at: rawLast,
    createdAt: d.created_at,
  };
}

/**
 * OPTIONS /api/user/notifications/bootstrap
 * 브라우저 CORS 프리플라이트 대응
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-email, x-sheetbot-user-email",
    },
  });
}

/**
 * GET /api/user/notifications/bootstrap
 * ⚡ 스마트 알림 센터 전체 데이터(디바이스, 규칙, 로그)를 단 1회의 서버 내부 병렬 쿼리로 초고속 반환
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    let userEmail: string | null = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : null;

    if (!userEmail) {
      userEmail = await getCurrentUserEmail(request).catch(() => null);
    }

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // ⚡ 각 쿼리에 4초 타임아웃 레이스를 두어 터널 락/무한 행을 물리적으로 원천 차단
    const timeoutRace = <T>(promise: Promise<T>, fallback: T, ms = 4000): Promise<T> => {
      const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
      return Promise.race([promise, timeout]);
    };

    // 3개 필수 쿼리 완전 병렬 실행 (최대 4초 가드)
    const [devicesRes, rulesRes, logsRes] = await Promise.all([
      // 1. 디바이스 목록
      timeoutRace(
        queryTable("sheetbot_user_devices", {
          filters: { user_email: cleanEmail },
          limit: 50,
          orderBy: "id",
          orderDirection: "DESC",
        }).catch(() => ({ rows: [] })),
        { rows: [] },
        4000
      ),

      // 2. 스마트 규칙 목록
      timeoutRace(
        queryTable("sheetbot_user_smart_rules", {
          filters: { user_email: cleanEmail },
          limit: 100,
          orderBy: "id",
          orderDirection: "DESC",
        }).catch(() => ({ rows: [] })),
        { rows: [] },
        4000
      ),

      // 3. 발송 로그 목록
      timeoutRace(
        queryTable("sheetbot_user_dispatch_logs", {
          filters: { user_email: cleanEmail },
          limit: 100,
          orderBy: "id",
          orderDirection: "DESC",
        }).catch(() => ({ rows: [] })),
        { rows: [] },
        4000
      ),
    ]);

    // 1. 디바이스 필터링 & 가공
    const rawDevices = (devicesRes.rows || []).filter((r: any) => !r.deleted_at);
    const agentDevices = rawDevices
      .filter((r: any) => r.pairing_mode === "agent2" || r.pairing_mode === "agent")
      .map(mapNotificationDevice);

    // 2. 규칙 필터링
    const validRules = (rulesRes.rows || []).filter((r: any) => !r.deleted_at);

    // 3. 로그 필터링
    const validLogs = (logsRes.rows || []).filter((r: any) => !r.deleted_at);

    return NextResponse.json(
      {
        success: true,
        devices: agentDevices,
        rules: validRules,
        logs: validLogs,
        data: {
          devices: agentDevices,
          rules: validRules,
          logs: validLogs,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("[NotificationsBootstrap] GET error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "데이터 수신 오류" },
      { status: 500 }
    );
  }
}
