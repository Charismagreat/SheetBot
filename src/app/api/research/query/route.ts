export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  lookupNpsWorkplace,
  searchNpsWorkplaces,
  lookupKonepsVendor,
  searchKonepsContracts,
  lookupBidNotices,
  searchBidNotices,
  runCompanyResearch,
} from "@/lib/egdesk-helpers";

/**
 * POST /api/research/query
 * 국민연금(NPS), 나라장터(KONEPS/BidNotice), 기업 리서치 통합 조회 엔드포인트
 */
export async function POST(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail();
    const body = await req.json();
    const { type, query, options = {} } = body;

    if (!type || !query) {
      return NextResponse.json(
        { success: false, error: "type(nps, koneps, bidnotice, company)과 query(검색어)가 필요합니다." },
        { status: 400 }
      );
    }

    let result: any = null;

    switch (type) {
      case "nps":
      case "pension":
        // 국민연금 가입 사업장/직원수/추이 조회
        result = await lookupNpsWorkplace({
          workplaceName: query,
          businessNumber: options.businessNumber,
          sidoCode: options.sidoCode,
          display: options.display || 10,
        });
        break;

      case "nps_search":
        result = await searchNpsWorkplaces({
          workplaceName: query,
          businessNumber: options.businessNumber,
          page: options.page || 1,
          display: options.display || 10,
        });
        break;

      case "koneps":
      case "contracts":
        // 나라장터 계약 실적/낙찰 정보 조회
        result = await lookupKonepsVendor({
          companyName: query,
          businessNumber: options.businessNumber,
          startDate: options.startDate,
          endDate: options.endDate,
          category: options.category,
          display: options.display || 10,
        });
        break;

      case "koneps_search":
        result = await searchKonepsContracts(options);
        break;

      case "bidnotice":
      case "bids":
        // 나라장터 입찰공고 실시간 조회
        result = await lookupBidNotices({
          title: query,
          institutionName: options.institutionName,
          startDate: options.startDate,
          endDate: options.endDate,
          openOnly: options.openOnly ?? true,
          display: options.display || 10,
        });
        break;

      case "bidnotice_search":
        result = await searchBidNotices(options);
        break;

      case "company":
      case "research":
        // 기업 심층 웹 리서치
        result = await runCompanyResearch(query, {
          companyName: options.companyName,
          clientBusinessNumber: options.businessNumber,
          bypassCache: options.bypassCache,
        });
        break;

      default:
        return NextResponse.json(
          { success: false, error: `지원하지 않는 type입니다: ${type} (지원: nps, koneps, bidnotice, company)` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      type,
      query,
      data: result,
      queriedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Research-Query-API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "조회 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
