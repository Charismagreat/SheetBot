import { NextRequest, NextResponse } from "next/server";
import { callCompanyResearchTool } from "@/lib/egdesk-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/company-research/doc?id=xxx 또는 ?bNo=xxx
 * 기업 리서치 문서(TipTap JSON 및 메타데이터) 조회
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("id") || "";
    const businessNumber = searchParams.get("bNo") || "";

    if (!docId && !businessNumber) {
      return NextResponse.json(
        { error: "docId or businessNumber is required" },
        { status: 400 }
      );
    }

    const docRes = await callCompanyResearchTool("companyresearch_doc_get", {
      docId: docId || undefined,
      businessNumber: businessNumber || undefined,
    });

    return NextResponse.json({
      success: true,
      doc: docRes,
    });
  } catch (error: any) {
    console.error("[CompanyResearchDoc] Fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch research doc" },
      { status: 500 }
    );
  }
}
