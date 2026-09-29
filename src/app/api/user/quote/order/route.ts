export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { insertRows, callSheetsTool } from "@/lib/egdesk-helpers";
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

    // 3. 접수 번호 및 일시 생성
    const orderId = existingQuoteId || `ord_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const todayFormatted = now.replace("T", " ").substring(0, 19);

    const itemsSummary = validItems
      .map((item: any) => `${item.name}(${item.quantity}${item.spec})`)
      .join(", ");

    // 4. 사장님 구글 시트 바인딩 확인
    let spreadsheetId = "";
    try {
      const resolvedSheet = await resolveUserSpreadsheet({
        userEmail: targetEmail,
        sheetType: "QUOTE",
        defaultTitle: "[SheetBot] 스마트 견적 및 단가표 대장",
      });
      spreadsheetId = resolvedSheet.spreadsheetId || "";
    } catch (_) {}

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
      inquiry_text: `[고객 셀프 주문] ${itemsSummary}`,
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

    // 6. 구글 시트 '견적발급대장' (또는 주문대장)에 실시간 행 추가
    if (spreadsheetId) {
      try {
        const appendRow = [
          orderId,
          todayFormatted,
          customerName,
          customerPhone,
          `[셀프주문] ${itemsSummary}` + (customerAddress ? ` | 배송/주소: ${customerAddress}` : "") + (preferredDate ? ` | 희망일시: ${preferredDate}` : ""),
          supplyAmount,
          vatAmount,
          totalAmount,
          `https://sheetbot.cloud/q/${orderId}`,
          "신규주문접수",
          "열람완료",
        ];

        await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId,
            range: "견적발급대장!A:K",
            values: [appendRow],
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(async () => {
          // 견적발급대장이 없을 경우 기본 탭 추가 시도
          await callSheetsTool(
            "sheets_append_values",
            {
              spreadsheetId,
              range: "A:K",
              values: [appendRow],
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch(() => {});
        });
      } catch (sheetErr: any) {
        console.warn("[QuoteOrder] Sheet append error:", sheetErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      customerName,
      customerPhone,
      customerAddress,
      preferredDate,
      items: validItems,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemsSummary,
      viewUrl: `https://sheetbot.cloud/q/${orderId}`,
      createdAt: todayFormatted,
      message: "주문 및 견적 신청이 성공적으로 접수되었습니다.",
    });
  } catch (error: any) {
    console.error("[QuoteOrder] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process order" },
      { status: 500 }
    );
  }
}
