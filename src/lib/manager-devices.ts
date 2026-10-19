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
 * x-manager-device-key 헤더 또는 x-sheetbot-user-email 헤더로 활성 매니저/Agent M 기기를 인증합니다.
 * 성공 시 last_seen_at / last_connected_at 을 갱신합니다. 실패 시 null.
 */
export async function authenticateManagerDevice(req: NextRequest): Promise<ManagerDevice | null> {
  const key = req.headers.get("x-manager-device-key")?.trim();
  const userEmail = req.headers.get("x-sheetbot-user-email")?.trim()?.toLowerCase();
  const deviceToken = req.headers.get("x-sheetbot-device-token")?.trim();

  const now = new Date().toISOString();

  // 1. sheetbot_manager_devices 테이블 조회 (독립 매니저 키가 있는 경우)
  if (key) {
    const res = await queryTable(MANAGER_DEVICES_TABLE, {
      filters: { device_key_hash: sha256(key), status: "ACTIVE" },
      limit: 1,
    }).catch(() => ({ rows: [] as any[] }));

    const row = (res.rows || [])[0];
    if (row && !row.deleted_at) {
      await updateRows(MANAGER_DEVICES_TABLE, {
        updates: { last_seen_at: now, updated_at: now, updated_by: "manager-agent" },
        filters: { id: String(row.id) },
      }).catch(() => {});
      return row as ManagerDevice;
    }
  }

  // 2. Agent M (sheetbot_user_devices) 연동 기기 인증 (이메일, 기기 토큰 또는 키)
  const candidateEmail = userEmail || (key && key.includes("@") ? key : "");
  if (candidateEmail || deviceToken || key) {
    const filters: Record<string, string> = { pairing_mode: "android_agent", status: "CONNECTED" };
    if (candidateEmail) {
      filters.user_email = candidateEmail;
    }
    const userRes = await queryTable("sheetbot_user_devices", {
      filters,
      limit: 10,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] as any[] }));

    const dev = (userRes.rows || []).find((r: any) => !r.deleted_at);
    if (dev) {
      await updateRows(
        "sheetbot_user_devices",
        {
          status: "CONNECTED",
          last_connected_at: now,
          updated_at: now,
        },
        { filters: { id: String(dev.id) } }
      ).catch(() => {});

      return {
        id: String(dev.id),
        label: dev.label || "Agent M",
        user_email: dev.user_email,
      } as ManagerDevice;
    }
  }

  return null;
}

/** 최근 폴링한 활성 매니저 기기 또는 Agent M 기기가 1대라도 있는지 */
export async function isAnyManagerOnline(): Promise<boolean> {
  const cutoff = Date.now() - MANAGER_ONLINE_WINDOW_MS;

  // 1. sheetbot_manager_devices 확인
  const res = await queryTable(MANAGER_DEVICES_TABLE, {
    filters: { status: "ACTIVE" },
    limit: 50,
  }).catch(() => ({ rows: [] as any[] }));

  const hasManager = (res.rows || []).some((r: any) => {
    if (r.deleted_at || !r.last_seen_at) return false;
    const t = Date.parse(r.last_seen_at);
    return Number.isFinite(t) && t >= cutoff;
  });
  if (hasManager) return true;

  // 2. sheetbot_user_devices 의 Agent M (입금 에이전트) 기기 확인
  // Agent M은 60초마다 heartbeat를 보내므로 150초(2.5분) 윈도우 적용
  const agentCutoff = Date.now() - 150 * 1000;
  const userRes = await queryTable("sheetbot_user_devices", {
    filters: { pairing_mode: "android_agent", status: "CONNECTED" },
    limit: 50,
    orderBy: "id",
    orderDirection: "DESC",
  }).catch(() => ({ rows: [] as any[] }));

  return (userRes.rows || []).some((r: any) => {
    if (r.deleted_at || !r.last_connected_at) return false;
    const timeStr = r.last_connected_at.includes("T") ? r.last_connected_at : r.last_connected_at.replace(" ", "T") + "Z";
    const t = Date.parse(timeStr);
    return Number.isFinite(t) && t >= agentCutoff;
  });
}
