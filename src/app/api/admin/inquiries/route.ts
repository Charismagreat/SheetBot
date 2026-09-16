export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // 1. 일반 고객 문의 & FDE 제작 의뢰 (sheetbot_inquiries)
    const genRes = await queryTable("sheetbot_inquiries", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const validGenRows = (genRes.rows || [])
      .filter((r: any) => !r.deleted_at)
      .map((r: any) => {
        let aiScore = null;
        let aiCompanyAnalysis = null;
        try {
          if (r.ai_score) aiScore = typeof r.ai_score === "string" ? JSON.parse(r.ai_score) : r.ai_score;
        } catch {}
        try {
          if (r.ai_company_analysis) {
            aiCompanyAnalysis = typeof r.ai_company_analysis === "string" ? JSON.parse(r.ai_company_analysis) : r.ai_company_analysis;
            if (aiCompanyAnalysis && Array.isArray(aiCompanyAnalysis.matchedVouchers)) {
              aiCompanyAnalysis.matchedVouchers = aiCompanyAnalysis.matchedVouchers.map((v: any) => ({
                ...v,
                postUrl: typeof v?.postUrl === "string" && /^(https?:\/\/)/i.test(v.postUrl.trim()) ? v.postUrl.trim() : "",
              }));
            }
          }
        } catch {}

        return {
          ...r,
          source: "GENERAL_INQUIRY",
          category_label: r.category === "FDE_REQUEST" ? "🛠️ FDE 맞춤 의뢰" : (r.category || "💬 일반 문의"),
          ai_score: aiScore,
          ai_company_analysis: aiCompanyAnalysis,
        };
      });

    // 2. 기업 맞춤 AX 진단 & 견적 신청 (sheetbot_enterprise_inquiries)
    const entRes = await queryTable("sheetbot_enterprise_inquiries", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const validEntRows = (entRes.rows || [])
      .filter((r: any) => !r.deleted_at)
      .map((r: any) => {
        let aiScore = null;
        let aiCompanyAnalysis = null;
        try {
          if (r.ai_score) aiScore = typeof r.ai_score === "string" ? JSON.parse(r.ai_score) : r.ai_score;
        } catch {}
        try {
          if (r.ai_company_analysis) {
            aiCompanyAnalysis = typeof r.ai_company_analysis === "string" ? JSON.parse(r.ai_company_analysis) : r.ai_company_analysis;
            if (aiCompanyAnalysis && Array.isArray(aiCompanyAnalysis.matchedVouchers)) {
              aiCompanyAnalysis.matchedVouchers = aiCompanyAnalysis.matchedVouchers.map((v: any) => ({
                ...v,
                postUrl: typeof v?.postUrl === "string" && /^(https?:\/\/)/i.test(v.postUrl.trim()) ? v.postUrl.trim() : "",
              }));
            }
          }
        } catch {}

        let candidateProfiles = [];
        try {
          if (r.candidate_profiles) {
            candidateProfiles = typeof r.candidate_profiles === "string" ? JSON.parse(r.candidate_profiles) : r.candidate_profiles;
          }
        } catch {}

        return {
          id: r.id,
          source: "ENTERPRISE_INQUIRY",
          category: "ENTERPRISE_AX",
          category_label: "🏢 기업 AX 견적",
          user_name: r.contact_name + (r.contact_position ? ` (${r.contact_position})` : ""),
          company_name: r.company_name,
          biz_number: r.biz_number || null,
          website_url: r.website_url || null,
          candidate_profiles: Array.isArray(candidateProfiles) ? candidateProfiles : [],
          user_email: r.email,
          phone: r.phone,
          industry: r.industry,
          target_areas: r.target_areas,
          use_voucher: r.use_voucher,
          title: `[기업 AX 맞춤 견적] ${r.company_name || "기업"} - ${r.industry || "업종 미기재"}`,
          content: r.content || "(별도 요구사항 텍스트 미기재)",
          answer: r.answer || null,
          ai_draft: r.ai_draft || null,
          ai_score: aiScore,
          ai_company_analysis: aiCompanyAnalysis,
          status: r.status === "ANSWERED" ? "ANSWERED" : r.status === "CONTACTED" ? "ANSWERED" : (r.status || "PENDING"),
          created_at: r.created_at,
        };
      });

    // 3. 최신순(created_at 내림차순) 통합 정렬
    const combined = [...validEntRows, ...validGenRows].sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ success: true, inquiries: combined });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { inquiryId, answer, source } = body;

    if (!inquiryId || !answer) {
      return NextResponse.json({ success: false, error: "문의 ID와 답변 내용을 입력해 주세요." }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 기업 AX 견적 건 처리
    if (source === "ENTERPRISE_INQUIRY") {
      await updateRows("sheetbot_enterprise_inquiries", {
        filters: { id: inquiryId },
        updates: {
          answer: answer.trim(),
          status: "ANSWERED",
          updated_at: now,
          updated_by: userEmail,
        },
      });

      return NextResponse.json({
        success: true,
        message: "기업 AX 견적 상담 메모 및 회신 내용이 저장되었습니다.",
      });
    }

    // 일반 고객 문의 & FDE 지원/의뢰 건 처리
    await updateRows("sheetbot_inquiries", {
      filters: { id: inquiryId },
      updates: {
        answer: answer.trim(),
        status: "ANSWERED",
        answered_at: now,
        updated_at: now,
        updated_by: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "답변이 성공적으로 등록되었습니다. 고객 문의 화면에 즉시 노출됩니다.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const source = searchParams.get("source");

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 문의 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (source === "ENTERPRISE_INQUIRY") {
      await updateRows("sheetbot_enterprise_inquiries", {
        filters: { id },
        updates: {
          deleted_at: now,
          deleted_by: userEmail,
        },
      });
    } else {
      await updateRows("sheetbot_inquiries", {
        filters: { id },
        updates: {
          deleted_at: now,
          deleted_by: userEmail,
        },
      });
    }

    return NextResponse.json({ success: true, message: "문의가 소프트 삭제되었습니다." });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

