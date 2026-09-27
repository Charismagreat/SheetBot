import {
  queryTable,
  insertRows,
  updateRows,
  listDriveFiles,
  getDriveFile,
  callSheetsTool,
  moveDriveFile,
  trashDriveFile,
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
  | "LINK_BOOKMARK"
  | "CALL_ENDED_CARD"
  | "PAYMENT_PUSH"
  | "RECEIPT_SMS";

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

// 동시 다발적 요청 시 중복 시트 생성 방지를 위한 인메모리 뮤텍스
const inFlightResolutions = new Map<string, Promise<ResolveSheetResult>>();

/**
 * 회원별 구글 스프레드시트 고유 ID 영구 바인딩 및 자가 치유 탐색기
 *
 * [원리 및 보장]:
 * 1. 동시성 제어(In-flight Mutex): 앱 시작 시 동시에 들어오는 다중 프로비저닝 요청을 1개의 Promise로 단일화.
 * 2. 2단계 스마트 탐색(Smart Fallback): 폴더 내 탐색 실패 시 전체 드라이브에서 기존 시트를 선제 발굴하여 중복 생성 원천 차단.
 * 3. 자가 치유 정리(Self-Healing Cleanup): 동일 이름의 여분 중복 시트 발견 시 최신 1개만 확정하고 나머지는 자동 휴지통 정리.
 */
export async function resolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  const cleanEmail = options.userEmail.trim().toLowerCase();
  const bindingKey = `${cleanEmail}_${options.sheetType}`;

  // 이미 동일 사용자의 동일 시트에 대해 탐색/생성이 진행 중이면 기존 Promise를 함께 대기
  if (inFlightResolutions.has(bindingKey)) {
    return inFlightResolutions.get(bindingKey)!;
  }

  const promise = doResolveUserSpreadsheet(options).finally(() => {
    inFlightResolutions.delete(bindingKey);
  });

  inFlightResolutions.set(bindingKey, promise);
  return promise;
}

async function doResolveUserSpreadsheet(
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
        // 구글 드라이브에 시트가 정상 존재함 -> 영구 바인딩 ID로 즉시 반환
        const url = `https://docs.google.com/spreadsheets/d/${existingId}/edit`;

        // 지정 폴더가 있는데 다른 곳에 있다면 지정 폴더로 이동 보장
        if (folderId && driveFile.parents && !driveFile.parents.includes(folderId)) {
          await moveDriveFile(existingId, folderId, preferOAuth).catch(() => {});
        }

        return {
          spreadsheetId: existingId,
          spreadsheetUrl: url,
          isNew: false,
        };
      }
    } catch (checkErr: any) {
      console.warn(`[SheetBinding] Bound sheet ${existingId} verify warning:`, checkErr.message);
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

  // 3. 바인딩이 없거나 실제 파일이 삭제된 경우: 구글 드라이브 2단계 스마트 탐색
  let targetSpreadsheetId: string | null = null;
  let isNew = false;

  // 3-1. 1차: 지정된 폴더가 있다면 해당 폴더 내부 탐색
  if (folderId) {
    try {
      const folderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
      const searchRes = await listDriveFiles({ query: folderQuery }, { preferOAuth });
      const foundFiles = searchRes?.files || [];
      if (foundFiles.length > 0) {
        targetSpreadsheetId = foundFiles[0].id;
      }
    } catch (searchErr: any) {
      console.warn(`[SheetBinding] Folder drive search warning for ${targetTitle}:`, searchErr.message);
    }
  }

  // 3-2. 2차: 폴더 내에서 못 찾았거나 폴더가 지정되지 않은 경우, 전체 드라이브에서 동일 파일명 시트 탐색 (중복 생성 방지 핵심 안전망)
  if (!targetSpreadsheetId) {
    try {
      const globalQuery = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
      const searchRes = await listDriveFiles({ query: globalQuery }, { preferOAuth });
      const foundFiles = searchRes?.files || [];
      if (foundFiles.length > 0) {
        // 가장 최근에 수정된 파일 선택
        targetSpreadsheetId = foundFiles[0].id;

        // 만약 지정 폴더가 있는데 루트 등 다른 곳에 있었다면 폴더로 이동
        if (folderId && targetSpreadsheetId) {
          await moveDriveFile(targetSpreadsheetId, folderId, preferOAuth).catch(() => {});
        }

        // 만약 중복으로 생성된 여분의 동일 파일들이 있다면 2번째부터는 자동으로 휴지통 정리(Self-Healing)
        if (foundFiles.length > 1) {
          console.log(`[SheetBinding] Cleaning up ${foundFiles.length - 1} duplicate sheets for '${targetTitle}'...`);
          for (let i = 1; i < foundFiles.length; i++) {
            trashDriveFile(foundFiles[i].id, preferOAuth).catch(() => {});
          }
        }
      }
    } catch (searchErr: any) {
      console.warn(`[SheetBinding] Global drive search warning for ${targetTitle}:`, searchErr.message);
    }
  }

  // 4. 드라이브 전체에도 없으면 그때에만 최초 1회 신규 생성
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
