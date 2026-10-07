export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows, callSheetsTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

/**
 * GET /api/user/estimate/[estimateId]
 * 전자 견적서 상세 데이터 조회 및 최초 고객 열람 일시 기록
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ estimateId: string }> }
) {
  try {
    await setupDatabase();
    const { estimateId } = await context.params;

    if (!estimateId) {
      return NextResponse.json({ success: false, error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    let res = await queryTable("sheetbot_quotes", {
      filters: { quote_id: estimateId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let idKey = "quote_id";
    if (!res.rows || res.rows.length === 0) {
      res = await queryTable("sheetbot_quotes", {
        filters: { id: estimateId },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      idKey = "id";
    }

    if (!res.rows || res.rows.length === 0) {
      return NextResponse.json({ success: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    const raw = res.rows[0];
    const nowFormatted = getKoreanTimeString(new Date());

    // 1. 최초 열람 시 DB 업데이트
    if (!raw.viewed_at) {
      await updateRows("sheetbot_quotes", {
        filters: { [idKey]: estimateId },
        updates: {
          viewed_at: nowFormatted,
          status: raw.status === "ISSUED" ? "VIEWED" : raw.status,
        },
      }).catch(() => {});
    }

    let items = [];
    try {
      items = JSON.parse(raw.items_json || "[]");
    } catch {
      items = [];
    }

    // 2. 사업자정보 조회
    let businessInfo: Record<string, string> = {
      companyName: "스마트 간편 견적 센터",
      ownerName: "대표자",
      bizNumber: "",
      address: "",
      phone: "",
      email: raw.user_email || "",
      website: "https://sheetbot.cloud",
      sealImageUrl: "https://sheetbot.cloud/seal.png",
      paymentNotice: "견적 승인 후 작업 일정이 협의됩니다.",
      extraNotice: "현장 상황에 따라 추가 작업 비용이 발생할 수 있습니다.",
    };

    if (raw.spreadsheet_id) {
      try {
        const infoRes = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId: raw.spreadsheet_id,
            range: "사업자정보!A1:B15",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);

        if (infoRes?.values && infoRes.values.length > 0) {
          for (const row of infoRes.values) {
            if (!row || !row[0]) continue;
            const k = String(row[0]).trim();
            const v = String(row[1] || "").trim();
            if (k.includes("회사명") || k.includes("상호")) businessInfo.companyName = v;
            else if (k.includes("대표자")) businessInfo.ownerName = v;
            else if (k.includes("사업자등록번호") || k.includes("사업자번호")) businessInfo.bizNumber = v;
            else if (k.includes("주소")) businessInfo.address = v;
            else if (k.includes("연락처") || k.includes("전화")) businessInfo.phone = v;
            else if (k.includes("메일")) businessInfo.email = v;
            else if (k.includes("홈페이지") || k.includes("SNS")) businessInfo.website = v;
            else if (k.includes("직인") || k.includes("도장")) businessInfo.sealImageUrl = v;
            else if (k.includes("결제") || k.includes("시공")) businessInfo.paymentNotice = v;
            else if (k.includes("특약") || k.includes("주의사항")) businessInfo.extraNotice = v;
          }
        }
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      estimate: {
        id: raw.id,
        customer_name: raw.customer_name || "고객님",
        customer_phone: raw.customer_phone || "",
        customer_address: raw.customer_address || "",
        valid_until: raw.preferred_date || "", // 견적 유효기간
        notes: raw.notes || "",
        inquiry_text: raw.inquiry_text || "",
        items,
        supply_amount: Number(raw.supply_amount || 0),
        vat_amount: Number(raw.vat_amount || 0),
        total_amount: Number(raw.total_amount || 0),
        status: raw.status || "ISSUED",
        created_at: raw.created_at || "",
        viewed_at: raw.viewed_at || nowFormatted,
        user_email: raw.user_email,
        businessInfo,
      },
    });
  } catch (error: any) {
    console.error("[GetEstimateAPI] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load estimate" },
      { status: 500 }
    );
  }
}
