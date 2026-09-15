import { NextRequest, NextResponse } from "next/server";
import { setupDatabase, insertRows } from "@/lib/setup-db";

export async function POST(request: NextRequest) {
  try {
    await setupDatabase();

    const body = await request.json();
    const {
      companyName,
      contactName,
      contactPosition,
      phone,
      email,
      industry,
      targetAreas,
      useVoucher,
      content,
    } = body;

    if (!companyName || !contactName || !phone || !email) {
      return NextResponse.json(
        { success: false, error: "회사명, 담당자명, 연락처, 이메일은 필수 입력 항목입니다." },
        { status: 400 }
      );
    }

    const inquiryId = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newRow = {
      id: inquiryId,
      company_name: String(companyName).trim(),
      contact_name: String(contactName).trim(),
      contact_position: String(contactPosition || "").trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      industry: String(industry || "").trim(),
      target_areas: Array.isArray(targetAreas) ? targetAreas.join(", ") : String(targetAreas || "").trim(),
      use_voucher: String(useVoucher || "NO").trim(),
      content: String(content || "").trim(),
      status: "PENDING",
      created_at: new Date().toISOString(),
    };

    await insertRows("sheetbot_enterprise_inquiries", [newRow]);

    return NextResponse.json({
      success: true,
      message: "무료 AX 진단 및 맞춤 구축 상담 신청이 성공적으로 접수되었습니다. 24시간 이내에 전문 컨설턴트가 연락드리겠습니다.",
      inquiryId,
    });
  } catch (err: any) {
    console.error("[Enterprise Inquiry API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "문의 접수 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
