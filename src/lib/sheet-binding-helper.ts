import {
  queryTable,
  insertRows,
  updateRows,
  listDriveFiles,
  getDriveFile,
  callSheetsTool,
  moveDriveFile,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export type SheetBindingType =
  | "SMS"
  | "KAKAO"
  | "MISSED_CALL"
  | "RECORDING"
  | "FILE_UPLOAD"
  | "RECEIPT"
  | "BUSINESS_CARD"
  | "LINK_BOOKMARK";

export interface ResolveSheetOptions {
  userEmail: string;
  sheetType: SheetBindingType;
  defaultTitle: string;
  requestedTitle?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  preferOAuth?: boolean;
}

export interface ResolveSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNew: boolean;
}

/**
 * 회원별 구글 스프레드시트 고유 ID 영구 바인딩 및 자가 치유 탐색기
 *
 * [원리 및 보장]:
 * 1. 사용자가 구글 드라이브에서 시트 파일명을 '2026 대장', '고객 관리' 등으로 자유롭게 변경하더라도,
 *    바인딩된 고유 spreadsheetId를 우선 조회하므로 100% 끊김 없이 동일 시트에 계속 기록됩니다.
 * 2. 시트가 실제로 구글 드라이브 휴지통에 가 있거나 삭제된 경우에만 자동으로 새 시트를 탐색/생성하고
 *    새 고유 ID로 스마트하게 자동 갱신(Re-binding)합니다.
 */
export async function resolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  await setupDatabase();

  const {
    userEmail,
    sheetType,
    defaultTitle,
    requestedTitle,
    folderId,
    preferOAuth = true,
  } = options;

  const cleanEmail = userEmail.trim().toLowerCase();
  const bindingId = `${cleanEmail}_${sheetType}`;
  const targetTitle = (requestedTitle && requestedTitle.trim().length > 0)
    ? requestedTitle.trim()
    : defaultTitle;

  // 1. My DB에서 기존 영구 바인딩된 고유 spreadsheetId 확인
  let boundRecord: any = null;
  try {
    const queryRes = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: sheetType },
      limit: 1,
    });
    if (queryRes?.rows && queryRes.rows.length > 0) {
      boundRecord = queryRes.rows[0];
    }
  } catch (err: any) {
    console.warn(`[SheetBinding] Failed to query bindings for ${bindingId}:`, err.message);
  }

  // 2. 바인딩된 ID가 유효한지 구글 드라이브에서 실시간 검증 (파일명이 바뀌었어도 ID만 일치하면 OK)
  if (boundRecord?.spreadsheet_id) {
    const existingId = boundRecord.spreadsheet_id;
    try {
      const driveFile = await getDriveFile(existingId, { preferOAuth });
      if (driveFile && !driveFile.trashed && !driveFile.explicitlyTrashed) {
        // 구글 드라이브에 시트가 정상 존재함 -> 파일명이 바뀌었어도 영구 바인딩 ID로 직행!
        const url = `https://docs.google.com/spreadsheets/d/${existingId}/edit`;
        return {
          spreadsheetId: existingId,
          spreadsheetUrl: url,
          isNew: false,
        };
      }
    } catch (checkErr: any) {
      console.warn(`[SheetBinding] Bound sheet ${existingId} verify warning:`, checkErr.message);
      // 권한 또는 일시적 오류일 경우 기존 ID를 최대한 보존
      if (checkErr.message?.includes("404") || checkErr.message?.includes("notFound") || checkErr.message?.includes("File not found")) {
        boundRecord = null; // 실제로 삭제된 경우에만 재탐색
      } else {
        const url = `https://docs.google.com/spreadsheets/d/${existingId}/edit`;
        return {
          spreadsheetId: existingId,
          spreadsheetUrl: url,
          isNew: false,
        };
      }
    }
  }

  // 3. 바인딩이 없거나 실제 파일이 삭제된 경우: 구글 드라이브에서 시트 탐색
  let targetSpreadsheetId: string | null = null;
  let isNew = false;

  const queryStr = folderId
    ? `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`
    : `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;

  try {
    const searchRes = await listDriveFiles({
      query: queryStr,
      preferOAuth,
    });
    const foundFiles = searchRes?.files || [];
    if (foundFiles.length > 0) {
      targetSpreadsheetId = foundFiles[0].id;
    }
  } catch (searchErr: any) {
    console.warn(`[SheetBinding] Drive search warning for ${targetTitle}:`, searchErr.message);
  }

  // 4. 드라이브에도 없으면 신규 생성
  if (!targetSpreadsheetId) {
    try {
      const createRes = await callSheetsTool("sheets_create_spreadsheet", {
        title: targetTitle,
        preferOAuth,
      });
      targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
      isNew = true;

      // 지정 폴더가 있으면 폴더로 이동
      if (targetSpreadsheetId && folderId) {
        await moveDriveFile(targetSpreadsheetId, folderId, preferOAuth).catch(() => {});
      }
    } catch (createErr: any) {
      console.error(`[SheetBinding] Failed to create spreadsheet ${targetTitle}:`, createErr);
      throw createErr;
    }
  }

  if (!targetSpreadsheetId) {
    throw new Error(`대장 시트를 생성하거나 탐색할 수 없습니다: ${targetTitle}`);
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

  // 5. 확정된 spreadsheetId를 My DB에 영구 바인딩(Upsert)
  const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    if (boundRecord) {
      await updateRows("sheetbot_user_sheet_bindings", {
        filters: { id: bindingId },
        updates: {
          spreadsheet_id: targetSpreadsheetId,
          spreadsheet_url: spreadsheetUrl,
          sheet_title: targetTitle,
          folder_id: folderId || null,
          updated_at: nowStr,
        },
      });
    } else {
      await insertRows("sheetbot_user_sheet_bindings", [
        {
          id: bindingId,
          user_email: cleanEmail,
          sheet_type: sheetType,
          spreadsheet_id: targetSpreadsheetId,
          spreadsheet_url: spreadsheetUrl,
          sheet_title: targetTitle,
          folder_id: folderId || null,
          created_at: nowStr,
          updated_at: nowStr,
        },
      ]);
    }
    console.log(`[SheetBinding] ✅ Successfully bound ${sheetType} -> ${targetSpreadsheetId} (${targetTitle})`);
  } catch (dbErr: any) {
    console.warn(`[SheetBinding] Failed to save binding to DB:`, dbErr.message);
  }

  return {
    spreadsheetId: targetSpreadsheetId,
    spreadsheetUrl,
    isNew,
  };
}
