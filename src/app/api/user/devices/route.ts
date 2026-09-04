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
    const userEmail = await getCurrentUserEmail();
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

    // 2. 전체 디바이스 실시간 상태 조회 (Phone MCP)
    let liveDeviceMap: Record<string, any> = {};
    try {
      const devRes = await listPhoneDevices();
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
    } catch (err) {
      console.warn("[UserDevices] live devices fetch warning:", err);
    }

    // 3. DB 정보와 실시간 상태 병합
    const mergedDevices = userDevices.map((d: any) => {
      const live = liveDeviceMap[d.device_id || d.id] || {};
      return {
        id: d.id,
        deviceId: d.device_id || d.id,
        label: d.label,
        phoneNumber: d.phone_number || live.phoneNumber || "",
        pairingMode: d.pairing_mode || "qr",
        status: live.connected || live.status === "connected" ? "CONNECTED" : (d.status || "DISCONNECTED"),
        battery: live.batteryLevel || live.battery || null,
        isCharging: !!live.isCharging,
        networkType: live.networkType || "Wi-Fi",
        lastConnectedAt: live.lastConnectedAt || d.last_connected_at || d.created_at,
        createdAt: d.created_at,
      };
    });

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
    const userEmail = await getCurrentUserEmail();
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
      const connRes = await connectPhoneDevice(targetDeviceId, pairingMode);
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
    const userEmail = await getCurrentUserEmail();
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
      await updateRows("sheetbot_user_devices", {
        filters: { id, user_email: cleanEmail },
        updates: {
          status: "DISCONNECTED",
          deleted_at: now,
          deleted_by: cleanEmail,
        },
      });
    } else if (deviceId) {
      await updateRows("sheetbot_user_devices", {
        filters: { device_id: deviceId, user_email: cleanEmail },
        updates: {
          status: "DISCONNECTED",
          deleted_at: now,
          deleted_by: cleanEmail,
        },
      });
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
