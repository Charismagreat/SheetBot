import { NextRequest } from "next/server";
import * as crypto from "crypto";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";

export const MANAGER_DEVICES_TABLE = "sheetbot_manager_devices";

/** 매니저 앱이 발송할 수 있는 인증번호 SMS 용도 (그 외 용도는 브릿지에서 거부) */
export const ALLOWED_SMS_PURPOSES = ["send-code", "emergency-recovery", "transfer-account"] as const;
export type SmsPurpose = (typeof ALLOWED_SMS_PURPOSES)[number];

export const PAIR_TOKEN_TTL_MS = 10 * 60 * 1000;
/** last_seen_at 이 이 시간 이내이면 '온라인'으로 판단 (앱 폴링 주기 5초 기준) */
export const MANAGER_ONLINE_WINDOW_MS = 60 * 1000;
/** 인증번호는 수명이 짧으므로 대기/처리 중 이 시간을 넘기면 만료 처리 */
export const SMS_JOB_EXPIRY_MS = 3 * 60 * 1000;

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function publicBaseUrl(): string {
  return (process.env.SHEETBOT_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://sheetbot.cloud").replace(/\/+$/, "");
}

export interface ManagerDevice {
  id: string;
  label: string;
  [key: string]: any;
}

/**
 * x-manager-device-key 헤더로 활성(ACTIVE) 매니저 기기를 인증합니다.
 * 성공 시 last_seen_at 을 갱신합니다. 실패 시 null.
 */
export async function authenticateManagerDevice(req: NextRequest): Promise<ManagerDevice | null> {
  const key = req.headers.get("x-manager-device-key")?.trim();
  if (!key) return null;

  const res = await queryTable(MANAGER_DEVICES_TABLE, {
    filters: { device_key_hash: sha256(key), status: "ACTIVE" },
    limit: 1,
  }).catch(() => ({ rows: [] as any[] }));

  const row = (res.rows || [])[0];
  if (!row || row.deleted_at) return null;

  const now = new Date().toISOString();
  await updateRows(MANAGER_DEVICES_TABLE, {
    updates: { last_seen_at: now, updated_at: now, updated_by: "manager-agent" },
    filters: { id: String(row.id) },
  }).catch(() => {});

  return row as ManagerDevice;
}

/** 최근 폴링한 활성 매니저 기기가 1대라도 있는지 */
export async function isAnyManagerOnline(): Promise<boolean> {
  const res = await queryTable(MANAGER_DEVICES_TABLE, {
    filters: { status: "ACTIVE" },
    limit: 50,
  }).catch(() => ({ rows: [] as any[] }));
  const cutoff = Date.now() - MANAGER_ONLINE_WINDOW_MS;
  return (res.rows || []).some((r: any) => {
    if (r.deleted_at || !r.last_seen_at) return false;
    const t = Date.parse(r.last_seen_at);
    return Number.isFinite(t) && t >= cutoff;
  });
}
