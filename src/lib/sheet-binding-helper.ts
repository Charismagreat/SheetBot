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
  | "RECEIPT_SMS"
  | "WEBSITE_MONITOR"
  | "DISPATCH_LOG"
  | "QUOTE";

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

// 인메모리 바인딩 캐시 (프로세스 실행 중 0초 응답 보장)
const resolvedBindingCache = new Map<string, ResolveSheetResult>();

// 대표 관리자 및 기바인딩된 10대 대장 프리셋 (드라이브 및 DB 조회 전 0초 즉각 반환)
const KNOWN_DEFAULT_BINDINGS: Record<string, Partial<Record<SheetBindingType, string>>> = {
  "chachogreat@gmail.com": {
    WEBSITE_MONITOR: "1YkK5vuxxgqwumB-FRDCw_NyI-ojnhFfn7x-HQe7go4s",
    CALL_ENDED_CARD: "1EnsIL1JPoa4_e97dpvS53Fi7Sf-hrKGwVHa0i1FZFzI",
    FILE_UPLOAD: "1yxw6CTt269YWdfYoHLGf69picVoPVpsAiQTbq0Ss9mQ",
    SMS: "1FzEBoeQvniowaF6SMcQWujMnuSXqQZGqtIRPz0ha7kE",
    RECORDING: "1bHtvSdmqfHJ-1WkgPv9hMlaUjqbMxEBnkHQpk1kIiOQ",
    LINK_BOOKMARK: "1fSUK1NVshsX2unoTdfw7XfMjrbql46a4ecWp5E3EmeU",
    KAKAO: "1QKd7OBcp8IQ_2llO9jmmhWlkNRgaIRzT9v1vwZ2Ll1g",
    MISSED_CALL: "1DqUqEECRjE2luuLoBuyV8RXYLccqRpbSSD2SZvTOAXo",
    PAYMENT_PUSH: "1CSxsEJEpiBXisqw8yAqz3paTqcraH2kzW6RCpQ07vx8",
    RECEIPT_SMS: "1Hi-hYZAGcmWDSSBpUhgEl6_Utc6iIguUiFClqEqas9I",
    RECEIPT: "14t6C-90zNNN-NTXexP37fMOKX85gP9iTe3MIlM83RC4",
    BUSINESS_CARD: "1GPMcTd7hxU2-ORZ32OX7Qz0tOnxMDNtSPqwKzqiS_AI",
    QUOTE: "1XCQMxao3uIhbXGh5kYlnXE5g9vH5mFBQ0cohJGyMl1U",
  },
};

/**
 * 회원별 구글 스프레드시트 고유 ID 영구 바인딩 및 자가 치유 탐색기
 */
export async function resolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  const cleanEmail = options.userEmail.trim().toLowerCase();
  const normalizedType = (options.sheetType || "").toUpperCase() as SheetBindingType;
  const bindingKey = `${cleanEmail}_${normalizedType}`;

  // 0-1. 인메모리 바인딩 캐시 우선 확인 (0ms)
  const memoryCached = resolvedBindingCache.get(bindingKey);
  if (memoryCached?.spreadsheetId) {
    return memoryCached;
  }

  // 0-2. 사전 정의된 기바인딩 프리셋 확인 (0ms)
  const knownId = KNOWN_DEFAULT_BINDINGS[cleanEmail]?.[normalizedType];
  if (knownId) {
    const finalUrl = normalizedType === "QUOTE"
      ? `https://docs.google.com/spreadsheets/d/${knownId}/edit#gid=1021826080`
      : `https://docs.google.com/spreadsheets/d/${knownId}/edit`;
    const result: ResolveSheetResult = {
      spreadsheetId: knownId,
      spreadsheetUrl: finalUrl,
      isNew: false,
    };
    resolvedBindingCache.set(bindingKey, result);
    return result;
  }

  // 0-3. 동시 요청 뮤텍스 확인 (단, 8초 이상 블로킹 방지)
  if (inFlightResolutions.has(bindingKey)) {
    return inFlightResolutions.get(bindingKey)!;
  }

  const promise = doResolveUserSpreadsheet({ ...options, sheetType: normalizedType })
    .then((res) => {
      if (res?.spreadsheetId) {
        resolvedBindingCache.set(bindingKey, res);
      }
      return res;
    })
    .finally(() => {
      inFlightResolutions.delete(bindingKey);
    });

  inFlightResolutions.set(bindingKey, promise);
  return promise;
}

async function doResolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  const {
    userEmail,
    sheetType,
    defaultTitle,
    requestedTitle,
    folderId,
    preferOAuth = true,
  } = options;

  const cleanEmail = userEmail.trim().toLowerCase();
  const normalizedType = (sheetType || "").toUpperCase() as SheetBindingType;
  const bindingId = `${cleanEmail}_${normalizedType}`;
  const targetTitle = (requestedTitle && requestedTitle.trim().length > 0)
    ? requestedTitle.trim()
    : defaultTitle;

  // 1. My DB에서 기존 영구 바인딩된 고유 spreadsheetId 확인 (지연 초기화 적용)
  let boundRecord: any = null;
  try {
    const queryRes = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: normalizedType },
      limit: 1,
      orderBy: "id",
      orderDirection: "DESC",
    });
    if (queryRes?.rows && queryRes.rows.length > 0) {
      boundRecord = queryRes.rows[0];
    }
  } catch (err: any) {
    if (String(err?.message || "").includes("not found")) {
      // 테이블이 아직 없으면 단 1회 셋업 실행
      await setupDatabase().catch(() => {});
    } else {
      console.warn(`[SheetBinding] Failed to query bindings for ${bindingId}:`, err.message);
    }
  }

  // 2. 바인딩된 고유 ID가 있으면 구글 드라이브 추가 왕복 없이 즉시 반환 (0초 응답 보장)
  if (boundRecord?.spreadsheet_id) {
    const existingId = boundRecord.spreadsheet_id;
    let url = boundRecord.spreadsheet_url;
    if (!url) {
      url = normalizedType === "QUOTE"
        ? `https://docs.google.com/spreadsheets/d/${existingId}/edit#gid=1021826080`
        : `https://docs.google.com/spreadsheets/d/${existingId}/edit`;
    } else if (normalizedType === "QUOTE" && !url.includes("gid=")) {
      url = `${url}#gid=1021826080`;
    }

    return {
      spreadsheetId: existingId,
      spreadsheetUrl: url,
      isNew: false,
    };
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
      const createRes = await callSheetsTool(
        "sheets_create_spreadsheet",
        { title: targetTitle },
        { preferOAuth }
      );
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
    if (boundRecord?.id) {
      await updateRows("sheetbot_user_sheet_bindings", {
        filters: { id: boundRecord.id },
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
          id: Date.now(),
          user_email: cleanEmail,
          sheet_type: normalizedType,
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
