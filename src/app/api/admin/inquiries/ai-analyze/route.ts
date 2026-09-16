export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { analyzeInquiryLead, saveLeadAnalysisToDb } from "@/lib/ai-lead-analyzer";

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
      bizNumber,
      websiteUrl,
      selectedProfile,
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

    if (!companyName || !companyName.trim() || companyName === "미기재 기업" || companyName === "귀사") {
      return NextResponse.json(
        { success: false, error: "기업 정보(상호명)가 기재되지 않은 문의는 기업 AI 진단을 실행할 수 없습니다." },
        { status: 400 }
      );
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

    // 3순위: 기업 AX 맞춤 견적 여부 검사
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

    const targetTable = isEnterprise ? "sheetbot_enterprise_inquiries" : "sheetbot_inquiries";

    let profileToUse = selectedProfile;
    if (profileToUse === undefined) {
      // 이전에 확정/저장된 프로필이 있다면 재분석 시에도 해당 기업 유지
      const { queryTable } = await import("@/lib/setup-db");
      const existing = await queryTable(targetTable, {
        filters: { id: inquiryId },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (existing.rows && existing.rows[0]?.ai_company_analysis) {
        try {
          const parsedAnalysis =
            typeof existing.rows[0].ai_company_analysis === "string"
              ? JSON.parse(existing.rows[0].ai_company_analysis)
              : existing.rows[0].ai_company_analysis;
          if (parsedAnalysis?.realCompanyProfile) {
            profileToUse = parsedAnalysis.realCompanyProfile;
          }
        } catch {}
      }
    }

    const result = await analyzeInquiryLead(
      {
        type,
        companyName,
        bizNumber,
        websiteUrl,
        contactName,
        userEmail: clientEmail,
        phone,
        industry,
        targetAreas,
        useVoucher,
        title,
        content,
      },
      profileToUse
    );

    // DB에 캐싱 저장
    await saveLeadAnalysisToDb(targetTable, inquiryId, result).catch((e) => {
      console.warn("[AI Lead Analyzer Route] Failed to cache analysis in DB:", e.message);
    });

    return NextResponse.json({
      success: true,
      score: result.score,
      analysis: result.analysis,
      message: "AI B2B 리드 스코어링 및 정부지원사업 매칭 분석이 완료되었습니다.",
    });
  } catch (err: any) {
    console.error("[AI Lead Analyzer Route Error]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
