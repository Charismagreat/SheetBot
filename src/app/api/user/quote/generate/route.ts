export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { callSheetsTool, callAiCaller, insertRows, queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export interface QuoteItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

/**
 * 기본 표준 단가표 폴백 (시트 조회가 실패하거나 비어있을 때 사용)
 */
const DEFAULT_CATALOG: QuoteItem[] = [
  { code: "AC-001", category: "에어컨 세척", name: "스탠드 에어컨 분해세척", spec: "1대", unitPrice: 150000, quantity: 1, amount: 150000 },
  { code: "AC-002", category: "에어컨 세척", name: "벽걸이 에어컨 분해세척", spec: "1대", unitPrice: 80000, quantity: 1, amount: 80000 },
  { code: "AC-003", category: "에어컨 세척", name: "천장형 시스템 에어컨 (4WAY)", spec: "1대", unitPrice: 130000, quantity: 1, amount: 130000 },
  { code: "OPT-001", category: "추가 옵션", name: "실외기 고압 세척", spec: "1대", unitPrice: 30000, quantity: 1, amount: 30000 },
  { code: "OPT-002", category: "추가 옵션", name: "피톤치드 연무 살균 소독", spec: "1식", unitPrice: 0, quantity: 1, amount: 0 },
];

/**
 * POST /api/user/quote/generate
 * 고객의 문자/카톡 문의를 분석하여 구글 시트 단가표 매칭 & 견적서 생성 & 시트 대장 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const {
      userEmail: rawEmail,
      customerName = "고객님",
      customerPhone = "",
      inquiryText = "",
      items: manualItems,
      autoAppendSheet = true,
    } = body;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const targetEmail = (rawEmail && rawEmail.includes("@"))
      ? rawEmail.toLowerCase().trim()
      : (sessionEmail || "chachogreat@gmail.com");

    if (!inquiryText && (!manualItems || manualItems.length === 0)) {
      return NextResponse.json(
        { success: false, error: "고객 문의 내용(inquiryText) 또는 품목 목록(items)이 필요합니다." },
        { status: 400 }
      );
    }

    // 1. 회원의 QUOTE 스프레드시트 탐색
    let spreadsheetId = "";
    let catalogItems: any[] = [];

    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail: targetEmail,
        sheetType: "QUOTE",
        defaultTitle: "[SheetBot] 스마트 견적 및 단가표 대장",
      });
      spreadsheetId = resolved.spreadsheetId;

      // 2. 단가표 탭에서 실시간 상품 목록 조회
      if (spreadsheetId) {
        const rangeRes = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId,
            range: "단가표!A2:H100",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);

        if (rangeRes?.values && rangeRes.values.length > 0) {
          catalogItems = rangeRes.values
            .filter((row: any[]) => row && row[2]) // 품목명이 있는 행만
            .map((row: any[], idx: number) => ({
              category: String(row[0] || "기본"),
              code: String(row[1] || `ITEM-${idx + 1}`),
              name: String(row[2] || "").trim(),
              spec: String(row[3] || "1개").trim(),
              unitPrice: parseInt(String(row[4] || "0").replace(/[^0-9]/g, ""), 10) || 0,
              discountPrice: parseInt(String(row[5] || "0").replace(/[^0-9]/g, ""), 10) || 0,
              optionType: String(row[6] || "메인"),
              note: String(row[7] || ""),
            }));
        }
      }
    } catch (sheetErr: any) {
      console.warn("[QuoteGenerate] Failed to fetch sheet catalog, using default:", sheetErr.message);
    }

    if (catalogItems.length === 0) {
      catalogItems = DEFAULT_CATALOG;
    }

    // 3. AI 파싱 또는 수동 전달된 품목 계산
    let finalItems: QuoteItem[] = [];
    let isClear = true;
    let missingReason = "";
    let suggestedOptions: any[] = [];

    if (Array.isArray(manualItems) && manualItems.length > 0) {
      // 수동 선택(셀프 견적 폼 등)인 경우
      finalItems = manualItems.map((m: any) => ({
        code: m.code || "ITEM",
        category: m.category || "일반",
        name: m.name,
        spec: m.spec || "1개",
        unitPrice: Number(m.unitPrice || 0),
        quantity: Math.max(1, Number(m.quantity || 1)),
        amount: Number(m.unitPrice || 0) * Math.max(1, Number(m.quantity || 1)),
      }));
    } else {
      // 고객의 자연어 문의 텍스트를 AI로 분석
      const catalogSummary = catalogItems
        .map((c) => `- [${c.category}] 코드:${c.code} | 품목명:${c.name} | 규격:${c.spec} | 단가:${c.unitPrice.toLocaleString()}원`)
        .join("\n");

      const systemPrompt = `너는 회사의 표준 단가표를 기반으로 고객의 문자/카톡 문의를 분석하여 견적서 항목을 추출하는 AI 견적 엔진이다.

[사내 등록 단가표]:
${catalogSummary}

[분석 지침]:
1. 고객의 문의에서 언급된 상품/서비스와 수량을 파악하여 가장 일치하는 사내 단가표의 정식 품목을 매칭하라.
2. 오타나 줄임말(예: "스텐드" ➔ "스탠드 에어컨 분해세척", "벽걸이 하나" ➔ "벽걸이 에어컨 분해세척 1대")을 지능적으로 교정하여 매칭하라.
3. 고객의 문의가 너무 막연하여 품목을 특정할 수 없거나(예: "청소 견적 얼마예요?"), 수량이 전혀 언급되지 않은 경우:
   - is_clear: false 로 설정하고
   - missing_reason: "규격 및 모델명 누락" 등 사유 기재
   - suggested_codes: 관련된 추천 단가표 코드 배열 반환
4. 결과는 오직 JSON 하나만 반환하라. 마크다운 따옴표(\`\`\`json) 없이 순수 JSON만 반환하라.

[JSON 반환 스키마]:
{
  "is_clear": true | false,
  "missing_reason": "누락 사유 또는 ''",
  "matched_items": [
    {
      "code": "단가표 코드",
      "quantity": 수량(숫자)
    }
  ],
  "suggested_codes": ["AC-001", "AC-002"]
}`;

      try {
        const aiPrompt = `${systemPrompt}\n\n[고객의 문의 내용]: "${inquiryText}"`;
        const aiRes = await callAiCaller(aiPrompt, { temperature: 0.1 });
        const text = typeof aiRes === "string" ? aiRes : aiRes?.text || aiRes?.content || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          isClear = parsed.is_clear !== false;
          missingReason = parsed.missing_reason || "";

          if (Array.isArray(parsed.matched_items) && parsed.matched_items.length > 0) {
            for (const m of parsed.matched_items) {
              const matchedCatalog = catalogItems.find(
                (c) => c.code.toLowerCase() === String(m.code).toLowerCase()
              );
              if (matchedCatalog) {
                const qty = Math.max(1, Number(m.quantity || 1));
                finalItems.push({
                  code: matchedCatalog.code,
                  category: matchedCatalog.category,
                  name: matchedCatalog.name,
                  spec: matchedCatalog.spec,
                  unitPrice: matchedCatalog.unitPrice,
                  quantity: qty,
                  amount: matchedCatalog.unitPrice * qty,
                });
              }
            }
          }

          if (Array.isArray(parsed.suggested_codes)) {
            suggestedOptions = catalogItems.filter((c) =>
              parsed.suggested_codes.includes(c.code)
            );
          }
        }
      } catch (aiErr: any) {
        console.warn("[QuoteGenerate] AI parsing warning:", aiErr.message);
      }

      // AI 매칭이 실패했거나 항목이 없으면 기본 첫 번째 품목으로 폴백 매칭
      if (finalItems.length === 0 && catalogItems.length > 0) {
        const defaultItem = catalogItems[0];
        finalItems.push({
          code: defaultItem.code,
          category: defaultItem.category,
          name: defaultItem.name,
          spec: defaultItem.spec,
          unitPrice: defaultItem.unitPrice,
          quantity: 1,
          amount: defaultItem.unitPrice,
        });
      }
    }

    // 4. 합계 및 세액 계산
    const supplyAmount = finalItems.reduce((acc, cur) => acc + cur.amount, 0);
    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalAmount = supplyAmount + vatAmount;

    // 5. 견적 ID 및 링크 생성
    const quoteId = `q_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const baseUrl = process.env.NEXTAUTH_URL || "https://sheetbot.cloud";
    const quoteUrl = `${baseUrl}/q/${quoteId}`;
    const selectUrl = `${baseUrl}/q/select/${quoteId}`;

    const itemsSummary = finalItems
      .map((item) => `${item.name}(${item.quantity}${item.spec})`)
      .join(", ");

    const now = new Date().toISOString();
    const todayFormatted = now.replace("T", " ").substring(0, 19);

    const initialStatus = isClear ? "ISSUED" : "NEEDS_SELECTION";

    // 6. sheetbot_quotes DB 저장
    const quoteRow = {
      id: quoteId,
      user_email: targetEmail,
      customer_name: customerName,
      customer_phone: customerPhone,
      inquiry_text: inquiryText,
      items_json: JSON.stringify(finalItems),
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      status: initialStatus,
      spreadsheet_id: spreadsheetId,
      viewed_at: null,
      created_at: now,
    };

    await insertRows("sheetbot_quotes", [quoteRow]).catch((err: any) => {
      console.warn("[QuoteGenerate] DB insert warning:", err.message);
    });

    // 7. 구글 시트 '견적발급대장'에 행 추가
    if (spreadsheetId && autoAppendSheet) {
      try {
        const appendRow = [
          quoteId,
          todayFormatted,
          customerName,
          customerPhone,
          isClear ? itemsSummary : `[옵션선택대기] ${itemsSummary}`,
          supplyAmount,
          vatAmount,
          totalAmount,
          isClear ? quoteUrl : selectUrl,
          isClear ? "발급완료" : "선택대기",
          "미열람",
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
        ).catch((appErr: any) => {
          console.warn("[QuoteGenerate] Sheet append warning:", appErr.message);
        });
      } catch (err: any) {
        console.warn("[QuoteGenerate] Sheet record warning:", err.message);
      }
    }

    // 8. 고객 회신용 표준 메시지 템플릿 생성 (명확한 견적 vs 셀프 선택기 분기)
    let defaultSmsMessage = "";
    if (isClear) {
      defaultSmsMessage = `[SheetBot 견적] ${customerName}님, 요청하신 견적서가 발급되었습니다.
• 총 예상 견적: ${totalAmount.toLocaleString()}원 (VAT 포함)
• 견적 품목: ${itemsSummary}

아래 링크를 터치하시면 고화질 견적서 확인 및 이미지 저장이 가능합니다.
▶ 견적서 바로보기: ${quoteUrl}`;
    } else {
      defaultSmsMessage = `[SheetBot 견적] ${customerName}님, 문의 감사드립니다!
문의하신 내용은 모델 및 규격에 따라 비용이 달라집니다.
아래 10초 셀프 견적 링크에서 모델과 수량을 선택하시면 정식 맞춤 견적서가 즉시 발급됩니다.
▶ 10초 맞춤 견적 선택하기: ${selectUrl}`;
    }

    return NextResponse.json({
      success: true,
      quoteId,
      quoteUrl,
      selectUrl,
      isClear,
      missingReason,
      customerName,
      customerPhone,
      items: finalItems,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemsSummary,
      smsMessage: defaultSmsMessage,
      suggestedOptions,
      spreadsheetId,
      createdAt: todayFormatted,
    });
  } catch (error: any) {
    console.error("[QuoteGenerate] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate quote" },
      { status: 500 }
    );
  }
}
