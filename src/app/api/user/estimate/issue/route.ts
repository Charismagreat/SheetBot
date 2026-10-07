export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows, callSheetsTool, queryTable } from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface EstimateIssueItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

/**
 * POST /api/user/estimate/issue
 * 정식 전자 견적서 발행 (사장님 직접 발행 및 고객 셀프 발행 지원)
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json();

    const {
      userKey,
      userEmail: directEmail,
      customerName,
      customerPhone,
      customerAddress = "",
      validDays = 14,
      notes = "",
      items = [],
      source = "ESTIMATE_ISSUE", // 'DIRECT_ISSUE' | 'SELF_ESTIMATE'
    } = body;

    if (!customerName || !customerPhone) {
      return NextResponse.json(
        { success: false, error: "고객명과 연락처는 필수 입력 항목입니다." },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "견적에 포함할 품목을 1개 이상 선택해 주세요." },
        { status: 400 }
      );
    }

    // 1. 사장님 이메일 식별
    let targetEmail = "chachogreat@gmail.com";
    if (userKey) {
      const resolved = await resolveUserEmailFromKey(userKey);
      if (resolved) targetEmail = resolved;
    } else if (directEmail) {
      targetEmail = directEmail.toLowerCase().trim();
    } else {
      const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
      if (sessionEmail) targetEmail = sessionEmail;
    }

    // 2. 금액 및 세액 재계산
    const validItems: EstimateIssueItem[] = items.map((item: any, idx: number) => {
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      const price = parseInt(item.discountPrice ?? item.unitPrice ?? 0, 10);
      return {
        code: item.code || `EST-${idx + 1}`,
        category: item.category || "일반",
        name: item.name || "품목",
        spec: item.spec || "1식",
        unitPrice: price,
        quantity: qty,
        amount: price * qty,
      };
    });

    const supplyAmount = validItems.reduce((acc, cur) => acc + cur.amount, 0);
    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalAmount = supplyAmount + vatAmount;

    // 3. 견적번호 및 발행/유효 일시 생성
    const estimateId = `est_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const todayFormatted = getKoreanTimeString(now);

    const validUntilDate = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
    const validUntilFormatted = validUntilDate.toISOString().split("T")[0]; // YYYY-MM-DD

    const itemsSummary = validItems
      .map((item) => {
        const rawSpec = (item.spec || "").trim();
        const unit = rawSpec.replace(/^\d+\s*/, "") || rawSpec || "개";
        return `${item.name}(${item.quantity}${unit})`;
      })
      .join(", ");

    // 4. 사장님 구글 시트 바인딩 확인
    let spreadsheetId = "";
    try {
      const resolvedSheet = await resolveUserSpreadsheet({
        userEmail: targetEmail,
        sheetType: "ESTIMATE",
        defaultTitle: "[SheetBot] 스마트 간편 견적 및 단가 대장",
      });
      spreadsheetId = resolvedSheet.spreadsheetId || "";
    } catch (resolveErr: any) {
      console.warn(`[EstimateIssue] resolveUserSpreadsheet error:`, resolveErr.message);
    }

    // 5. sheetbot_quotes DB 저장 (캐시 및 열람 제공용)
    const quoteRow = {
      quote_id: estimateId,
      user_email: targetEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      preferred_date: validUntilFormatted, // 견적 유효기간으로 활용
      notes: notes,
      source: source,
      inquiry_text: `[견적서 발행] ${itemsSummary}`,
      items_json: JSON.stringify(validItems),
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: "ISSUED", // 발행완료
      spreadsheet_id: spreadsheetId,
      created_at: todayFormatted,
    };

    await insertRows("sheetbot_quotes", [quoteRow]).catch((err: any) => {
      console.warn("[EstimateIssue] DB insert warning:", err.message);
    });

    // 6. 구글 시트 '견적발행대장'에 실시간 행 추가 (13개 열 표준)
    // [견적번호, 발행일시, 견적유효기간, 고객명, 연락처, 시공/납품주소, 견적내용(품목/수량), 공급가액(원), 부가세(원), 총견적금액(원), 견적상태, 고객열람일시, 승인일시]
    if (spreadsheetId) {
      try {
        const appendRow = [
          estimateId,
          todayFormatted,
          validUntilFormatted,
          customerName,
          customerPhone,
          customerAddress || "",
          itemsSummary,
          supplyAmount,
          vatAmount,
          totalAmount,
          "발행완료",
          "",
          "",
        ];

        await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId,
            range: "견적발행대장!A:M",
            values: [appendRow],
            preferOAuth: true,
          },
          { preferOAuth: true }
        );
      } catch (sheetErr: any) {
        console.warn("[EstimateIssue] Sheet append error:", sheetErr.message);
      }
    }

    // 7. 사업자 정보 조회 (견적서 표출용)
    let businessName = "스마트 간편 견적 센터";
    let merchantPhone = "";
    let sheetBizInfo: Record<string, string> = {};

    try {
      if (spreadsheetId) {
        const infoRes = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId,
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
            if (k.includes("회사명") || k.includes("상호")) sheetBizInfo.companyName = v;
            else if (k.includes("대표자")) sheetBizInfo.ownerName = v;
            else if (k.includes("사업자등록번호") || k.includes("사업자번호")) sheetBizInfo.bizNumber = v;
            else if (k.includes("주소")) sheetBizInfo.address = v;
            else if (k.includes("연락처") || k.includes("전화")) sheetBizInfo.phone = v;
            else if (k.includes("메일")) sheetBizInfo.email = v;
            else if (k.includes("홈페이지") || k.includes("SNS")) sheetBizInfo.website = v;
            else if (k.includes("직인") || k.includes("도장")) sheetBizInfo.sealImageUrl = v;
            else if (k.includes("결제") || k.includes("시공")) sheetBizInfo.paymentNotice = v;
            else if (k.includes("특약") || k.includes("주의사항")) sheetBizInfo.extraNotice = v;
          }
        }
      }
    } catch (_) {}

    if (sheetBizInfo.companyName) businessName = sheetBizInfo.companyName;
    if (sheetBizInfo.phone) merchantPhone = sheetBizInfo.phone;

    const viewUrl = `https://sheetbot.cloud/estimate/view/${estimateId}`;

    return NextResponse.json({
      success: true,
      estimateId,
      customerName,
      customerPhone,
      customerAddress,
      validUntil: validUntilFormatted,
      notes,
      items: validItems,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemsSummary,
      merchant: {
        businessName,
        phone: merchantPhone,
        email: targetEmail,
      },
      businessInfo: sheetBizInfo,
      viewUrl,
      createdAt: todayFormatted,
      message: "전자 견적서가 성공적으로 발행되었습니다.",
    });
  } catch (error: any) {
    console.error("[EstimateIssue] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to issue estimate" },
      { status: 500 }
    );
  }
}
