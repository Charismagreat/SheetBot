export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { sendAdminNotificationSms } from "@/lib/admin-sms";
import { sendAdminNotificationEmail } from "@/lib/admin-email";
import { executeSmartDispatchRules } from "@/lib/smart-dispatch-rules";

// 세금계산서 / 현금영수증 신청 목록 조회
export async function GET() {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_tax_invoices", {
      filters: { user_email: userEmail.toLowerCase().trim() },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 50,
    }).catch(() => ({ rows: [] }));

    const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    return NextResponse.json({
      success: true,
      requests: validRows,
    });
  } catch (err: any) {
    console.error("[Tax-Invoice-API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// 세금계산서 / 현금영수증 신청 접수
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, type, companyName, bizNumber, ceoName, managerEmail, amountKrw } = body;

    if (!bizNumber || !managerEmail) {
      return NextResponse.json({ success: false, error: "사업자/식별번호 및 세금계산서 수신 이메일은 필수입니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const reqId = 	ax__;

    await insertRows("sheetbot_tax_invoices", [
      {
        id: reqId,
        uuid: crypto.randomUUID(),
        order_id: orderId || ord_,
        user_email: userEmail.toLowerCase().trim(),
        type: type || "TAX_INVOICE",
        company_name: companyName || "",
        biz_number: bizNumber.trim(),
        ceo_name: ceoName || "",
        manager_email: managerEmail.trim(),
        amount_krw: Number(amountKrw || 0),
        status: "REQUESTED",
        created_at: now,
        updated_at: now,
        updated_by: userEmail,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);

    // 관리자 SMS 알림 비동기 전송 (백그라운드 처리)
    sendAdminNotificationSms("tax_invoice", {
      userEmail,
      companyName: companyName || "고객사",
      amount: Number(amountKrw || 0),
    }).catch((smsErr) => console.warn("[TaxInvoice SMS Notification] Error:", smsErr));

    // 관리자 이메일 알림 비동기 전송 (백그라운드 처리)
    sendAdminNotificationEmail("tax_invoice", {
      userEmail,
      companyName: companyName || "고객사",
      amount: Number(amountKrw || 0),
    }).catch((emailErr) => console.warn("[TaxInvoice Email Notification] Error:", emailErr));

    // AI 자연어 기반 스마트 발송 규칙 실행
    executeSmartDispatchRules("tax_invoice", {
      userEmail,
      companyName: companyName || "고객사",
      amount: Number(amountKrw || 0),
    }).catch((ruleErr) => console.warn("[TaxInvoice SmartRules Notification] Error:", ruleErr));

    return NextResponse.json({
      success: true,
      message: type === "CASH_RECEIPT" ? "현금영수증 발행 요청이 성공적으로 접수되었습니다." : "전자세금계산서 발행 요청이 성공적으로 접수되었습니다.",
      requestId: reqId,
    });
  } catch (err: any) {
    console.error("[Tax-Invoice-API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
