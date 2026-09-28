import {
  callSheetsTool,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";

export interface RecordPaymentParams {
  userEmail: string;
  paymentTime?: string;
  channelOrBank: string;
  customerName?: string;
  amount: number;
  memoOrRawText: string;
  deviceId?: string;
  sheetTitle?: string;
}

// 90초 이내 푸시/SMS 중복 수신 방지를 위한 인메모리 디바운싱 맵
const recentPaymentDedupeMap = new Map<string, number>();

function cleanOldDedupeEntries() {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5분 지난 키 메모리 정리
  for (const [key, timestamp] of recentPaymentDedupeMap.entries()) {
    if (timestamp < cutoff) {
      recentPaymentDedupeMap.delete(key);
    }
  }
}

export interface RecordPaymentResult {
  success: boolean;
  spreadsheetUrl?: string;
  duplicated?: boolean;
  message?: string;
  error?: string;
}

/**
 * 매장 결제 및 은행 입금 내역을 구글 드라이브 [SheetBot] 매장 결제 및 매출 대장 시트에 실시간 자동 기록
 * - 시트가 없으면 1순위로 자동 생성
 * - Self-Healing 헤더 보장 (1행 헤더 누락 시 자동 주입 및 에메랄드 테마 서식)
 * - 금액 열(D열)은 순수 숫자(Number)로 저장하여 =SUM() 등 엑셀/Apps Script 수식 연산 100% 보장
 * - 90초 스마트 디바운싱: 앱 푸시와 SMS 동시 수신 시 2중 중복 기록 원천 차단
 */
export async function recordPaymentToGoogleSheet(
  params: RecordPaymentParams
): Promise<RecordPaymentResult> {
  try {
    const {
      userEmail,
      paymentTime,
      channelOrBank,
      customerName = "미확인",
      amount,
      memoOrRawText,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 매장 결제 및 매출 대장",
    } = params;

    if (!userEmail) {
      return { success: false, error: "userEmail이 누락되었습니다." };
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanAmount = Number(amount) || 0;
    const cleanBank = (channelOrBank || "").replace(/PUSH:/i, "").trim();
    const cleanName = (customerName || "").replace(/미확인|고객/g, "").trim();

    // 🛡️ [90초 스마트 중복 방지 필터]: 앱 푸시와 SMS가 연속으로 도달할 때 1건만 안전하게 기록
    const dedupeKey = `${cleanEmail}_${cleanBank}_${cleanAmount}${cleanName ? `_${cleanName}` : ""}`;
    const nowMs = Date.now();
    const lastRecordedAt = recentPaymentDedupeMap.get(dedupeKey);

    if (lastRecordedAt && (nowMs - lastRecordedAt) < 90 * 1000) {
      const elapsedSec = Math.round((nowMs - lastRecordedAt) / 1000);
      console.log(`🛡️ [PaymentSheetSync] 90초 이내 중복 결제 감지(푸시/SMS 동시 수신) - 시트 중복 삽입 방어 완료: ${dedupeKey} (${elapsedSec}초 전 최초 기록됨)`);
      return {
        success: true,
        duplicated: true,
        message: "동일 결제 건이 이미 대장에 기록되어 중복 처리가 방지되었습니다.",
      };
    }

    recentPaymentDedupeMap.set(dedupeKey, nowMs);
    cleanOldDedupeEntries();

    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    const nowStr =
      paymentTime ||
      new Date().toISOString().replace("T", " ").slice(0, 19);

    let targetSpreadsheetId: string | null = null;
    let spreadsheetUrl = "";

    // 1. 회원별 대장 고유 ID 영구 바인딩 및 0초 즉각 조회
    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "PAYMENT_PUSH",
        defaultTitle: "[SheetBot] 매장 결제 및 매출 대장",
        requestedTitle: sheetTitle,
        preferOAuth: true,
      });
      if (resolved?.spreadsheetId) {
        targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;
      }
    } catch (resolveErr: any) {
      console.warn("[PaymentSheetSync] resolveUserSpreadsheet fallback:", resolveErr?.message);
    }

    // 2. 바인딩 조회가 없을 경우 드라이브 검색 폴백
    if (!targetSpreadsheetId) {
      const queryStr = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`;
      const sheetSearch = await (listDriveFiles as any)({
        query: queryStr,
        preferOAuth: true,
      }).catch(() => ({ files: [] }));

      const foundSheets = sheetSearch?.files || [];
      if (foundSheets.length > 0) {
        targetSpreadsheetId = foundSheets[0].id;
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
      } else {
        // 대장 시트 신규 생성
        const createRes = await callSheetsTool("sheets_create_spreadsheet", {
          title: sheetTitle,
          preferOAuth: true,
        }).catch((err: any) => {
          console.warn("[PaymentSheetSync] sheets_create_spreadsheet warning:", err.message);
          return null;
        });

        targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
        if (targetSpreadsheetId) {
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
        }
      }
    }

    if (!targetSpreadsheetId) {
      return { success: false, error: "스프레드시트를 생성하거나 찾을 수 없습니다." };
    }

    // 3. 자가 치유(Self-Healing) 헤더 검사 및 보장
    const headerValues = [
      ["결제 일시", "결제 채널/금융사", "입금/고객명", "결제 금액(원)", "주문/결제 내용", "수신 기기"],
    ];

    const firstRowCheck = await callSheetsTool("sheets_get_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "A1:A1",
      preferOAuth: true,
    }).catch(() => null);

    const hasHeaderOrData =
      firstRowCheck?.values &&
      firstRowCheck.values.length > 0 &&
      firstRowCheck.values[0]?.[0];

    if (!hasHeaderOrData) {
      await callSheetsTool("sheets_update_range", {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:F1",
        values: headerValues,
        preferOAuth: true,
      }).catch(() => {});

      // 에메랄드 그린 비즈니스 테마 헤더 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: targetSpreadsheetId,
        tabName: "시트1",
        headerBgColor: "#065f46", // Dark Emerald
        headerTextColor: "#ecfdf5", // Light Mint
        preferOAuth: true,
      }).catch(() => {});
    }

    // 4. 새 결제/매출 내역 행 추가 (D열 금액은 숫자 타입으로 유지)
    const newRowValues = [
      [nowStr, channelOrBank, customerName, Number(amount) || 0, memoOrRawText, deviceId],
    ];

    await callSheetsTool("sheets_append_values", {
      spreadsheetId: targetSpreadsheetId,
      range: "A:F",
      values: newRowValues,
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[PaymentSheetSync] append_values warning:", err.message);
    });

    return {
      success: true,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error("[PaymentSheetSync] Error:", err);
    return { success: false, error: err.message };
  }
}
