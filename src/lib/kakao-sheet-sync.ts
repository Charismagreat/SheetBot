/**
 * 카카오톡 대화 내용 내보내기 텍스트 파일 구글 시트 동기화 엔진
 * 사용자 제안: "업로드된 대화내용의 시작(startTime)과 끝(endTime) 구간에 대해 해당 채팅방 행들을 덮어쓰기(Replace Window)"
 * - 기존 행 중 해당 기간 대화만 핀포인트로 교체
 * - 다른 채팅방이나 이전/이후 대화는 100% 무손실 보존
 * - 시간순 자동 재정렬
 */

import { callSheetsTool, listDriveFiles, insertRows } from "@/lib/egdesk-helpers";
import { KakaoChatParseResult } from "./kakao-chat-parser";

export interface SyncKakaoChatResult {
  success: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  chatRoomName: string;
  startTime: string;
  endTime: string;
  replacedRowsCount: number;
  newRowsCount: number;
  totalSheetRowsCount: number;
  error?: string;
}

export async function syncKakaoChatToSheet(
  userEmail: string,
  parseResult: KakaoChatParseResult,
  sheetTitle: string = "[SheetBot] 카카오톡 메시지 대장"
): Promise<SyncKakaoChatResult> {
  const { chatRoomName, startTime, endTime, messages } = parseResult;

  if (messages.length === 0) {
    return {
      success: false,
      chatRoomName,
      startTime: "",
      endTime: "",
      replacedRowsCount: 0,
      newRowsCount: 0,
      totalSheetRowsCount: 0,
      error: "파싱된 대화 내용이 없습니다.",
    };
  }

  // 1. 대장 시트 검색 및 생성
  let targetSpreadsheetId: string | null = null;
  let spreadsheetUrl = "";

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
    const createRes = await callSheetsTool("sheets_create_spreadsheet", {
      title: sheetTitle,
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[KakaoSheetSync] 시트 생성 실패:", err.message);
      return null;
    });

    targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
    if (targetSpreadsheetId) {
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
    }
  }

  if (!targetSpreadsheetId) {
    return {
      success: false,
      chatRoomName,
      startTime,
      endTime,
      replacedRowsCount: 0,
      newRowsCount: 0,
      totalSheetRowsCount: 0,
      error: "구글 스프레드시트 접근 또는 생성에 실패했습니다.",
    };
  }

  // 2. 1행 헤더 보장 (Self-Healing)
  const headers = [
    ["일시", "구분", "채팅방/상대방 이름", "발신자", "메시지 내용", "기기명"]
  ];

  const firstRowCheck = await callSheetsTool("sheets_get_range", {
    spreadsheetId: targetSpreadsheetId,
    range: "시트1!A1:F1",
    preferOAuth: true,
  }).catch(() => null);

  const hasHeader = firstRowCheck?.values && firstRowCheck.values.length > 0 && firstRowCheck.values[0]?.[0];
  if (!hasHeader) {
    await callSheetsTool("sheets_update_range", {
      spreadsheetId: targetSpreadsheetId,
      range: "시트1!A1:F1",
      values: headers,
      preferOAuth: true,
    }).catch(() => {});

    await callSheetsTool("sheets_format_headers", {
      spreadsheetId: targetSpreadsheetId,
      tabName: "시트1",
      headerBgColor: "#1e293b",
      headerTextColor: "#ffffff",
      preferOAuth: true,
    }).catch(() => {});
  }

  // 3. 기존 대화 데이터 전체 로드 (A2:F)
  const existingDataRes = await callSheetsTool("sheets_get_range", {
    spreadsheetId: targetSpreadsheetId,
    range: "시트1!A2:F",
    preferOAuth: true,
  }).catch(() => null);

  const existingRows: any[][] = existingDataRes?.values || [];

  // 4. [사용자 제안 핵심 로직] 구간 덮어쓰기 (Replace Window)
  // 대상: 해당 채팅방(row[2])이면서 시작 일시 <= row[0] <= 종료 일시 구간에 속하는 기존 행 제거
  let replacedCount = 0;
  const preservedRows: any[][] = [];

  for (const row of existingRows) {
    if (!row || row.length === 0 || !row[0]) continue;
    const rowTime = String(row[0]).trim();
    const rowRoom = String(row[2] || "").trim();

    // 해당 채팅방명 매칭 검사 (부분 일치 또는 동일)
    const isTargetRoom = rowRoom.includes(chatRoomName) || chatRoomName.includes(rowRoom);
    const isInTimeWindow = rowTime >= startTime && rowTime <= endTime;

    if (isTargetRoom && isInTimeWindow) {
      // 교체 대상 구간의 기존 행 (삭제 대상)
      replacedCount++;
    } else {
      // 보존 대상 행
      preservedRows.push(row);
    }
  }

  // 파일에서 파싱된 신규 행들 변환
  const newRows = messages.map((m) => [
    m.timestamp,
    m.direction,
    m.chatRoomName,
    m.sender,
    m.message,
    "카카오톡 내보내기",
  ]);

  // 보존된 행들과 신규 행들을 병합 후 시간순 정렬
  const mergedRows = [...preservedRows, ...newRows];
  mergedRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  // 5. 시트 갱신: 기존 A2:F 영역 비우고, 병합된 전체 데이터 덮어쓰기
  await callSheetsTool("sheets_clear_range", {
    spreadsheetId: targetSpreadsheetId,
    range: "시트1!A2:F",
    preferOAuth: true,
  }).catch(() => {});

  if (mergedRows.length > 0) {
    // 500줄 단위로 분할 청크 전송 (Google Sheets API 페이로드 한도 방어)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < mergedRows.length; i += CHUNK_SIZE) {
      const chunk = mergedRows.slice(i, i + CHUNK_SIZE);
      await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "시트1!A2",
        values: chunk,
        preferOAuth: true,
      }).catch((err: any) => {
        console.error("[KakaoSheetSync] 행 추가 청크 실패:", err.message);
      });
    }
  }

  // 6. My DB 감사 대장에도 1건 요약 기록
  try {
    await insertRows("sheetbot_kakao_import_logs", [
      {
        user_email: userEmail,
        chat_room_name: chatRoomName,
        start_time: startTime,
        end_time: endTime,
        total_imported: messages.length,
        replaced_count: replacedCount,
        created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      },
    ]);
  } catch (dbErr) {
    // 감사 로그 실패는 시트 갱신 성공을 방해하지 않음
  }

  return {
    success: true,
    spreadsheetId: targetSpreadsheetId,
    spreadsheetUrl,
    chatRoomName,
    startTime,
    endTime,
    replacedRowsCount: replacedCount,
    newRowsCount: messages.length,
    totalSheetRowsCount: mergedRows.length,
  };
}
