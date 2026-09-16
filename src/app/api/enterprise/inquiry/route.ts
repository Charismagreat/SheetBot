import { NextRequest, NextResponse } from "next/server";
import { setupDatabase, insertRows } from "@/lib/setup-db";

export async function POST(request: NextRequest) {
  try {
    await setupDatabase();

    const body = await request.json();
    const {
      companyName,
      bizNumber,
      websiteUrl,
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
      biz_number: String(bizNumber || "").trim(),
      website_url: String(websiteUrl || "").trim(),
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

    // 백그라운드 AI 맞춤 회신 초안 및 B2B 리드 분석 비동기 사전 생성
    try {
      const { generateAndSaveAiDraftAsync } = await import("@/lib/ai-draft-helper");
      const { generateAndSaveLeadAnalysisAsync, collectAndSaveCandidatesAsync } = await import(
        "@/lib/ai-lead-analyzer"
      );

      const draftInput = {
        type: "ENTERPRISE" as const,
        companyName: newRow.company_name,
        contactName: newRow.contact_name + (newRow.contact_position ? ` ${newRow.contact_position}` : ""),
        userEmail: newRow.email,
        phone: newRow.phone,
        industry: newRow.industry,
        targetAreas: newRow.target_areas,
        useVoucher: newRow.use_voucher,
        content: newRow.content,
      };

      // 1. AI 맞춤 응대 초안은 신청 내용 기반이므로 상시 생성
      generateAndSaveAiDraftAsync("sheetbot_enterprise_inquiries", inquiryId, draftInput);

      // 2. 사업자번호 또는 웹사이트가 입력되었는지 확인
      const hasExactIdentifier = Boolean(newRow.biz_number || newRow.website_url);

      if (hasExactIdentifier) {
        // 식별자가 제공된 경우: 해당 고유 정보로 즉시 정확한 리드 분석 실행
        const leadInput = {
          ...draftInput,
          bizNumber: newRow.biz_number,
          websiteUrl: newRow.website_url,
        };
        generateAndSaveLeadAnalysisAsync("sheetbot_enterprise_inquiries", inquiryId, leadInput);
      } else {
        // 식별자가 미입력된 경우: 동명/유사 상호 오분석 방지를 위해 자동 분석을 보류하고 후보군만 수집 (Human-in-the-Loop)
        collectAndSaveCandidatesAsync(
          "sheetbot_enterprise_inquiries",
          inquiryId,
          newRow.company_name
        );
      }
    } catch (e: any) {
      console.warn("[Enterprise Inquiry] Failed to trigger background AI tasks:", e.message);
    }

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
