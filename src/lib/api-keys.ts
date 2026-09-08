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
    apiKeyInfo: {
      id: row.id,
      userEmail: row.user_email,
      apiKey: row.api_key,
      name: row.name || "Default Agent Key",
      status: row.status,
      lastUsedAt: now,
      createdAt: row.created_at,
    },
  };
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
