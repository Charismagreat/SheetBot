import {
  callSheetsTool,
  listDriveFiles,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

export interface RecordBusinessCardParams {
  userEmail: string;
  sentTime?: string;
  recipientPhone: string;
  contactName?: string;
  sendMode?: "스마트 웹 명함(0원)" | "사진 첨부 MMS" | string;
  cardContentOrUrl: string;
  status?: "발송 성공" | "발송 실패" | "전송 완료";
  deviceId?: string;
  sheetTitle?: string;
}

export interface RecordBusinessCardResult {
  success: boolean;
  spreadsheetUrl?: string;
  error?: string;
}

/**
 * 모바일 명함 발송 내역을 구글 드라이브 [SheetBot] 모바일 명함 발송 대장 시트에 실시간 자동 기록
 * - 7대 표준 열: ["발송 일시", "상대방 번호", "연락처 이름", "발송 방식", "명함 내용/URL", "발송 결과", "기기명"]
 * - Self-Healing 헤더 보장 (시트 신규 생성 시 헤더 및 인디고 테마 서식 자동 세팅)
 * - KST 한국 표준시 적용
 */
export async function recordBusinessCardToGoogleSheet(
  params: RecordBusinessCardParams
): Promise<RecordBusinessCardResult> {
  try {
    const {
      userEmail,
      sentTime,
      recipientPhone,
      contactName = "미등록 연락처",
      sendMode = "스마트 웹 명함(0원)",
      cardContentOrUrl,
      status = "전송 완료",
      deviceId = "SheetBot Agent",
      sheetTitle: rawSheetTitle = "[SheetBot] 모바일 명함 발송 대장",
    } = params;

    if (!userEmail) {
      return { success: false, error: "userEmail이 누락되었습니다." };
    }

    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    const nowStr = sentTime || getKoreanTimeString();

    // 1. 회원별 대장 고유 ID 영구 바인딩 및 0초 즉각 조회
    const resolved = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "CALL_ENDED_CARD",
      defaultTitle: "[SheetBot] 모바일 명함 발송 대장",
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
      ["발송 일시", "상대방 번호", "연락처 이름", "발송 방식", "명함 내용/URL", "발송 결과", "기기명"]
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

      // 인디고/퍼플 비즈니스 테마 헤더 서식 스타일링
      await callSheetsTool("sheets_format_headers", {
        spreadsheetId: targetSpreadsheetId,
        tabName: "시트1",
        headerBgColor: "#4338ca", // Dark Indigo
        headerTextColor: "#eef2ff", // Light Indigo
        preferOAuth: true,
      }).catch(() => {});
    }

    // 3. 새 모바일 명함 발송 내역 행 추가
    const newRowValues = [
      [nowStr, recipientPhone, contactName || "미등록 연락처", sendMode, cardContentOrUrl, status, deviceId],
    ];

    await callSheetsTool("sheets_append_values", {
      spreadsheetId: targetSpreadsheetId,
      range: "A:G",
      values: newRowValues,
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[BusinessCardSync] append_values warning:", err.message);
    });

    return {
      success: true,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error("[BusinessCardSync] Error:", err);
    return { success: false, error: err.message };
  }
}
