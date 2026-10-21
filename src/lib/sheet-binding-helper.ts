import {
  queryTable,
  insertRows,
  updateRows,
  listDriveFiles,
  getDriveFile,
  callSheetsTool,
  callDriveTool,
  moveDriveFile,
  trashDriveFile,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getWorkspaceCallOptionsForEmail } from "@/lib/auth";

export type SheetBindingType =
  | "SMS"
  | "KAKAO"
  | "MISSED_CALL"
  | "RECORDING"
  | "CALL_RECORDING"
  | "MEETING"
  | "COMPANY_RESEARCH"
  | "LAW_ADVISORY"
  | "NAVER_BLOG"
  | "INSTAGRAM"
  | "MOBILE_SITE"
  | "FILE_UPLOAD"
  | "RECEIPT"
  | "BUSINESS_CARD"
  | "LINK_BOOKMARK"
  | "CALL_ENDED_CARD"
  | "PAYMENT_PUSH"
  | "RECEIPT_SMS"
  | "WEBSITE_MONITOR"
  | "DISPATCH_LOG"
  | "QUOTE"
  | "ESTIMATE"
  | "CONTACTS"
  | "SHEET_SMS_CHECKBOX";

export interface ResolveSheetOptions {
  userEmail: string;
  sheetType: SheetBindingType;
  defaultTitle?: string;
  requestedTitle?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  preferOAuth?: boolean;
  forceRefresh?: boolean;
  visitorSessionId?: string | null;
  callOptions?: WorkspaceVisitorCallOptions;
}

export interface ResolveSheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  isNew: boolean;
}

// 동시 다발적 요청 시 중복 시트 생성 방지를 위한 인메모리 뮤텍스
const inFlightResolutions = new Map<string, Promise<ResolveSheetResult>>();

// 인메모리 바인딩 캐시 (60초 유효)
interface CachedBinding {
  result: ResolveSheetResult;
  timestamp: number;
}
const resolvedBindingCache = new Map<string, CachedBinding>();
const BINDING_CACHE_TTL_MS = 60_000;

/**
 * 특정 회원의 대장 바인딩을 강제 무효화(캐시 및 DB 초기화)하여 다음 요청 시 재탐색/자가치유하도록 처리
 */
export async function invalidateUserSheetBinding(
  userEmail: string,
  sheetType: SheetBindingType
): Promise<void> {
  const cleanEmail = userEmail.trim().toLowerCase();
  const normalizedType = (sheetType || "").toUpperCase() as SheetBindingType;
  const bindingKey = `${cleanEmail}_${normalizedType}`;
  resolvedBindingCache.delete(bindingKey);
  try {
    await updateRows("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: normalizedType },
      updates: {
        spreadsheet_id: null,
        spreadsheet_url: null,
        updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
      },
    });
    console.log(`[SheetBinding] 🗑️ Invalidation complete for ${bindingKey}`);
  } catch (err: any) {
    console.warn(`[SheetBinding] Failed to invalidate DB binding for ${bindingKey}:`, err?.message);
  }
}

/**
 * 회원별 구글 스프레드시트 고유 ID 영구 바인딩 및 자가 치유 탐색기
 */
export async function resolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  const cleanEmail = options.userEmail.trim().toLowerCase();
  const normalizedType = (options.sheetType || "").toUpperCase() as SheetBindingType;
  const bindingKey = `${cleanEmail}_${normalizedType}`;

  // 0-1. 인메모리 바인딩 캐시 우선 확인 (forceRefresh가 아닐 때 60초 유효)
  if (!options.forceRefresh) {
    const memoryCached = resolvedBindingCache.get(bindingKey);
    if (memoryCached && Date.now() - memoryCached.timestamp < BINDING_CACHE_TTL_MS) {
      return memoryCached.result;
    }
  }

  // 0-2. 동시 요청 뮤텍스 확인 (단, 8초 이상 블로킹 방지)
  if (inFlightResolutions.has(bindingKey)) {
    return inFlightResolutions.get(bindingKey)!;
  }

  const promise = doResolveUserSpreadsheet({ ...options, sheetType: normalizedType })
    .then((res) => {
      if (res?.spreadsheetId) {
        resolvedBindingCache.set(bindingKey, { result: res, timestamp: Date.now() });
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

  // 1-1. 사용자별 구글 OAuth/Visitor 세션 옵션 확정 (멀티테넌시 완벽 격리)
  const callOptions = options.callOptions || (await getWorkspaceCallOptionsForEmail(cleanEmail));

  let targetSpreadsheetId: string | null = null;
  let isNew = false;

  // 2. 바인딩된 고유 ID가 있으면 구글 드라이브에서 실제 파일의 활성(휴지통 제외) 상태 검증
  if (boundRecord?.spreadsheet_id) {
    const candidateId = boundRecord.spreadsheet_id;
    try {
      let activeFiles: any[] = [];
      // 2-1. 지정 폴더가 있으면 해당 폴더 내 활성 시트 확인
      if (folderId) {
        const folderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
        const folderRes = await listDriveFiles({ query: folderQuery }, { preferOAuth, ...callOptions }).catch(() => ({ files: [] }));
        activeFiles = folderRes?.files || [];
      }
      // 2-2. 폴더 내에 없으면 드라이브 전체에서 동일 제목의 활성 시트 확인
      if (activeFiles.length === 0) {
        const globalQuery = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
        const globalRes = await listDriveFiles({ query: globalQuery }, { preferOAuth, ...callOptions }).catch(() => ({ files: [] }));
        activeFiles = globalRes?.files || [];
      }

      if (activeFiles.some((f: any) => f.id === candidateId)) {
        // 기존 바인딩 시트가 정상적으로 활성 상태임 (휴지통에 없음)
        targetSpreadsheetId = candidateId;
      } else if (activeFiles.length > 0) {
        // 기존 candidateId는 사용자에 의해 휴지통으로 이동되었으나 동일 제목의 다른 활성 시트가 존재함 -> 자동 리바인딩
        console.log(`[SheetBinding] 🔄 Candidate sheet ${candidateId} was trashed/superseded. Auto-rebinding to active sheet ${activeFiles[0].id} for '${targetTitle}'...`);
        targetSpreadsheetId = activeFiles[0].id;
      } else {
        // 동일 제목의 활성 시트가 드라이브에 전무함 -> 사용자가 시트를 휴지통으로 버렸거나 영구 삭제함!
        console.warn(`[SheetBinding] ⚠️ Sheet ${candidateId} for '${targetTitle}' was TRASHED by user! Invalidating stale binding to trigger fresh creation...`);
        targetSpreadsheetId = null;
      }
    } catch (checkErr: any) {
      console.warn(`[SheetBinding] Active check warning for ${targetTitle}:`, checkErr?.message);
      targetSpreadsheetId = candidateId;
    }

    if (targetSpreadsheetId) {
      let url = boundRecord.spreadsheet_url;
      if (!url || targetSpreadsheetId !== candidateId) {
        url = normalizedType === "QUOTE"
          ? `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit#gid=1021826080`
          : `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
      } else if (normalizedType === "QUOTE" && !url.includes("gid=")) {
        url = `${url}#gid=1021826080`;
      }

      // 만약 다른 활성 시트로 리바인딩된 경우 DB 즉시 업데이트
      if (boundRecord.id && targetSpreadsheetId !== candidateId) {
        await updateRows("sheetbot_user_sheet_bindings", {
          filters: { id: boundRecord.id },
          updates: {
            spreadsheet_id: targetSpreadsheetId,
            spreadsheet_url: url,
            updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
          },
        }).catch(() => {});
      }

      return {
        spreadsheetId: targetSpreadsheetId,
        spreadsheetUrl: url,
        isNew: false,
      };
    }

    // candidate가 휴지통에 들어갔으므로 DB 및 캐시를 비우고 신규 생성으로 진행
    boundRecord.spreadsheet_id = null;
    resolvedBindingCache.delete(bindingId);
  }

  // 3. 바인딩이 없거나 휴지통에 버려져 새로 탐색해야 하는 경우
  // 3-1. 1차: 지정된 폴더가 있다면 해당 폴더 내부 탐색
  if (!targetSpreadsheetId && folderId) {
    try {
      const folderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
      const searchRes = await listDriveFiles({ query: folderQuery }, { preferOAuth, ...callOptions });
      const foundFiles = searchRes?.files || [];
      if (foundFiles.length > 0) {
        targetSpreadsheetId = foundFiles[0].id;
      }
    } catch (searchErr: any) {
      console.warn(`[SheetBinding] Folder drive search warning for ${targetTitle}:`, searchErr.message);
    }
  }

  // 3-2. 2차: 폴더 내에서 못 찾았거나 폴더가 지정되지 않은 경우, 사용자 드라이브에서 동일 파일명 활성 시트 탐색
  if (!targetSpreadsheetId) {
    try {
      const globalQuery = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
      const searchRes = await listDriveFiles({ query: globalQuery }, { preferOAuth, ...callOptions });
      const foundFiles = searchRes?.files || [];
      if (foundFiles.length > 0) {
        // 가장 최근에 수정된 파일 선택
        targetSpreadsheetId = foundFiles[0].id;

        // 만약 지정 폴더가 있는데 루트 등 다른 곳에 있었다면 폴더로 이동
        if (folderId && targetSpreadsheetId) {
          await callDriveTool("drive_move", { fileId: targetSpreadsheetId, destFolderId: folderId, preferOAuth }, callOptions).catch(() => {});
        }

        // 만약 중복으로 생성된 여분의 동일 파일들이 있다면 2번째부터는 자동으로 휴지통 정리(Self-Healing)
        if (foundFiles.length > 1) {
          console.log(`[SheetBinding] Cleaning up ${foundFiles.length - 1} duplicate sheets for '${targetTitle}'...`);
          for (let i = 1; i < foundFiles.length; i++) {
            callDriveTool("drive_trash", { fileId: foundFiles[i].id, preferOAuth }, callOptions).catch(() => {});
          }
        }
      }
    } catch (searchErr: any) {
      console.warn(`[SheetBinding] Global drive search warning for ${targetTitle}:`, searchErr.message);
    }
  }

  // 4. 드라이브 전체에도 없으면 그때에만 최초 1회 신규 생성 (해당 사용자 개인 드라이브에 생성)
  if (!targetSpreadsheetId) {
    try {
      const createRes = await callSheetsTool(
        "sheets_create_spreadsheet",
        { title: targetTitle },
        { preferOAuth, ...callOptions }
      );
      targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;
      isNew = true;

      // 지정 폴더가 있으면 폴더로 이동
      if (targetSpreadsheetId && folderId) {
        await callDriveTool("drive_move", { fileId: targetSpreadsheetId, destFolderId: folderId, preferOAuth }, callOptions).catch(() => {});
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


/**
 * 사용자가 입력한 기존 구글 스프레드시트를 특정 sheetType의 연동 시트로 강제/명시적 영구 바인딩
 */
export async function bindExistingUserSpreadsheet(params: {
  userEmail: string;
  sheetType: SheetBindingType;
  spreadsheetId: string;
  spreadsheetUrl?: string;
  sheetTitle?: string;
}): Promise<void> {
  const cleanEmail = params.userEmail.trim().toLowerCase();
  const normalizedType = (params.sheetType || "").toUpperCase() as SheetBindingType;
  const bindingKey = `${cleanEmail}_${normalizedType}`;
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const url = params.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${params.spreadsheetId}/edit`;

  resolvedBindingCache.set(bindingKey, {
    result: {
      spreadsheetId: params.spreadsheetId,
      spreadsheetUrl: url,
      isNew: false,
    },
    timestamp: Date.now(),
  });

  try {
    const existing = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: normalizedType },
      limit: 1,
    }).catch(() => null);

    if (existing?.rows?.length > 0) {
      await updateRows("sheetbot_user_sheet_bindings", {
        filters: { user_email: cleanEmail, sheet_type: normalizedType },
        updates: {
          spreadsheet_id: params.spreadsheetId,
          spreadsheet_url: url,
          sheet_title: params.sheetTitle || existing.rows[0].sheet_title || "기존 연동 시트",
          updated_at: now,
        },
      });
    } else {
      await insertRows("sheetbot_user_sheet_bindings", [
        {
          id: Date.now(),
          user_email: cleanEmail,
          sheet_type: normalizedType,
          spreadsheet_id: params.spreadsheetId,
          spreadsheet_url: url,
          sheet_title: params.sheetTitle || "기존 연동 시트",
          created_at: now,
          updated_at: now,
        },
      ]);
    }
    console.log(`[SheetBinding] 🔗 Bound existing spreadsheet: ${params.spreadsheetId} for ${bindingKey}`);
  } catch (err: any) {
    console.warn(`[SheetBinding] Failed to bind existing spreadsheet to DB: ${err?.message}`);
  }
}
