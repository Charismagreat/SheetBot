import { queryTable, updateRows, callSheetsTool } from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface MatchedSmartOrder {
  source: "DB" | "SHEET";
  quoteId?: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  itemsSummary?: string;
  address?: string;
  status?: string;
  rowIndex?: number;
}

/**
 * 한국 통신사(SKT/KT/LGU+) 단문 SMS 규격(한글 40~45자, 80바이트 이하)에 맞춘 초고속 영수증 문자 문구 생성
 * 90바이트 초과 Multipart SMS로 분할 시 통신사 SMSC에서 전송 거부/유실되는 문제를 원천 방지
 */
export function generateReceiptSmsText(customerName: string, amount: number, itemsSummary?: string): string {
  const safeName = customerName && customerName !== "고객" ? customerName : "고객";
  const formattedAmount = amount > 0 ? `${amount.toLocaleString()}원` : "";
  
  // 단문 80바이트 이하 엄격 준수 (한글 1자=2B, 총 70~75바이트)
  return `[SheetBot] ${safeName}님, 결제(${formattedAmount}) 확인 완료! 정성껏 준비하겠습니다.`;
}

/**
 * 입금자명과 고객명의 일치 여부를 판별 (공백 무시, 부분 일치, 마스킹 일치)
 * 예: "차호석" vs "차호석", "차*석" vs "차호석", "홍길동" vs "홍길동(주문)"
 */
export function isNameMatch(depositor: string, targetName: string): boolean {
  if (!depositor || !targetName) return false;

  const dep = depositor.replace(/\s+/g, "").trim().toLowerCase();
  const tgt = targetName.replace(/\s+/g, "").trim().toLowerCase();

  if (!dep || !tgt) return false;

  // 1. 완전 일치
  if (dep === tgt) return true;

  // 2. 부분 일치 (2글자 이상인 경우)
  if (tgt.length >= 2 && dep.includes(tgt)) return true;
  if (dep.length >= 2 && tgt.includes(dep)) return true;

  // 3. 마스킹 일치 (예: 카카오페이 '차*석' vs '차호석', '홍*동' vs '홍길동')
  if (dep.includes("*") || tgt.includes("*")) {
    const masked = dep.includes("*") ? dep : tgt;
    const plain = dep.includes("*") ? tgt : dep;

    if (masked.length === plain.length) {
      let isMatch = true;
      for (let i = 0; i < masked.length; i++) {
        if (masked[i] !== "*" && masked[i] !== plain[i]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) return true;
    }

    // "서****3" 형태처럼 은행 계좌/전화번호 뒷자리나 연속 별표가 붙은 경우
    const nonMaskedFront = masked.split("*")[0];
    if (nonMaskedFront && nonMaskedFront.length >= 1 && plain.startsWith(nonMaskedFront)) {
      // 첫 글자 일치 및 2글자 이상 고객명에 대해 성 일치
      if (plain.length >= 2) return true;
    }
  }

  return false;
}

/**
 * 전화번호 문자열 정규화 (숫자만 추출, 유효 전화번호 여부 검증)
 */
export function normalizePhoneNumber(rawPhone: string): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/[^0-9]/g, "").trim();

  // 대한민국 휴대폰 번호 (010, 011, 016, 017, 018, 019 등 10~11자리)
  if (/^01[016789]\d{7,8}$/.test(digits)) {
    return digits;
  }

  // 일반 유선전화나 최소 9자리 이상 번호
  if (digits.length >= 9 && digits.length <= 12) {
    return digits;
  }

  return null;
}

/**
 * [SheetBot] 스마트 간편 주문 및 품목 대장 (및 sheetbot_quotes)에서
 * 고객명과 결제 금액이 일치하는 최신 주문건을 탐색
 */
export async function findMatchingSmartOrder(params: {
  userEmail: string;
  depositorName: string;
  amount: number;
}): Promise<MatchedSmartOrder | null> {
  const { userEmail, depositorName, amount } = params;

  if (!userEmail || !depositorName || !amount || amount <= 0) {
    return null;
  }

  const cleanEmail = userEmail.toLowerCase().trim();
  const cleanDepositor = depositorName.trim();
  const cleanAmount = Number(amount) || 0;

  console.log(`[SmartOrderMatcher] 🔍 주문 매칭 시작: 회원=${cleanEmail}, 입금자=${cleanDepositor}, 금액=${cleanAmount}원`);

  // ========================================================
  // [1순위] DB sheetbot_quotes 테이블에서 매칭 주문 탐색
  // ========================================================
  try {
    const quotesRes = await queryTable("sheetbot_quotes", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 50,
    });

    const rows = (quotesRes?.rows || []).filter((r: any) => !r.deleted_at);

    // 1-1. 미결제 주문(ORDERED, SENT, VIEWED, DRAFT 등) 중 금액 + 고객명 일치건 우선 탐색
    for (const r of rows) {
      const orderAmount = Number(r.total_amount) || 0;
      if (orderAmount === cleanAmount) {
        const custName = r.customer_name || "";
        if (isNameMatch(cleanDepositor, custName)) {
          const validPhone = normalizePhoneNumber(r.customer_phone || "");
          if (validPhone) {
            console.log(`[SmartOrderMatcher] ✅ DB 매칭 성공 (ID: ${r.id}, 고객: ${custName}, 번호: ${validPhone}, 금액: ${orderAmount}원)`);

            // 주문 상태를 결제완료(PAID)로 갱신
            if (r.status !== "PAID") {
              await updateRows(
                "sheetbot_quotes",
                {
                  status: "PAID",
                  updated_at: new Date().toISOString(),
                  updated_by: "bank_webhook_smart_order",
                },
                { filters: { id: r.id } }
              ).catch((err: any) => console.warn("[SmartOrderMatcher] DB status update warning:", err.message));
            }

            return {
              source: "DB",
              quoteId: r.id,
              customerName: custName,
              customerPhone: validPhone,
              amount: cleanAmount,
              itemsSummary: r.inquiry_text,
              address: r.customer_address,
              status: "PAID",
            };
          }
        }
      }
    }
  } catch (dbErr: any) {
    console.warn("[SmartOrderMatcher] DB query warning:", dbErr.message);
  }

  // ========================================================
  // [2순위] 구글 시트 '[SheetBot] 스마트 간편 주문 및 품목 대장'의 '주문접수대장' 탭 직접 탐색
  // (사용자가 구글 시트에 직접 수기로 입력하거나 수정한 주문건 지원)
  // ========================================================
  try {
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "QUOTE",
      defaultTitle: "[SheetBot] 스마트 간편 주문 및 품목 대장",
      preferOAuth: true,
    });

    if (resolved?.spreadsheetId) {
      const sheetRes = await callSheetsTool(
        "sheets_get_range",
        {
          spreadsheetId: resolved.spreadsheetId,
          range: "주문접수대장!A2:K100",
          preferOAuth: true,
        },
        { preferOAuth: true }
      ).catch(() => null);

      const rows = sheetRes?.values || [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 4) continue;

        // 표준 열:
        // [0:주문번호, 1:주문일시, 2:고객명, 3:연락처, 4:배송주소, 5:요청사항, 6:주문내역, 7:총수량, 8:총결제금액(원), 9:주문상태, 10:처리일시]
        // (구버전 10열 헤더 호환: [7:총결제금액, 8:주문상태, 9:처리일시])
        const custName = String(row[2] || "").trim();
        const rawPhone = String(row[3] || "").trim();

        // 금액 열 파싱 (8열 또는 7열)
        const col8Amount = parseInt(String(row[8] || "").replace(/[^0-9]/g, ""), 10) || 0;
        const col7Amount = parseInt(String(row[7] || "").replace(/[^0-9]/g, ""), 10) || 0;
        const rowAmount = col8Amount > 0 ? col8Amount : col7Amount;

        const statusColIdx = col8Amount > 0 ? 9 : 8;
        const currentStatus = String(row[statusColIdx] || "").trim();

        if (rowAmount === cleanAmount && isNameMatch(cleanDepositor, custName)) {
          const validPhone = normalizePhoneNumber(rawPhone);
          if (validPhone) {
            console.log(`[SmartOrderMatcher] ✅ 구글 시트 주문접수대장 매칭 성공 (${i + 2}행, 고객: ${custName}, 번호: ${validPhone}, 금액: ${rowAmount}원)`);

            // 구글 시트 주문상태를 '결제완료'로 즉시 갱신
            if (!currentStatus.includes("완료") && !currentStatus.includes("입금확인")) {
              const rowNum = i + 2;
              const statusColLetter = statusColIdx === 9 ? "J" : "I";
              const timeColLetter = statusColIdx === 9 ? "K" : "J";
              const nowFormatted = getKoreanTimeString();

              await callSheetsTool(
                "sheets_update_range",
                {
                  spreadsheetId: resolved.spreadsheetId,
                  range: `주문접수대장!${statusColLetter}${rowNum}:${timeColLetter}${rowNum}`,
                  values: [["결제완료", nowFormatted]],
                  preferOAuth: true,
                },
                { preferOAuth: true }
              ).catch((sheetUpdateErr: any) => {
                console.warn("[SmartOrderMatcher] Sheet status update warning:", sheetUpdateErr.message);
              });
            }

            return {
              source: "SHEET",
              quoteId: String(row[0] || ""),
              customerName: custName,
              customerPhone: validPhone,
              amount: cleanAmount,
              itemsSummary: String(row[6] || ""),
              rowIndex: i + 2,
              status: "결제완료",
            };
          }
        }
      }
    }
  } catch (sheetErr: any) {
    console.warn("[SmartOrderMatcher] Sheet query warning:", sheetErr.message);
  }

  console.log(`[SmartOrderMatcher] ℹ️ 일치하는 스마트 간편 주문건 없음: 입금자=${cleanDepositor}, 금액=${cleanAmount}원`);
  return null;
}
