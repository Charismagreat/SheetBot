import crypto from "crypto";
import { queryTable, insertRows, updateRows } from "./egdesk-helpers";
import { setupDatabase } from "./setup-db";

export interface UserApiKey {
  id: string;
  userEmail: string;
  apiKey: string;
  name: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt?: string | null;
  createdAt: string;
  visitorSessionId?: string | null;
}

/**
 * 안전한 고유 API 키 문자열 생성 (접두사 sk_sheetbot_ + 24바이트 hex)
 */
export function generateSecureApiKey(): string {
  const randomHex = crypto.randomBytes(24).toString("hex");
  return `sk_sheetbot_${randomHex}`;
}

/**
 * 회원의 활성 API 키를 조회하거나, 없으면 신규 발급하여 반환합니다.
 */
export async function getOrCreateUserApiKey(userEmail: string): Promise<UserApiKey> {
  await setupDatabase();
  const email = userEmail.toLowerCase().trim();

  // 기존 활성 키 조회 (최신순)
  const res = await queryTable("sheetbot_user_api_keys", {
    filters: { user_email: email, status: "ACTIVE" },
    orderBy: "id",
    orderDirection: "DESC",
    limit: 10,
  }).catch(() => ({ rows: [] }));

  const validRows = (res.rows || []).filter((r: any) => !r.deleted_at && r.status === "ACTIVE");

  if (validRows.length > 0) {
    const row = validRows[0];
    return {
      id: row.id,
      userEmail: row.user_email,
      apiKey: row.api_key,
      name: row.name || "Default Agent Key",
      status: row.status || "ACTIVE",
      lastUsedAt: row.last_used_at || null,
      createdAt: row.created_at || "",
      visitorSessionId: row.visitor_session_id || null,
    };
  }

  // 신규 API 키 자동 발급
  const now = new Date().toISOString();
  const keyId = `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const apiKey = generateSecureApiKey();

  const newRow = {
    id: keyId,
    uuid: crypto.randomUUID(),
    user_email: email,
    api_key: apiKey,
    name: "Default Agent Key",
    status: "ACTIVE",
    last_used_at: null,
    created_at: now,
    updated_at: now,
    updated_by: "system_auto_provision",
    deleted_at: null,
    deleted_by: null,
    restored_at: null,
    restored_by: null,
  };

  await insertRows("sheetbot_user_api_keys", [newRow]);

  return {
    id: keyId,
    userEmail: email,
    apiKey,
    name: "Default Agent Key",
    status: "ACTIVE",
    lastUsedAt: null,
    createdAt: now,
  };
}

/**
 * 전달받은 API 키의 유효성을 검증하고 소유자 이메일을 반환합니다.
 * 검증 성공 시 last_used_at 일시를 자동으로 갱신합니다.
 */
export async function verifyApiKey(apiKey: string): Promise<{
  valid: boolean;
  userEmail?: string;
  visitorSessionId?: string | null;
  apiKeyInfo?: UserApiKey;
  error?: string;
}> {
  if (!apiKey || !apiKey.trim()) {
    return { valid: false, error: "API 키가 제공되지 않았습니다." };
  }

  await setupDatabase();
  const trimmedKey = apiKey.trim();

  const res = await queryTable("sheetbot_user_api_keys", {
    filters: { api_key: trimmedKey },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  const row = (res.rows || [])[0];

  if (!row || row.deleted_at || row.status !== "ACTIVE") {
    return { valid: false, error: "유효하지 않거나 만료(해지)된 API 키입니다." };
  }

  // 1-1. 회원 마스터(sheetbot_users) 상태 검증: 탈퇴(WITHDRAWN) 또는 정지(SUSPENDED) 시 T=0초 즉시 차단
  let visitorSessionId = row.visitor_session_id || null;
  if (row.user_email) {
    try {
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: row.user_email.toLowerCase().trim() },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      const userRow = (userRes.rows || [])[0];
      if (userRow) {
        if (userRow.status === "WITHDRAWN" || userRow.status === "SUSPENDED" || userRow.deleted_at) {
          return {
            valid: false,
            error: "탈퇴하였거나 이용이 일시 정지된 회원 계정입니다. (API 호출 즉시 차단)",
          };
        }
        if (!visitorSessionId && userRow.visitor_session_id) {
          visitorSessionId = userRow.visitor_session_id;
        }
      }
    } catch (err: any) {
      console.warn("[VerifyApiKey] Check user status note:", err.message);
    }
  }

  const now = new Date().toISOString();

  // 최근 사용 일시 비동기 갱신
  updateRows(
    "sheetbot_user_api_keys",
    {
      last_used_at: now,
      updated_at: now,
      updated_by: "agent_auth",
    },
    { filters: { id: row.id } }
  ).catch((err) => console.warn("[VerifyApiKey] Update last_used_at warning:", err.message));

  return {
    valid: true,
    userEmail: row.user_email,
    visitorSessionId: visitorSessionId || null,
    apiKeyInfo: {
      id: row.id,
      userEmail: row.user_email,
      apiKey: row.api_key,
      name: row.name || "Default Agent Key",
      status: row.status,
      lastUsedAt: now,
      createdAt: row.created_at,
      visitorSessionId: visitorSessionId || null,
    },
  };
}

/**
 * 로그인 성공 시 해당 사용자의 활성 API 키 대장에 최신 방문자 세션 ID를 동기화합니다.
 */
export async function syncVisitorSessionToUser(userEmail: string, visitorSessionId: string): Promise<void> {
  if (!userEmail || !visitorSessionId) return;
  try {
    await setupDatabase();
    const email = userEmail.toLowerCase().trim();
    const now = new Date().toISOString();

    // 1. sheetbot_users 갱신 (Primary Key id 기반 정확한 업데이트)
    const userRes = await queryTable("sheetbot_users", {
      filters: { email },
      limit: 1,
    }).catch(() => ({ rows: [] }));
    const userRow = (userRes.rows || []).find((r: any) => !r.deleted_at);

    if (userRow) {
      await updateRows(
        "sheetbot_users",
        {
          visitor_session_id: visitorSessionId,
          last_login_at: now,
          updated_at: now,
        },
        { filters: { id: String(userRow.id) } }
      ).catch(() => null);
    }

    // 2. 활성 sheetbot_user_api_keys 일괄 갱신
    const keyRes = await queryTable("sheetbot_user_api_keys", {
      filters: { user_email: email, status: "ACTIVE" },
      limit: 20,
    }).catch(() => ({ rows: [] }));

    const activeKeys = (keyRes.rows || []).filter((r: any) => !r.deleted_at);
    for (const k of activeKeys) {
      await updateRows(
        "sheetbot_user_api_keys",
        {
          visitor_session_id: visitorSessionId,
          updated_at: now,
        },
        { filters: { id: k.id } }
      ).catch(() => null);
    }
  } catch (err: any) {
    console.warn("[SyncVisitorSession] Error:", err.message);
  }
}

/**
 * 회원의 기존 API 키를 해지(REVOKED)하고 새 API 키를 재발급합니다.
 */
export async function regenerateUserApiKey(userEmail: string, keyName = "Default Agent Key"): Promise<UserApiKey> {
  await setupDatabase();
  const email = userEmail.toLowerCase().trim();
  const now = new Date().toISOString();

  // 1. 기존 키 REVOKED 및 소프트 삭제 처리
  const existingRes = await queryTable("sheetbot_user_api_keys", {
    filters: { user_email: email },
    limit: 50,
  }).catch(() => ({ rows: [] }));

  const activeExisting = (existingRes.rows || []).filter((r: any) => !r.deleted_at && r.status === "ACTIVE");

  for (const existing of activeExisting) {
    await updateRows(
      "sheetbot_user_api_keys",
      {
        status: "REVOKED",
        deleted_at: now,
        deleted_by: email,
        updated_at: now,
        updated_by: email,
      },
      { filters: { id: existing.id } }
    ).catch(() => null);
  }

  // 2. 신규 API 키 생성
  const keyId = `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const apiKey = generateSecureApiKey();

  const newRow = {
    id: keyId,
    uuid: crypto.randomUUID(),
    user_email: email,
    api_key: apiKey,
    name: keyName,
    status: "ACTIVE",
    last_used_at: null,
    created_at: now,
    updated_at: now,
    updated_by: email,
    deleted_at: null,
    deleted_by: null,
    restored_at: null,
    restored_by: null,
  };

  await insertRows("sheetbot_user_api_keys", [newRow]);

  return {
    id: keyId,
    userEmail: email,
    apiKey,
    name: keyName,
    status: "ACTIVE",
    lastUsedAt: null,
    createdAt: now,
  };
}

/**
 * 회원 탈퇴 시 해당 계정의 모든 활성 API 키를 T=0초에 즉시 영구 폐기(REVOKED 및 소프트 삭제)합니다.
 * (Global Kill-Switch)
 */
export async function revokeAllUserApiKeys(userEmail: string): Promise<number> {
  await setupDatabase();
  const email = userEmail.toLowerCase().trim();
  const now = new Date().toISOString();

  const existingRes = await queryTable("sheetbot_user_api_keys", {
    filters: { user_email: email },
    limit: 100,
  }).catch(() => ({ rows: [] }));

  const activeExisting = (existingRes.rows || []).filter((r: any) => !r.deleted_at || r.status === "ACTIVE");
  let revokedCount = 0;

  for (const keyRow of activeExisting) {
    await updateRows(
      "sheetbot_user_api_keys",
      {
        status: "REVOKED",
        deleted_at: now,
        deleted_by: email,
        updated_at: now,
        updated_by: "withdraw_killswitch",
      },
      { filters: { id: keyRow.id } }
    ).catch(() => null);
    revokedCount++;
  }

  return revokedCount;
}

