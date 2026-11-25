/**
 * 카카오톡 대화 내용 내보내기 텍스트 파일 구글 시트 동기화 엔진
 * 사용자 제안: "업로드된 대화내용의 시작(startTime)과 끝(endTime) 구간에 대해 해당 채팅방 행들을 덮어쓰기(Replace Window)"
 * - 기존 행 중 해당 기간 대화만 핀포인트로 교체
 * - 다른 채팅방이나 이전/이후 대화는 100% 무손실 보존
 * - 시간순 자동 재정렬
 */

import { callSheetsTool, insertRows } from "@/lib/egdesk-helpers";
import { getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import { resolveUserSpreadsheet } from "./sheet-binding-helper";
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
  sheetTitle: string = "[SheetBot] 카카오톡 메시지 대장",
  req?: Request
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

  // 1. 대장 시트 고유 ID 영구 바인딩 및 생성 (모바일 앱 x-visitor-session-id 헤더 포함)
  let targetSpreadsheetId: string | null = null;
  let spreadsheetUrl = "";
  let resolveError = "";

  const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);

  try {
    const resolved = await resolveUserSpreadsheet({
      userEmail,
      sheetType: "KAKAO",
      defaultTitle: "[SheetBot] 카카오톡 메시지 대장",
      requestedTitle: sheetTitle,
      preferOAuth: true,
      callOptions,
    });
    targetSpreadsheetId = resolved.spreadsheetId;
    spreadsheetUrl = resolved.spreadsheetUrl;
  } catch (err: any) {
    resolveError = String(err?.message || err || "");
    console.warn("[KakaoSheetSync] 시트 연동 실패:", resolveError);
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
      error: resolveError || "구글 스프레드시트 접근 또는 생성에 실패했습니다.",
    };
  }

  // 1-1. 첫 번째 시트 탭명 동적 조회 ("시트1" 하드코딩 제거 → 영어 "Sheet1"/커스텀 탭명 호환)
  let firstTabName = "";
  try {
    const meta = await callSheetsTool(
      "sheets_get_spreadsheet",
      {
        spreadsheetId: targetSpreadsheetId,
        preferOAuth: true,
      },
      callOptions
    );
    const sheetsArr = meta?.sheets;
    if (Array.isArray(sheetsArr) && sheetsArr.length > 0 && sheetsArr[0]?.title) {
      firstTabName = String(sheetsArr[0].title);
    }
  } catch (metaErr: any) {
    console.warn("[KakaoSheetSync] 시트 메타데이터 조회 경고(기본 첫 탭 범위로 진행):", metaErr?.message);
  }

  const rangeOf = (a1: string) =>
    firstTabName ? `'${firstTabName.replace(/'/g, "''")}'!${a1}` : a1;

  // 2. 1행 헤더 보장 (Self-Healing: 실시간 카톡 대장 A1:I1 9컬럼 스키마와 완전 통일)
  const headers = [
    ["수신 일시", "채팅방 구분", "채팅방/상대방 이름", "발신자", "메시지 내용", "기기명", "상태", "메시지ID", "파일링크"]
  ];

  const firstRowCheck = await callSheetsTool(
    "sheets_get_range",
    {
      spreadsheetId: targetSpreadsheetId,
      range: rangeOf("A1:I1"),
      preferOAuth: true,
    },
    callOptions
  ).catch((err: any) => {
    console.warn("[KakaoSheetSync] 헤더 확인 경고:", err?.message);
    return null;
  });

  const firstRow = firstRowCheck?.values?.[0] || [];
  const hasHeader = Boolean(firstRow[0]);
  const hasStatusHeader = Boolean(firstRow[6]);
  const hasFileLinkHeader = Boolean(firstRow[8]);

  if (!hasHeader) {
    await callSheetsTool(
      "sheets_update_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: rangeOf("A1:I1"),
        values: headers,
        preferOAuth: true,
      },
      callOptions
    ).catch((err: any) => {
      console.warn("[KakaoSheetSync] 헤더 작성 경고:", err?.message);
    });

    if (firstTabName) {
      await callSheetsTool(
        "sheets_format_headers",
        {
          spreadsheetId: targetSpreadsheetId,
          tabName: firstTabName,
          headerBgColor: "#3c1e1e",
          headerTextColor: "#fee500",
          preferOAuth: true,
        },
        callOptions
      ).catch(() => {});
    }
  } else if (!hasStatusHeader || !hasFileLinkHeader) {
    await callSheetsTool(
      "sheets_update_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: rangeOf("G1:I1"),
        values: [["상태", "메시지ID", "파일링크"]],
        preferOAuth: true,
      },
      callOptions
    ).catch(() => {});
  }

  // 3. 기존 대화 데이터 전체 로드 (A2:I — G~I열 상태/메시지ID/파일링크 무손실 보존)
  let existingRows: any[][] = [];
  try {
    const existingDataRes = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: rangeOf("A2:I"),
        preferOAuth: true,
      },
      callOptions
    );
    existingRows = existingDataRes?.values || [];
  } catch (readErr: any) {
    const errMsg = String(readErr?.message || readErr || "기존 시트 데이터 조회 실패");
    console.error("[KakaoSheetSync] 기존 대화 조회 실패(데이터 유실 방지를 위해 중단):", errMsg);
    return {
      success: false,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl,
      chatRoomName,
      startTime,
      endTime,
      replacedRowsCount: 0,
      newRowsCount: 0,
      totalSheetRowsCount: 0,
      error: `구글 시트 기존 데이터 조회 실패: ${errMsg}`,
    };
  }

  // 4. [사용자 제안 핵심 로직] 구간 덮어쓰기 (Replace Window)
  // 대상: 해당 채팅방(row[2])이면서 시작 일시 <= row[0] <= 종료 일시 구간에 속하는 기존 행 제거
  let replacedCount = 0;
  const preservedRows: any[][] = [];

  for (const row of existingRows) {
    if (!row || row.length === 0 || !row[0]) continue;
    const rowTime = String(row[0]).trim();
    const rowRoom = String(row[2] || "").trim();

    // 해당 채팅방명 매칭 검사 (부분 일치 또는 동일)
    const isTargetRoom =
      rowRoom.length > 0 &&
      (rowRoom.includes(chatRoomName) || chatRoomName.includes(rowRoom));
    const isInTimeWindow = rowTime >= startTime && rowTime <= endTime;

    if (isTargetRoom && isInTimeWindow) {
      // 교체 대상 구간의 기존 행 (삭제 대상)
      replacedCount++;
    } else {
      // 보존 대상 행 (9컬럼 길이 정규화)
      preservedRows.push([
        row[0] ?? "",
        row[1] ?? "",
        row[2] ?? "",
        row[3] ?? "",
        row[4] ?? "",
        row[5] ?? "",
        row[6] ?? "",
        row[7] ?? "",
        row[8] ?? "",
      ]);
    }
  }

  // 파일에서 파싱된 신규 행들 변환 (9컬럼 스키마 통일)
  const newRows = messages.map((m) => [
    m.timestamp,
    m.direction,
    m.chatRoomName,
    m.sender,
    m.message,
    "카카오톡 내보내기",
    "정상",
    "",
    "",
  ]);

  // 보존된 행들과 신규 행들을 병합 후 시간순 정렬
  const mergedRows = [...preservedRows, ...newRows];
  mergedRows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  // 5. 시트 갱신: 기존 A2:I 영역 비우고, 병합된 전체 데이터 덮어쓰기 (실패 시 에러 전파)
  try {
    await callSheetsTool(
      "sheets_clear_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: rangeOf("A2:I"),
        preferOAuth: true,
      },
      callOptions
    );
  } catch (clearErr: any) {
    const errMsg = String(clearErr?.message || clearErr || "시트 영역 초기화 실패");
    console.error("[KakaoSheetSync] sheets_clear_range 실패:", errMsg);
    return {
      success: false,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl,
      chatRoomName,
      startTime,
      endTime,
      replacedRowsCount: 0,
      newRowsCount: 0,
      totalSheetRowsCount: existingRows.length,
      error: `구글 시트 영역 초기화 실패: ${errMsg}`,
    };
  }

  if (mergedRows.length > 0) {
    // 500줄 단위로 분할 청크 전송 (Google Sheets API 페이로드 한도 방어)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < mergedRows.length; i += CHUNK_SIZE) {
      const chunk = mergedRows.slice(i, i + CHUNK_SIZE);
      try {
        await callSheetsTool(
          "sheets_append_values",
          {
            spreadsheetId: targetSpreadsheetId,
            range: rangeOf("A:I"),
            values: chunk,
            preferOAuth: true,
          },
          callOptions
        );
      } catch (appendErr: any) {
        const errMsg = String(appendErr?.message || appendErr || "행 추가 실패");
        console.error(`[KakaoSheetSync] 행 추가 청크(${i}~${i + chunk.length}) 실패:`, errMsg);
        return {
          success: false,
          spreadsheetId: targetSpreadsheetId,
          spreadsheetUrl,
          chatRoomName,
          startTime,
          endTime,
          replacedRowsCount: replacedCount,
          newRowsCount: i,
          totalSheetRowsCount: i,
          error: `구글 시트 행 기록 실패: ${errMsg}`,
        };
      }
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
