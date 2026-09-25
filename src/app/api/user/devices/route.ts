export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  listPhoneDevices,
  createPhoneDevice,
  deletePhoneDevice,
  connectPhoneDevice,
  queryTable,
  insertRows,
  updateRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/devices
 * 로그인된 회원의 등록 디바이스 목록 및 실시간 상태 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. DB에서 회원의 디바이스 목록 조회
    const dbRes = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail },
      limit: 50,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    const userDevices = (dbRes.rows || []).filter((r: any) => !r.deleted_at);

    // 2. 전체 디바이스 실시간 상태 조회 (구글 메시지 QR 기기가 있을 때만 1.5초 타임아웃 보호 하에 안전 조회)
    let liveDeviceMap: Record<string, any> = {};
    const hasLegacyDevice = userDevices.some(
      (d: any) => d.pairing_mode !== "agent2" && d.pairing_mode !== "android_agent"
    );

    if (hasLegacyDevice) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Phone MCP timeout")), 1500)
        );
        const devRes = (await Promise.race([listPhoneDevices(), timeoutPromise])) as any;
        let allDevices: any[] = [];
        if (Array.isArray(devRes)) {
          allDevices = devRes;
        } else if (devRes && Array.isArray(devRes.devices)) {
          allDevices = devRes.devices;
        } else if (typeof devRes === "string") {
          try {
            allDevices = JSON.parse(devRes);
          } catch {}
        }
        for (const d of allDevices) {
          const id = d.id || d.deviceId || d.label;
          if (id) liveDeviceMap[id] = d;
        }
      } catch (err: any) {
        console.warn("[UserDevices] live devices fetch skipped or timed out:", err.message);
      }
    }

    // 3. 마지막 하트비트 경과 시간 계산 헬퍼 (초 단위)
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

    const HEARTBEAT_TIMEOUT_SECONDS = 1800; // 30분(1800초) 이내 통신 시 정상 연결로 유지 (스마트폰 절전 및 주기 고려)
    const nowIso = new Date().toISOString();

    // 4. DB 정보와 실시간 상태 병합 및 상태 판정
    const mergedDevices = userDevices.map((d: any) => {
      const live = liveDeviceMap[d.device_id || d.id] || {};
      const isAndroidAgent = d.pairing_mode === "android_agent" || d.pairing_mode === "agent2";

      let computedStatus: "CONNECTED" | "DISCONNECTED" = "DISCONNECTED";

      if (isAndroidAgent) {
        // 스마트폰 앱(SheetBot Agent): DB 상태가 명시적으로 DISCONNECTED이면 즉시 해제 판정
        if (d.status === "DISCONNECTED") {
          computedStatus = "DISCONNECTED";
        } else {
          // 마지막 생존 신호 수신 일시 기준 타임아웃 검사
          const lastSignal = d.last_connected_at || d.updated_at;
          const secondsAgo = getSecondsSinceLastHeartbeat(lastSignal);
          computedStatus = secondsAgo <= HEARTBEAT_TIMEOUT_SECONDS ? "CONNECTED" : "DISCONNECTED";
        }
      } else {
        // 구글 메시지 웹/Phone MCP 기기
        const isMcpConnected =
          Boolean(live.connected) ||
          live.status === "connected" ||
          live.status === "paired" ||
          Boolean(live.last_paired_at);
        computedStatus = isMcpConnected ? "CONNECTED" : "DISCONNECTED";
      }

      const rawLast = live.lastConnectedAt || live.last_paired_at || d.last_connected_at || d.created_at;
      const normalizedLast = rawLast && !rawLast.includes("Z") && !rawLast.includes("+")
        ? rawLast.replace(" ", "T") + "Z"
        : rawLast;

      const batteryVal = isAndroidAgent ? (d.battery_level ?? null) : (live.batteryLevel || live.battery || null);
      const isChargingVal = isAndroidAgent ? (d.is_charging === 1) : !!live.isCharging;

      return {
        id: d.id,
        deviceId: d.device_id || d.id,
        label: d.label,
        phoneNumber: d.phone_number || live.phoneNumber || live.linked_phone || "",
        pairingMode: d.pairing_mode || "qr",
        status: computedStatus,
        battery: batteryVal,
        battery_level: batteryVal,
        isCharging: isChargingVal,
        is_charging: isChargingVal ? 1 : 0,
        networkType: live.networkType || "Wi-Fi",
        lastConnectedAt: normalizedLast,
        last_connected_at: normalizedLast,
        createdAt: d.created_at,
      };
    });

    // 5. DB 상태 양방향 자동 동기화 (오프라인 감지 시 DB를 DISCONNECTED로 즉시 자동 갱신)
    for (const merged of mergedDevices) {
      const dbRecord = userDevices.find((r: any) => r.id === merged.id);
      if (!dbRecord) continue;

      if (merged.status === "DISCONNECTED" && dbRecord.status === "CONNECTED") {
        // 앱이 꺼졌거나 통신이 두절되어 오프라인으로 판정된 경우 -> DB 즉시 DISCONNECTED 전환
        void updateRows(
          "sheetbot_user_devices",
          { status: "DISCONNECTED", updated_at: nowIso },
          { filters: { id: merged.id, user_email: cleanEmail } }
        ).catch((err) => console.warn("[UserDevices] Auto-offline sync warning:", err.message));
      } else if (merged.status === "CONNECTED" && dbRecord.status !== "CONNECTED") {
        // 생존 신호가 정상 도착하여 온라인 상태인 경우 -> DB CONNECTED로 동기화
        void updateRows(
          "sheetbot_user_devices",
          { status: "CONNECTED", updated_at: nowIso },
          { filters: { id: merged.id, user_email: cleanEmail } }
        ).catch((err) => console.warn("[UserDevices] Auto-online sync warning:", err.message));
      }
    }

    return NextResponse.json({ success: true, devices: mergedDevices });
  } catch (err: any) {
    console.error("[UserDevices] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/user/devices
 * 회원의 새 안드로이드 디바이스 등록 및 QR/구글 계정 페어링 시작
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const label = body.label?.trim();
    const pairingMode = body.pairingMode || "qr"; // 'qr' or 'google_account'
    const googleProfileName = pairingMode === "google_account" ? (body.googleProfileName?.trim() || cleanEmail) : undefined;
    const phoneNumber = body.phoneNumber?.trim() || "";

    if (!label) {
      return NextResponse.json(
        { success: false, error: "기기 별칭(예: 내 스마트폰)을 입력해 주세요." },
        { status: 400 }
      );
    }

    const deviceIdPrefix = `usr_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

    // 1. Phone MCP 프로필 생성
    let targetDeviceId = deviceIdPrefix;
    try {
      const createRes = await createPhoneDevice({
        label: `${label} (${cleanEmail})`,
        id: deviceIdPrefix,
        ...(googleProfileName ? { googleProfileName } : {}),
      });

      let parsed = createRes;
      if (typeof createRes === "string") {
        try { parsed = JSON.parse(createRes); } catch {}
      }
      targetDeviceId = parsed?.id || parsed?.device?.id || deviceIdPrefix;
    } catch (createErr: any) {
      console.warn("[UserDevices] Phone MCP create warning:", createErr.message);
    }

    // 2. 연결 세션 요청 (QR코드 생성 또는 구글 계정 브라우저 연결)
    let pairingData: any = {};
    try {
      const connRes = await connectPhoneDevice(targetDeviceId);
      if (typeof connRes === "string") {
        try { pairingData = JSON.parse(connRes); } catch { pairingData = { message: connRes }; }
      } else {
        pairingData = connRes || {};
      }
    } catch (connErr: any) {
      console.warn("[UserDevices] connectPhoneDevice warning:", connErr.message);
      pairingData = {
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=sheetbot-pair-${targetDeviceId}`,
        message: "QR 코드를 생성했습니다. 구글 메시지 앱의 '기기 페어링'으로 스캔해 주세요.",
      };
    }

    // 3. DB에 회원 디바이스 레코드 저장
    const now = new Date().toISOString();
    const newRecordId = `udev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await insertRows("sheetbot_user_devices", [
      {
        id: newRecordId,
        user_email: cleanEmail,
        label,
        phone_number: phoneNumber,
        device_id: targetDeviceId,
        pairing_mode: pairingMode,
        google_profile_name: googleProfileName || "",
        status: "PAIRING",
        last_connected_at: now,
        created_at: now,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: `디바이스 '${label}' 등록이 시작되었습니다.`,
      device: {
        id: newRecordId,
        deviceId: targetDeviceId,
        label,
        pairingMode,
        status: "PAIRING",
      },
      pairingData,
    });
  } catch (err: any) {
    console.error("[UserDevices] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/user/devices
 * 회원 디바이스 등록 해제 (소프트 삭제)
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
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

    // 1. Phone MCP 연결 해제 시도
    if (deviceId) {
      try {
        await deletePhoneDevice(deviceId);
      } catch (delErr: any) {
        console.warn("[UserDevices] MCP delete warning:", delErr.message);
      }
    }

    // 2. DB 소프트 삭제 (반드시 user_email 일치 검증)
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
