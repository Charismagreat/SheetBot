import {
  callSheetsTool,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface RecordReceiptSmsParams {
  userEmail: string;
  sentTime?: string;
  recipientPhone: string;
  customerName?: string;
  amount?: number;
  receiptContent: string;
  status?: "발송 성공" | "발송 실패" | "전송 완료";
  deviceId?: string;
  sheetTitle?: string;
}

// 30초 이내 동일 영수증 발송 내역 중복 기록 방어 캐시 (1차/2차 호스트 재시도 및 중복 콜백 방어)
const recentReceiptSmsDedupeMap = new Map<string, number>();

function cleanOldReceiptDedupeEntries() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, timestamp] of recentReceiptSmsDedupeMap.entries()) {
    if (timestamp < cutoff) {
      recentReceiptSmsDedupeMap.delete(key);
    }
  }
}

export interface RecordReceiptSmsResult {
  success: boolean;
  spreadsheetUrl?: string;
  duplicated?: boolean;
  error?: string;
}

/**
 * 고객 영수증 문자 발송 내역을 구글 드라이브 [SheetBot] 고객 영수증 문자 발송 대장 시트에 실시간 자동 기록
 * - 7대 표준 열: ["발송 일시", "수신 번호", "고객/입금자명", "결제 금액(원)", "발송 영수증 내용", "발송 상태", "기기명"]
 * - Self-Healing 헤더 보장 (시트 신규 생성 시 헤더 및 틸 블루 테마 서식 자동 주입)
 * - 금액 열(D열)은 순수 숫자(Number)로 저장하여 집계 수식 보장
 * - KST 한국 표준시 적용
 */
export async function recordReceiptSmsToGoogleSheet(
  params: RecordReceiptSmsParams
): Promise<RecordReceiptSmsResult> {
  try {
    const {
      userEmail,
      sentTime,
      recipientPhone,
      customerName = "고객",
      amount = 0,
      receiptContent,
      status = "전송 완료",
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 고객 영수증 문자 발송 대장",
    } = params;

    if (!userEmail) {
      return { success: false, error: "userEmail이 누락되었습니다." };
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanPhone = (recipientPhone || "").replace(/[^0-9]/g, "");
    const numAmount = Number(amount) || 0;

    // 🛡️ [30초 중복 방어 필터]: 1차 서버 타임아웃으로 인한 2차 폴백 중복 적재 원천 차단
    const dedupeKey = `${cleanEmail}_${cleanPhone}_${numAmount}`;
    const nowMs = Date.now();
    const lastRecordedAt = recentReceiptSmsDedupeMap.get(dedupeKey);

    if (lastRecordedAt && (nowMs - lastRecordedAt) < 30 * 1000) {
      console.log(`🛡️ [ReceiptSmsSync] 30초 이내 중복 영수증 기록 감지 - 시트 기록 방어: ${dedupeKey}`);
      return {
        success: true,
        duplicated: true,
      };
    }

    recentReceiptSmsDedupeMap.set(dedupeKey, nowMs);
    cleanOldReceiptDedupeEntries();

    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    const nowStr = sentTime || getKoreanTimeString();

    // 1. 회원별 대장 고유 ID 영구 바인딩 및 0초 즉각 조회
    const resolved = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "RECEIPT_SMS",
      defaultTitle: "[SheetBot] 고객 영수증 문자 발송 대장",
      requestedTitle: sheetTitle,
      preferOAuth: true,
    });

    const targetSpreadsheetId = resolved.spreadsheetId;
    const spreadsheetUrl = resolved.spreadsheetUrl;

    if (!targetSpreadsheetId) {
      return { success: false, error: "스프레드시트를 생성하거나 찾을 수 없습니다." };
    }

    // 2. 자가 치유(Self-Healing) 헤더 검사 및 보장 (7열 표준 헤더)
    const headerValues = [
      ["발송 일시", "수신 번호", "고객/입금자명", "결제 금액(원)", "발송 영수증 내용", "발송 상태", "기기명"]
    ];

    const firstRowCheck = await callSheetsTool("sheets_get_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "A1:G1",
      preferOAuth: true,
    }).catch(() => null);

    const firstRowValues = firstRowCheck?.values?.[0] || [];
    const hasHeaderOrData = firstRowValues.length > 0 && Boolean(firstRowValues[0]);

    if (!hasHeaderOrData) {
      await callSheetsTool("sheets_update_range", {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:G1",
        values: headerValues,
        preferOAuth: true,
      }).catch(() => {});

      // 틸/블루 비즈니스 테마 헤더 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: targetSpreadsheetId,
        tabName: "시트1",
        headerBgColor: "#0f766e", // Dark Teal
        headerTextColor: "#f0fdfa", // Light Mint
        preferOAuth: true,
      }).catch(() => {});
    }

    // 3. 새 영수증 발송 내역 행 추가 (D열 금액은 순수 숫자 타입 유지)
    const newRowValues = [
      [nowStr, recipientPhone, customerName, Number(amount) || 0, receiptContent, status, deviceId],
    ];

    await callSheetsTool("sheets_append_values", {
      spreadsheetId: targetSpreadsheetId,
      range: "A:G",
      values: newRowValues,
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[ReceiptSmsSync] append_values warning:", err.message);
    });

    return {
      success: true,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error("[ReceiptSmsSync] Error:", err);
    return { success: false, error: err.message };
  }
}
