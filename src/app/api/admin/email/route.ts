export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { DEFAULT_SMTP_SETTINGS, AdminSmtpSettings } from "@/lib/admin-email";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_smtp_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);
    let settings = DEFAULT_SMTP_SETTINGS;

    if (validRows.length > 0 && validRows[0].value) {
      try {
        const parsed = JSON.parse(validRows[0].value);
        settings = { ...DEFAULT_SMTP_SETTINGS, ...parsed };
      } catch (e) {
        console.warn("[AdminEmail] Parse error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      settings,
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
    const settingsData: AdminSmtpSettings = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : true,
      host: body.host?.trim() || "smtp.gmail.com",
      port: Number(body.port) || 465,
      secure: Number(body.port) === 465,
      user: body.user?.trim() || "",
      pass: body.pass?.trim() || "",
      fromName: body.fromName?.trim() || "SheetBot",
      adminEmail: body.adminEmail?.trim() || body.user?.trim() || "",
      notifyOnInquiry: typeof body.notifyOnInquiry === "boolean" ? body.notifyOnInquiry : true,
      notifyOnTaxInvoice: typeof body.notifyOnTaxInvoice === "boolean" ? body.notifyOnTaxInvoice : true,
      notifyOnPayment: typeof body.notifyOnPayment === "boolean" ? body.notifyOnPayment : true,
    };

    const now = new Date().toISOString();
    const valString = JSON.stringify(settingsData);

    const existRes = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_smtp_settings" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existRes.rows && existRes.rows.length > 0) {
      await updateRows("sheetbot_settings", {
        filters: { key: "sheetbot_smtp_settings" },
        updates: {
          value: valString,
          description: "발송 메일 SMTP 계정 설정 및 알림 이벤트",
          updated_at: now,
          updated_by: adminEmail,
        },
      });
    } else {
      await insertRows("sheetbot_settings", [
        {
          id: `set_smtp_${Date.now()}`,
          key: "sheetbot_smtp_settings",
          value: valString,
          description: "발송 메일 SMTP 계정 설정 및 알림 이벤트",
          created_at: now,
          updated_at: now,
          updated_by: adminEmail,
          deleted_at: null,
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      message: "발송 메일 SMTP 설정이 성공적으로 저장되었습니다.",
      settings: settingsData,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
