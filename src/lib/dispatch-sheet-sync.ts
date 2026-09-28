import {
  callSheetsTool,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";

export interface RecordDispatchParams {
  userEmail: string;
  dispatchTime?: string;
  direction?: "발신(SMS)" | "수신(SMS)" | "결제푸시" | string;
  ruleName?: string;
  recipient: string;
  content: string;
  status?: "SUCCESS" | "FAILED" | "INBOUND" | "PENDING" | string;
  errorMessage?: string | null;
  deviceId?: string;
  sheetTitle?: string;
}

// 90초 이내 완전 동일 메시지 중복 기록 방지를 위한 인메모리 디바운싱 맵
const recentDispatchDedupeMap = new Map<string, number>();

function cleanOldDispatchDedupeEntries() {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5분 지난 키 정리
  for (const [key, timestamp] of recentDispatchDedupeMap.entries()) {
    if (timestamp < cutoff) {
      recentDispatchDedupeMap.delete(key);
    }
  }
}

export interface RecordDispatchResult {
  success: boolean;
  spreadsheetUrl?: string;
  duplicated?: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_DISPATCH_SHEET_TITLE = "[SheetBot] 고객 알림 발송 및 수신 대장";

/**
 * 회원별 [SheetBot] 고객 알림 발송 및 수신 대장 시트 URL 조회 (0초 캐시 및 바인딩)
 */
export async function getDispatchSheetUrl(userEmail: string): Promise<string | null> {
  if (!userEmail) return null;
  try {
    const resolved = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "DISPATCH_LOG",
      defaultTitle: DEFAULT_DISPATCH_SHEET_TITLE,
      preferOAuth: true,
    });
    return resolved?.spreadsheetUrl || null;
  } catch (err: any) {
    console.warn("[DispatchSheetSync] getDispatchSheetUrl error:", err?.message);
    return null;
  }
}

/**
 * 🛡️ [Zero-Retention 실현] 고객 알림 발송 및 수신 내역을 서버 DB가 아닌 이용자 본인의 구글 스프레드시트에 직접 실시간 기록
 * - 서버에는 고객 전화번호나 문자 전문을 영구 보관하지 않고, 오직 이용자 본인의 구글 시트에만 100% 안전하게 저장
 * - [일시, 구분, 규칙/이벤트명, 대상 연락처, 메시지 내용, 상태, 발신 기기, 비고/오류] 8열 표준 규격
 * - 시트가 없으면 자동 생성 및 인디고 프리미엄 서식 헤더 자동 적용
 * - Self-Healing 헤더 보장 (1행 헤더 누락 시 자동 복구)
 */
export async function recordDispatchToGoogleSheet(
  params: RecordDispatchParams
): Promise<RecordDispatchResult> {
  try {
    const {
      userEmail,
      dispatchTime,
      direction = "발신(SMS)",
      ruleName = "스마트 알림",
      recipient,
      content,
      status = "SUCCESS",
      errorMessage = null,
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = DEFAULT_DISPATCH_SHEET_TITLE,
    } = params;

    if (!userEmail) {
      return { success: false, error: "userEmail이 누락되었습니다." };
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const cleanRecipient = (recipient || "").trim();
    const cleanContent = (content || "").trim();

    // 🛡️ [90초 스마트 중복 방지 필터]
    const dedupeKey = `${cleanEmail}_${direction}_${cleanRecipient}_${cleanContent.slice(0, 30)}`;
    const nowMs = Date.now();
    const lastRecordedAt = recentDispatchDedupeMap.get(dedupeKey);

    if (lastRecordedAt && (nowMs - lastRecordedAt) < 90 * 1000) {
      console.log(`🛡️ [DispatchSheetSync] 90초 이내 중복 알림 감지 - 시트 기록 방어: ${dedupeKey}`);
      return {
        success: true,
        duplicated: true,
        message: "동일 알림 내역이 이미 대장에 기록되었습니다.",
      };
    }

    recentDispatchDedupeMap.set(dedupeKey, nowMs);
    cleanOldDispatchDedupeEntries();

    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    const nowStr =
      dispatchTime ||
      new Date().toISOString().replace("T", " ").slice(0, 19);

    let targetSpreadsheetId: string | null = null;
    let spreadsheetUrl = "";

    // 1. 회원별 대장 고유 ID 영구 바인딩 및 즉시 조회
    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "DISPATCH_LOG",
        defaultTitle: DEFAULT_DISPATCH_SHEET_TITLE,
        requestedTitle: sheetTitle,
        preferOAuth: true,
      });
      if (resolved?.spreadsheetId) {
        targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;
      }
    } catch (resolveErr: any) {
      console.warn("[DispatchSheetSync] resolveUserSpreadsheet fallback:", resolveErr?.message);
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
          console.warn("[DispatchSheetSync] sheets_create_spreadsheet warning:", err.message);
          return null;
        });

        targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
        if (targetSpreadsheetId) {
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
        }
      }
    }

    if (!targetSpreadsheetId) {
      return { success: false, error: "알림 발송 대장 스프레드시트를 생성하거나 찾을 수 없습니다." };
    }

    // 3. 자가 치유(Self-Healing) 헤더 검사 및 보장 (8열 표준 헤더)
    const headerValues = [
      ["일시", "구분", "규칙/이벤트명", "대상 연락처", "메시지 내용", "발송 상태", "발신 기기", "오류 메시지"],
    ];

    const firstRowCheck = await callSheetsTool("sheets_get_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "A1:H1",
      preferOAuth: true,
    }).catch(() => null);

    const firstRowValues = firstRowCheck?.values?.[0] || [];
    const hasHeader = firstRowValues.length > 0 && Boolean(firstRowValues[0]);

    if (!hasHeader) {
      await callSheetsTool("sheets_update_range", {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:H1",
        values: headerValues,
        preferOAuth: true,
      }).catch(() => {});

      // 딥 인디고 비즈니스 테마 헤더 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: targetSpreadsheetId,
        tabName: "시트1",
        headerBgColor: "#1e1b4b", // Deep Indigo
        headerTextColor: "#e0e7ff", // Light Indigo Mint
        preferOAuth: true,
      }).catch(() => {});
    }

    // 4. 상태 텍스트 한글화
    let statusLabel = status;
    if (status === "SUCCESS") statusLabel = "발송 성공";
    else if (status === "FAILED") statusLabel = "발송 실패";
    else if (status === "INBOUND") statusLabel = "수신 완료";
    else if (status === "PENDING") statusLabel = "대기 중";

    // 5. 새 발송/수신 내역 행 추가
    const newRowValues = [
      [nowStr, direction, ruleName, cleanRecipient, cleanContent, statusLabel, deviceId, errorMessage || "-"],
    ];

    await callSheetsTool("sheets_append_values", {
      spreadsheetId: targetSpreadsheetId,
      range: "A:H",
      values: newRowValues,
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[DispatchSheetSync] append_values warning:", err.message);
    });

    return {
      success: true,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error("[DispatchSheetSync] Error:", err);
    return { success: false, error: err.message };
  }
}
