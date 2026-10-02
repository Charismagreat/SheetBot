export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows, callSheetsTool, queryTable } from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/user/quote/order
 * 모바일 셀프 견적 웹페이지에서 고객이 최종 확정 및 주문/예약 신청 접수
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json();

    const {
      userKey,
      userEmail: directEmail,
      quoteId: existingQuoteId,
      customerName,
      customerPhone,
      customerAddress = "",
      preferredDate = "",
      notes = "",
      items = [],
    } = body;

    if (!customerName || !customerPhone) {
      return NextResponse.json(
        { success: false, error: "고객명과 연락처는 필수 입력 항목입니다." },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "선택된 주문/견적 품목이 없습니다." },
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
    }

    // 2. 금액 및 세액 재계산 (변조 방지)
    const validItems = items.map((item: any, idx: number) => {
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      const price = parseInt(item.discountPrice ?? item.unitPrice ?? 0, 10);
      return {
        code: item.code || `ITEM-${idx + 1}`,
        category: item.category || "일반",
        name: item.name || "품목",
        spec: item.spec || "1개",
        unitPrice: price,
        quantity: qty,
        amount: price * qty,
      };
    });

    const supplyAmount = validItems.reduce((acc: number, cur: any) => acc + cur.amount, 0);
    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalAmount = supplyAmount + vatAmount;
    const totalQuantity = validItems.reduce((acc: number, cur: any) => acc + cur.quantity, 0);

    // 3. 접수 번호 및 일시 생성
    const orderId = existingQuoteId || `ord_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const todayFormatted = now.replace("T", " ").substring(0, 19);

    const itemsSummary = validItems
      .map((item: any) => {
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
        sheetType: "QUOTE",
        defaultTitle: "[SheetBot] 스마트 간편 주문 및 품목 대장",
      });
      spreadsheetId = resolvedSheet.spreadsheetId || "";
      console.log(`[QuoteOrder] Resolved spreadsheetId: "${spreadsheetId}" for user: ${targetEmail}`);
    } catch (resolveErr: any) {
      console.warn(`[QuoteOrder] resolveUserSpreadsheet error:`, resolveErr.message);
    }

    // 5. sheetbot_quotes DB 저장
    const quoteRow = {
      id: orderId,
      user_email: targetEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      preferred_date: preferredDate,
      notes: notes,
      source: "SELF_ORDER",
      inquiry_text: `[간편 주문] ${itemsSummary}`,
      items_json: JSON.stringify(validItems),
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: "ORDERED",
      spreadsheet_id: spreadsheetId,
      viewed_at: now,
      created_at: now,
    };

    await insertRows("sheetbot_quotes", [quoteRow]).catch((err: any) => {
      console.warn("[QuoteOrder] DB insert warning:", err.message);
    });

    // 6. 구글 시트 '주문접수대장'에 실시간 행 추가 (11개 열 표준)
    // [주문번호, 주문일시, 고객명, 연락처, 배송/방문주소, 요청사항, 주문내역(품목/수량), 총수량, 총결제금액(원), 주문상태, 처리일시]
    if (spreadsheetId) {
      try {
        const fullNotes = [
          notes ? `요청: ${notes}` : "",
          preferredDate ? `희망일시: ${preferredDate}` : "",
        ].filter(Boolean).join(" | ");

        const appendRow = [
          orderId,
          todayFormatted,
          customerName,
          customerPhone,
          customerAddress || "",
          fullNotes,
          itemsSummary,
          totalQuantity,
          totalAmount,
          "접수",
          "",
        ];

        console.log(`[QuoteOrder] Attempting sheets_append_values to spreadsheetId: ${spreadsheetId}...`);
        const appendRes = await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId,
            range: "주문접수대장!A:K",
            values: [appendRow],
            preferOAuth: true,
          },
          { preferOAuth: true }
        );
        console.log(`[QuoteOrder] sheets_append_values success:`, JSON.stringify(appendRes));
      } catch (sheetErr: any) {
        console.warn("[QuoteOrder] Sheet append error:", sheetErr.message);
      }
    } else {
      console.warn("[QuoteOrder] No spreadsheetId resolved, skipping sheet append.");
    }

    // 7. 사장님 프로필/상호 및 시트 사업자정보 조회 (전자 주문확인서에 표출)
    let businessName = "스마트 간편 주문 센터";
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
            if (row && row[0]) {
              const k = String(row[0]).trim();
              const v = String(row[1] || "").trim();
              if (k.includes("회사명") || k.includes("상호")) sheetBizInfo.companyName = v;
              else if (k.includes("대표자")) sheetBizInfo.ownerName = v;
              else if (k.includes("사업자등록번호") || k.includes("사업자번호")) sheetBizInfo.bizNumber = v;
              else if (k.includes("주소")) sheetBizInfo.address = v;
              else if (k.includes("연락처") || k.includes("전화")) sheetBizInfo.phone = v;
              else if (k.includes("메일")) sheetBizInfo.email = v;
              else if (k.includes("홈페이지") || k.includes("SNS")) sheetBizInfo.website = v;
              else if (k.includes("결제")) sheetBizInfo.paymentNotice = v;
              else if (k.includes("배송")) sheetBizInfo.shippingNotice = v;
              else if (k.includes("환불") || k.includes("취소")) sheetBizInfo.refundNotice = v;
              else if (k.includes("기타")) sheetBizInfo.extraNotice = v;
            }
          }
        }
      }
    } catch (_) {}

    // 시트 사업자정보 1순위 반영
    if (sheetBizInfo.companyName) {
      businessName = sheetBizInfo.companyName;
    }
    if (sheetBizInfo.phone) {
      merchantPhone = sheetBizInfo.phone;
    }

    if (!sheetBizInfo.companyName || !sheetBizInfo.phone) {
      try {
        const settingRes = await queryTable("sheetbot_settings", {
          filters: { key: `quote_profile_${targetEmail}` },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        if (settingRes.rows && settingRes.rows.length > 0) {
          const val = JSON.parse(settingRes.rows[0].value || "{}");
          if (!businessName || businessName === "스마트 간편 주문 센터") {
            if (val.businessName && val.businessName.trim()) businessName = val.businessName.trim();
          }
          if (!merchantPhone && val.phone) merchantPhone = val.phone;
        }
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      orderId,
      customerName,
      customerPhone,
      customerAddress,
      preferredDate,
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
      viewUrl: `https://sheetbot.cloud/q/${orderId}`,
      createdAt: todayFormatted,
      message: "주문이 성공적으로 접수되었습니다.",
    });
  } catch (error: any) {
    console.error("[QuoteOrder] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process order" },
      { status: 500 }
    );
  }
}
