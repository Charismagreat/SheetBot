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
import { getWorkspaceCallOptionsForEmail, HOST_WORKSPACE_OWNER_EMAIL } from "@/lib/auth";

/**
 * 호스트 소유자(chachogreat@gmail.com) 개인 드라이브의 스프레드시트/폴더 ID 목록
 * - 타 회원 계정에서 이 ID들이 바인딩되어 있거나 참조될 경우 즉시 차단 및 무효화합니다.
 */
export const HOST_KNOWN_SHEET_IDS = new Set<string>([
  "1L4fvWI_xx79DP_SUygJD203uTV6Vhr16JXYSpMR8IY8", // RECEIPT
  "10Rq89Hfb-7V_ETG9rzYtvZUb4JX2k5xjx-1d4-Ctomk", // LINK_BOOKMARK
  "1uI2fLTtEILvJpYn0UJzN9pPLiyWJ2oADeM4kSfQCBEc", // FILE_UPLOAD
  "1ow6qMJ3b73RSR1azhIbTSAKdwFmKTe43N2kbB-VwLOg", // RECEIPT (alt)
  "196xly_ZhwS2PILpZYBBsjW9VD3_F6PQddBnLkDwfBaY", // CALL_ENDED_CARD
  "1XCQMxao3uIhbXGh5kYlnXE5g9vH5mFBQ0cohJGyMl1U", // QUOTE
  "1M2lKmdAM8BvcOMrNJYH_ev5ob7ie78cHDWEmqt1ozv0", // PAYMENT_PUSH
  "1EV0kjAUFhzk1B0FMMsRfCkZaAVAoZlYs9CINglirFGw", // BUSINESS_CARD
  "1bHtvSdmqfHJ-1WkgPv9hMlaUjqbMxEBnkHQpk1kIiOQ", // RECORDING
  "1aZ2kFDa-Cs8ypi15hJbntOLb7PScSOwYuUwWMFwt-0s", // SMS
  "1PZLzNoyPtt8wWIzuDKdgg5SjCLBjVoBWjxZC2Zg-jIE", // MISSED_CALL
  "1INh4k7BgtgR8rkl1Pluwguq2y-0XKCn7m6ajfS04k6A", // KAKAO
  "1QPJglgZhhsxVFtOgrRv06aDNfmjtxWc9qgIbpdJHh3k", // WEBSITE_MONITOR
  "1Tnwn722JJYb2jlXbZnLfN4UszYTg9TIa2j0GC2vpVe8", // CONTACTS
  "1SJrrqwmrNUk_5oiBMRyA-6rhD2KrnP98CY6JdBAKyMI", // DISPATCH_LOG
  "1vbJvJZtWGW4lik-Tn0i6QpJXmB3ovj0uy9SXCpQfalQ", // RECEIPT_SMS (shared fallback)
  "18Zj-txo8wSLz-aRRU_BYlA9FJdu3ZoW_fgtOnBals50", // KAKAO (shared fallback)
  "11Hua4qg4fX-J9CRmh1fLNJFcTGLXV8zpD0PX2vTdiNw", // ESTIMATE (shared fallback)
  "1HDffS1wt8f9lVHNQ64GOX7SJFQ8FZFAzZCpdr2jNgTQ", // MOBILE_SITE (shared fallback)
]);

export const HOST_KNOWN_FOLDER_IDS = new Set<string>([
  "16wL2XZI_oggTKJlK9Yztkg8iCUq3Ixqa",
  "11ClndqwCR-ajOcBYlkCU_pFC4Nwf47AL",
  "1wWgrOLN58BrwOQpQhqrxshJNs0_8ajaM",
  "14TuBcWsooWB7_yPqyn6L0imjshpVxFVX",
  "1Of-WsCAIYyxx7w0SgxeOLS5rMl0L4QkX",
]);

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
  | "SHEET_SMS_CHECKBOX"
  | "SAAS_OTP_RELAY";

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
        folder_id: null,
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
      if (
        cleanEmail !== HOST_WORKSPACE_OWNER_EMAIL &&
        HOST_KNOWN_SHEET_IDS.has(memoryCached.result.spreadsheetId)
      ) {
        resolvedBindingCache.delete(bindingKey);
      } else {
        return memoryCached.result;
      }
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

const DEFAULT_SHEET_TITLES: Record<string, string> = {
  SMS: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
  KAKAO: "[SheetBot] 카카오톡 메시지 대장",
  MISSED_CALL: "[SheetBot] 부재중 전화 대장",
  RECORDING: "[SheetBot] 통화 녹음 대장",
  CALL_RECORDING: "[SheetBot] 통화 녹음 대장",
  MEETING: "[SheetBot] 스마트 회의록 대장",
  COMPANY_RESEARCH: "[SheetBot] AI 기업심층조사 대장",
  LAW_ADVISORY: "[SheetBot] AI 법률·계약 자문 대장",
  NAVER_BLOG: "[SheetBot] AI 네이버 블로그 발행 대장",
  INSTAGRAM: "[SheetBot] AI 인스타그램 발행 대장",
  MOBILE_SITE: "[SheetBot] AI 모바일 홈페이지 대장",
  FILE_UPLOAD: "[SheetBot] 파일 업로드 대장",
  RECEIPT: "[SheetBot] 스마트 경비 영수증 대장",
  BUSINESS_CARD: "[SheetBot] 스마트 명함 관리 대장",
  LINK_BOOKMARK: "[SheetBot] 웹 링크 & 유튜브 스크랩 대장",
  CALL_ENDED_CARD: "[SheetBot] 모바일 명함 발송 대장",
  PAYMENT_PUSH: "[SheetBot] 매장 결제 및 매출 대장",
  RECEIPT_SMS: "[SheetBot] 고객 영수증 문자 발송 대장",
  WEBSITE_MONITOR: "[SheetBot] 웹사이트 모니터링 & 장애 대장",
  DISPATCH_LOG: "[SheetBot] 고객 알림 발송 및 수신 대장",
  QUOTE: "[SheetBot] 스마트 간편 주문 및 품목 대장",
  ESTIMATE: "[SheetBot] 스마트 간편 견적 및 단가 대장",
  CONTACTS: "[SheetBot] 스마트폰 연락처 대장",
  SHEET_SMS_CHECKBOX: "[SheetBot] 체크박스 문자 발송 대장",
};

async function doResolveUserSpreadsheet(
  options: ResolveSheetOptions
): Promise<ResolveSheetResult> {
  const {
    userEmail,
    sheetType,
    defaultTitle,
    requestedTitle,
    folderId: rawFolderId,
    preferOAuth = true,
  } = options;

  const cleanEmail = userEmail.trim().toLowerCase();
  const isHostOwner = cleanEmail === HOST_WORKSPACE_OWNER_EMAIL;
  const normalizedType = (sheetType || "").toUpperCase() as SheetBindingType;
  const bindingId = `${cleanEmail}_${normalizedType}`;
  const targetTitle =
    (requestedTitle && requestedTitle.trim().length > 0 ? requestedTitle.trim() : null) ||
    (defaultTitle && defaultTitle.trim().length > 0 ? defaultTitle.trim() : null) ||
    DEFAULT_SHEET_TITLES[normalizedType] ||
    `[SheetBot] ${normalizedType} 대장`;

  const folderId =
    !isHostOwner && rawFolderId && HOST_KNOWN_FOLDER_IDS.has(rawFolderId)
      ? null
      : rawFolderId;

  // 1. My DB에서 기존 영구 바인딩된 고유 spreadsheetId 확인 (지연 초기화 적용)
  let boundRecord: any = null;
  try {
    const queryRes = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: normalizedType },
      limit: 5,
      orderBy: "id",
      orderDirection: "DESC",
    });
    const activeRows = (queryRes?.rows || []).filter((r: any) => !r.deleted_at);
    if (activeRows.length > 0) {
      boundRecord = activeRows[0];
    }
  } catch (err: any) {
    if (String(err?.message || "").includes("not found")) {
      // 테이블이 아직 없으면 단 1회 셋업 실행
      await setupDatabase().catch(() => {});
    } else {
      console.warn(`[SheetBinding] Failed to query bindings for ${bindingId}:`, err.message);
    }
  }

  // [멀티테넌트 격리 가드] 일반 회원인데 호스트 소유자(chachogreat)의 시트/폴더가 오염 바인딩되어 있으면 즉시 파기
  if (
    !isHostOwner &&
    boundRecord &&
    ((boundRecord.spreadsheet_id && HOST_KNOWN_SHEET_IDS.has(String(boundRecord.spreadsheet_id))) ||
      (boundRecord.folder_id && HOST_KNOWN_FOLDER_IDS.has(String(boundRecord.folder_id))))
  ) {
    console.warn(
      `[SheetBinding] 🛡️ Cross-tenant polluted binding detected for ${cleanEmail} (${normalizedType}: ${boundRecord.spreadsheet_id}). Invalidating immediately!`
    );
    await invalidateUserSheetBinding(cleanEmail, normalizedType);
    boundRecord.spreadsheet_id = null;
    boundRecord.spreadsheet_url = null;
    boundRecord.folder_id = null;
  }

  // 1-1. 사용자별 구글 OAuth/Visitor 세션 옵션 확정 (멀티테넌시 완벽 격리)
  const callOptions = options.callOptions || (await getWorkspaceCallOptionsForEmail(cleanEmail));

  // [멀티테넌트 격리 가드] 일반 회원이 유효한 방문자 Google OAuth 세션(visitorSessionId)이 없으면 호스트 드라이브 접근 원천 차단
  if (!isHostOwner && (!callOptions?.asVisitor || !callOptions?.visitorSessionId?.trim())) {
    throw new Error(
      `[GOOGLE_OAUTH_REQUIRED] 본인 구글 드라이브에 시트를 생성하거나 접근하려면 Google 권한 동의가 필요합니다. 앱 또는 웹에서 [Google 계정 연동]을 완료해 주세요. (${cleanEmail})`
    );
  }

  let targetSpreadsheetId: string | null = null;
  let isNew = false;

  // 2. 바인딩된 고유 ID가 있으면 구글 드라이브에서 실제 파일의 활성(휴지통 제외) 상태 검증
  if (boundRecord?.spreadsheet_id) {
    const candidateId = boundRecord.spreadsheet_id;
    try {
      // 2-0. [우선 검증] candidateId 파일이 드라이브에 직접 존재하고 활성 상태(휴지통 제외)인지 확인 (맞춤 제목/기존 연동 시트 보존)
      let directFile: any = null;
      let directFileNotFound = false;
      try {
        directFile = await getDriveFile(candidateId, { preferOAuth, ...callOptions });
      } catch (fileErr: any) {
        const msg = String(fileErr?.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("404")) {
          directFileNotFound = true;
        } else {
          throw fileErr;
        }
      }

      if (directFile && directFile.id === candidateId && !directFile.trashed) {
        targetSpreadsheetId = candidateId;
      } else if (directFile?.trashed || directFileNotFound) {
        // candidateId 파일이 실제로 삭제(404)되었거나 휴지통(trashed=true)에 들어간 경우에만 동일 제목 대체 파일 탐색
        let activeFiles: any[] = [];
        if (folderId) {
          const folderQuery = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
          const folderRes = await listDriveFiles({ query: folderQuery }, { preferOAuth, ...callOptions });
          activeFiles = folderRes?.files || [];
        }
        if (activeFiles.length === 0) {
          const globalQuery = `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${targetTitle}' and trashed = false`;
          const globalRes = await listDriveFiles({ query: globalQuery }, { preferOAuth, ...callOptions });
          activeFiles = globalRes?.files || [];
        }

        if (activeFiles.length > 0) {
          console.log(`[SheetBinding] 🔄 Candidate sheet ${candidateId} was trashed/superseded. Auto-rebinding to active sheet ${activeFiles[0].id} for '${targetTitle}'...`);
          targetSpreadsheetId = activeFiles[0].id;
        } else {
          console.warn(`[SheetBinding] ⚠️ Sheet ${candidateId} was TRASHED by user! Invalidating stale binding to trigger fresh creation...`);
          targetSpreadsheetId = null;
        }
      } else {
        targetSpreadsheetId = candidateId;
      }
    } catch (checkErr: any) {
      console.warn(`[SheetBinding] Active check warning for ${targetTitle} (preserving bound sheet ${candidateId}):`, checkErr?.message);
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
