export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { generateInquiryAiDraft, saveAiDraftToDb } from "@/lib/ai-draft-helper";

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const {
      inquiryId,
      source,
      category,
      companyName,
      contactName,
      userEmail: clientEmail,
      phone,
      industry,
      targetAreas,
      useVoucher,
      title,
      content,
    } = body;

    if (!inquiryId) {
      return NextResponse.json({ success: false, error: "문의 ID가 누락되었습니다." }, { status: 400 });
    }

    // 1순위: FDE 파트너 지원서 여부 검사
    const isFdeApp =
      category === "FDE_APPLICATION" ||
      (title && title.includes("파트너 지원")) ||
      (content && content.includes("[지원자 정보]"));

    // 2순위: FDE 맞춤 구축 의뢰 여부 검사
    const isFdeReq =
      category === "FDE_REQUEST" ||
      (title && title.includes("맞춤 구축 의뢰")) ||
      (content && content.includes("[의뢰자 정보]"));

    // 3순위: 기업 AX 맞춤 견적 여부 검사 (명시적 source 또는 category로만 판별)
    const isEnterprise =
      !isFdeApp &&
      !isFdeReq &&
      (source === "ENTERPRISE_INQUIRY" || category === "ENTERPRISE_AX");

    const type = isFdeApp
      ? "FDE_APPLICATION"
      : isEnterprise
      ? "ENTERPRISE"
      : isFdeReq
      ? "FDE_REQUEST"
      : "GENERAL";

    const aiDraft = await generateInquiryAiDraft({
      type,
      companyName,
      contactName,
      userEmail: clientEmail,
      phone,
      industry,
      targetAreas,
      useVoucher,
      title,
      content,
    });

    // DB에 캐싱 저장
    const targetTable = isEnterprise ? "sheetbot_enterprise_inquiries" : "sheetbot_inquiries";
    await saveAiDraftToDb(targetTable, inquiryId, aiDraft).catch((e) => {
      console.warn("[AI Draft Route] Failed to cache draft in DB:", e.message);
    });

    return NextResponse.json({
      success: true,
      aiDraft,
      message: "AI 추천 답변 초안이 성공적으로 생성되었습니다.",
    });
  } catch (err: any) {
    console.error("[AI Draft Route Error]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
