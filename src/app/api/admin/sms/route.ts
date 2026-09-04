export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows, listPhoneDevices } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_SMS_SETTINGS, AdminSmsSettings } from "@/lib/admin-sms";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // 1. 현재 저장된 SMS 설정 조회
    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_sms_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    let settings = DEFAULT_SMS_SETTINGS;

    if (validRows.length > 0 && validRows[0].value) {
      try {
        const parsed = JSON.parse(validRows[0].value);
        settings = { ...DEFAULT_SMS_SETTINGS, ...parsed };
      } catch (e) {
        console.warn("[AdminSMS] Parse error:", e);
      }
    }

    // 2. EGDesk Phone MCP를 통해 페어링된 디바이스 목록 조회
    let devices: any[] = [];
    try {
      const devRes = await listPhoneDevices();
      if (Array.isArray(devRes)) {
        devices = devRes;
      } else if (devRes && Array.isArray(devRes.devices)) {
        devices = devRes.devices;
      } else if (typeof devRes === "string") {
        try {
          devices = JSON.parse(devRes);
        } catch {}
      }
    } catch (err: any) {
      console.warn("[AdminSMS] Failed to list phone devices via MCP:", err.message);
    }

    return NextResponse.json({
      success: true,
      settings,
      devices,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const settingsData: AdminSmsSettings = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      deviceId: body.deviceId?.trim() || DEFAULT_SMS_SETTINGS.deviceId,
      adminPhone: body.adminPhone?.trim() || DEFAULT_SMS_SETTINGS.adminPhone,
      notifyOnInquiry: typeof body.notifyOnInquiry === "boolean" ? body.notifyOnInquiry : true,
      notifyOnTaxInvoice: typeof body.notifyOnTaxInvoice === "boolean" ? body.notifyOnTaxInvoice : true,
      notifyOnPayment: typeof body.notifyOnPayment === "boolean" ? body.notifyOnPayment : true,
    };

    const now = new Date().toISOString();
    const valString = JSON.stringify(settingsData);

    const existRes = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_sms_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existRes.rows && existRes.rows.length > 0) {
      await updateRows("sheetbot_settings", {
        filters: { key: "sheetbot_sms_settings" },
        updates: {
          value: valString,
          description: "관리자 구글메시지 SMS 발송 및 알림 이벤트 설정",
          updated_at: now,
          updated_by: adminEmail,
        },
      });
    } else {
      await insertRows("sheetbot_settings", [
        {
          id: `set_sms_${Date.now()}`,
          key: "sheetbot_sms_settings",
          value: valString,
          description: "관리자 구글메시지 SMS 발송 및 알림 이벤트 설정",
          created_at: now,
          updated_at: now,
          updated_by: adminEmail,
          deleted_at: null,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "관리자 구글메시지 SMS 발송 설정이 성공적으로 저장되었습니다.",
      settings: settingsData,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
