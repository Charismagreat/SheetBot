import { NextRequest } from "next/server";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";

export const MANAGER_DEVICES_TABLE = "sheetbot_manager_devices";

/** 매니저 앱이 발송할 수 있는 인증번호 SMS 용도 (그 외 용도는 브릿지에서 거부) */
export const ALLOWED_SMS_PURPOSES = ["send-code", "emergency-recovery", "transfer-account"] as const;
export type SmsPurpose = (typeof ALLOWED_SMS_PURPOSES)[number];

export const PAIR_TOKEN_TTL_MS = 10 * 60 * 1000;
/** last_seen_at 이 이 시간 이내이면 '온라인'으로 판단 (장폴링 25초 + 버퍼 기준) */
export const MANAGER_ONLINE_WINDOW_MS = 120 * 1000;
/** Agent M은 2분 DB 하트비트 + 장폴링을 유지하므로 5분 윈도우 적용 */
export const AGENT_M_ONLINE_WINDOW_MS = 300 * 1000;
/** 인증번호는 수명이 짧으므로 대기/처리 중 이 시간을 넘기면 만료 처리 */
export const SMS_JOB_EXPIRY_MS = 3 * 60 * 1000;

const AUTH_CACHE_TTL_MS = 60 * 1000;
const LAST_SEEN_DB_FLUSH_INTERVAL_MS = 60 * 1000;
const SMS_QUEUE_SAFETY_RECHECK_MS = 120 * 1000;

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

interface CachedAuthEntry {
  device: ManagerDevice;
  table: "manager" | "agent_m";
  cachedAt: number;
}

interface ManagerRuntimeState {
  authCache: Map<string, CachedAuthEntry>;
  lastSeenMs: Map<string, number>;
  lastDbFlushMs: Map<string, number>;
  activePollers: Map<string, number>;
  smsEmitter: EventEmitter;
  hasPendingSmsJob: boolean;
  lastSmsDbCheckMs: number;
}

const g = globalThis as typeof globalThis & { __sheetbotManagerRuntime?: ManagerRuntimeState };

function getRuntime(): ManagerRuntimeState {
  if (!g.__sheetbotManagerRuntime) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    g.__sheetbotManagerRuntime = {
      authCache: new Map(),
      lastSeenMs: new Map(),
      lastDbFlushMs: new Map(),
      activePollers: new Map(),
      smsEmitter: emitter,
      hasPendingSmsJob: true, // 부팅 후 최초 1회는 DB 점검
      lastSmsDbCheckMs: 0,
    };
  }
  return g.__sheetbotManagerRuntime;
}

/** 기기 폐기(DELETE) 시 메모리 인증 캐시 즉시 무효화 */
export function invalidateManagerDeviceCache(deviceId?: string): void {
  const rt = getRuntime();
  if (!deviceId) {
    rt.authCache.clear();
    return;
  }
  for (const [k, entry] of rt.authCache.entries()) {
    if (String(entry.device.id) === String(deviceId)) {
      rt.authCache.delete(k);
    }
  }
  rt.lastSeenMs.delete(String(deviceId));
  rt.lastDbFlushMs.delete(String(deviceId));
  rt.activePollers.delete(String(deviceId));
}

/** 하트비트·폴링 수신 시 메모리 온라인 타임스탬프 즉시 갱신 */
export function touchManagerDeviceSeen(deviceId: string): void {
  getRuntime().lastSeenMs.set(String(deviceId), Date.now());
}

/** 현재 장폴링 대기 중인 매니저 기기 등록/해제 */
export function setManagerPollerActive(deviceId: string, active: boolean): void {
  const rt = getRuntime();
  const key = String(deviceId);
  const current = rt.activePollers.get(key) || 0;
  if (active) {
    rt.activePollers.set(key, current + 1);
    rt.lastSeenMs.set(key, Date.now());
  } else if (current <= 1) {
    rt.activePollers.delete(key);
  } else {
    rt.activePollers.set(key, current - 1);
  }
}

/** DB 타임스탬프와 메모리 타임스탬프 중 최신 시각 반환 */
export function getEffectiveLastSeenMs(deviceId: string, dbIso?: string | null): number {
  const rt = getRuntime();
  const memSeen = rt.lastSeenMs.get(String(deviceId)) || 0;
  const isPollingNow = (rt.activePollers.get(String(deviceId)) || 0) > 0;
  if (isPollingNow) return Date.now();

  let dbSeen = 0;
  if (dbIso) {
    const normalized = dbIso.includes("T") ? dbIso : dbIso.replace(" ", "T") + "Z";
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) dbSeen = parsed;
  }
  return Math.max(memSeen, dbSeen);
}

/** 신규 인증번호 SMS 작업이 큐에 적재되었음을 대기 중인 모든 장폴링 커넥션에 즉시 알림 (<10ms) */
export function notifySmsQueueJobAdded(): void {
  const rt = getRuntime();
  rt.hasPendingSmsJob = true;
  rt.smsEmitter.emit("job");
}

/** DB 조회 결과 대기 중인 SMS 작업이 0건일 때 idle 상태로 전환 (불필요한 DB 조회 차단) */
export function markSmsQueueEmpty(): void {
  const rt = getRuntime();
  rt.hasPendingSmsJob = false;
  rt.lastSmsDbCheckMs = Date.now();
}

/** 지금 DB에서 PENDING 큐를 조회해야 하는지 판단 */
export function shouldCheckSmsQueueDb(): boolean {
  const rt = getRuntime();
  if (rt.hasPendingSmsJob) return true;
  return Date.now() - rt.lastSmsDbCheckMs >= SMS_QUEUE_SAFETY_RECHECK_MS;
}

/**
 * 대기 중인 SMS 작업이 생길 때까지 메모리 이벤트로 대기 (대기 중 SQLite 쿼리 0건)
 * @returns true = 신규 작업 도착 또는 안전 재점검 필요, false = 타임아웃 또는 클라이언트 연결 종료
 */
export function waitForSmsQueueJob(waitMs: number, signal?: AbortSignal): Promise<boolean> {
  if (waitMs <= 0 || signal?.aborted) return Promise.resolve(false);
  if (shouldCheckSmsQueueDb()) return Promise.resolve(true);

  const rt = getRuntime();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (woke: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rt.smsEmitter.off("job", onJob);
      signal?.removeEventListener("abort", onAbort);
      resolve(woke);
    };

    const onJob = () => finish(true);
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), waitMs);

    rt.smsEmitter.once("job", onJob);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function maybeFlushLastSeenToDb(deviceId: string, table: "manager" | "agent_m"): void {
  const rt = getRuntime();
  const nowMs = Date.now();
  const key = String(deviceId);
  rt.lastSeenMs.set(key, nowMs);

  const prevFlush = rt.lastDbFlushMs.get(key) || 0;
  if (nowMs - prevFlush < LAST_SEEN_DB_FLUSH_INTERVAL_MS) {
    return;
  }
  rt.lastDbFlushMs.set(key, nowMs);

  const nowIso = new Date(nowMs).toISOString();
  if (table === "manager") {
    void updateRows(MANAGER_DEVICES_TABLE, {
      updates: { last_seen_at: nowIso, updated_at: nowIso, updated_by: "manager-agent" },
      filters: { id: key },
    }).catch(() => {});
  } else {
    void updateRows(
      "sheetbot_user_devices",
      {
        status: "CONNECTED",
        last_connected_at: nowIso,
        updated_at: nowIso,
      },
      { filters: { id: key } }
    ).catch(() => {});
  }
}

/**
 * x-manager-device-key 헤더 또는 x-sheetbot-user-email 헤더로 활성 매니저/Agent M 기기를 인증합니다.
 * - 60초 메모리 인증 캐시 + 60초 단위 SQLite last_seen_at 쓰기 쓰로틀링으로 유휴 DB 쓰기를 90%+ 절감합니다.
 */
export async function authenticateManagerDevice(req: NextRequest): Promise<ManagerDevice | null> {
  const key = req.headers.get("x-manager-device-key")?.trim();
  const userEmail = req.headers.get("x-sheetbot-user-email")?.trim()?.toLowerCase();
  const deviceToken = req.headers.get("x-sheetbot-device-token")?.trim();

  const rt = getRuntime();
  const nowMs = Date.now();

  const cacheKey = key
    ? `key:${sha256(key)}`
    : userEmail
    ? `email:${userEmail}`
    : deviceToken
    ? `tok:${sha256(deviceToken)}`
    : "";

  if (cacheKey) {
    const cached = rt.authCache.get(cacheKey);
    if (cached && nowMs - cached.cachedAt < AUTH_CACHE_TTL_MS) {
      maybeFlushLastSeenToDb(cached.device.id, cached.table);
      return cached.device;
    }
  }

  // 1. sheetbot_manager_devices 테이블 조회 (독립 매니저 키가 있는 경우)
  if (key) {
    const res = await queryTable(MANAGER_DEVICES_TABLE, {
      filters: { device_key_hash: sha256(key), status: "ACTIVE" },
      limit: 1,
    }).catch(() => ({ rows: [] as any[] }));

    const row = (res.rows || [])[0];
    if (row && !row.deleted_at) {
      const dev = row as ManagerDevice;
      if (cacheKey) {
        rt.authCache.set(cacheKey, { device: dev, table: "manager", cachedAt: nowMs });
      }
      maybeFlushLastSeenToDb(dev.id, "manager");
      return dev;
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
      const managerDev: ManagerDevice = {
        id: String(dev.id),
        label: dev.label || "Agent M",
        user_email: dev.user_email,
      };
      if (cacheKey) {
        rt.authCache.set(cacheKey, { device: managerDev, table: "agent_m", cachedAt: nowMs });
      }
      maybeFlushLastSeenToDb(managerDev.id, "agent_m");
      return managerDev;
    }
  }

  return null;
}

/** 최근 폴링/하트비트한 활성 매니저 기기 또는 Agent M 기기가 1대라도 있는지 (메모리 우선 확인) */
export async function isAnyManagerOnline(): Promise<boolean> {
  const rt = getRuntime();
  const nowMs = Date.now();

  // 0. 현재 장폴링 대기 중이거나 최근 2분 이내 메모리에서 확인된 활성 기기가 있으면 DB 조회 없이 즉시 true
  if (rt.activePollers.size > 0) return true;
  for (const ts of rt.lastSeenMs.values()) {
    if (nowMs - ts <= MANAGER_ONLINE_WINDOW_MS) {
      return true;
    }
  }

  const cutoff = nowMs - MANAGER_ONLINE_WINDOW_MS;

  // 1. sheetbot_manager_devices 확인
  const res = await queryTable(MANAGER_DEVICES_TABLE, {
    filters: { status: "ACTIVE" },
    limit: 50,
  }).catch(() => ({ rows: [] as any[] }));

  const hasManager = (res.rows || []).some((r: any) => {
    if (r.deleted_at || !r.last_seen_at) return false;
    const t = getEffectiveLastSeenMs(String(r.id), r.last_seen_at);
    return t >= cutoff;
  });
  if (hasManager) return true;

  // 2. sheetbot_user_devices 의 Agent M (입금 에이전트) 기기 확인
  const agentCutoff = nowMs - AGENT_M_ONLINE_WINDOW_MS;
  const userRes = await queryTable("sheetbot_user_devices", {
    filters: { pairing_mode: "android_agent", status: "CONNECTED" },
    limit: 50,
    orderBy: "id",
    orderDirection: "DESC",
  }).catch(() => ({ rows: [] as any[] }));

  return (userRes.rows || []).some((r: any) => {
    if (r.deleted_at || !r.last_connected_at) return false;
    const t = getEffectiveLastSeenMs(String(r.id), r.last_connected_at);
    return t >= agentCutoff;
  });
}
