export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  listPhoneDevices,
  createPhoneDevice,
  deletePhoneDevice,
  connectPhoneDevice,
  updatePhoneDevice,
} from "@/lib/egdesk-helpers";

// 기기 목록 조회
export async function GET(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const devRes = await listPhoneDevices();
    let devices: any[] = [];
    if (Array.isArray(devRes)) {
      devices = devRes;
    } else if (devRes && Array.isArray(devRes.devices)) {
      devices = devRes.devices;
    } else if (typeof devRes === "string") {
      try {
        devices = JSON.parse(devRes);
      } catch {}
    }

    return NextResponse.json({ success: true, devices });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 새 기기 추가 생성
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const label = body.label?.trim();
    const id = body.id?.trim();

    if (!label) {
      return NextResponse.json(
        { success: false, error: "디바이스 별칭(라벨)을 입력해 주세요." },
        { status: 400 }
      );
    }

    // 1. 디바이스 프로필 생성
    const createRes = await createPhoneDevice({
      label,
      ...(id ? { id } : {}),
    });

    let newDevice = createRes;
    if (typeof createRes === "string") {
      try {
        newDevice = JSON.parse(createRes);
      } catch {}
    }

    const targetId = newDevice?.id || newDevice?.device?.id || id;

    return NextResponse.json({
      success: true,
      message: `디바이스 [${label}] 프로필이 생성되었습니다.`,
      device: newDevice,
      deviceId: targetId,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 기기 삭제
export async function DELETE(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get("deviceId")?.trim();

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "삭제할 디바이스 ID가 필요합니다." }, { status: 400 });
    }

    await deletePhoneDevice(deviceId);

    return NextResponse.json({
      success: true,
      message: `디바이스 [${deviceId}]가 성공적으로 삭제되었습니다.`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 기기 페어링 연결 요청 (QR 페어링 브라우저 실행)
export async function PUT(req: NextRequest) {
  try {
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const deviceId = body.deviceId?.trim();
    const action = body.action || "connect"; // 'connect' or 'update'

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "디바이스 ID가 필요합니다." }, { status: 400 });
    }

    if (action === "connect") {
      // 비동기 브라우저 QR 페어링 세션 트리거 (백그라운드에서 진행될 수 있도록 처리)
      connectPhoneDevice(deviceId).catch((e) =>
        console.warn(`[AdminSMS Devices] connectPhoneDevice async:`, e.message)
      );

      return NextResponse.json({
        success: true,
        message: "Google Messages QR 페어링 창을 열었습니다. 스마트폰으로 QR코드를 스캔해 주세요.",
      });
    }

    if (action === "update") {
      const label = body.label?.trim();
      await updatePhoneDevice({ deviceId, label });
      return NextResponse.json({ success: true, message: "기기 정보가 수정되었습니다." });
    }

    return NextResponse.json({ success: false, error: "지원하지 않는 액션입니다." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
