import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { EventEmitter } from "events";

export interface KakaoPcAgentStatus {
  userEmail: string;
  pairingCode: string;
  pcName: string;
  kakaoReady: boolean;
  kakaoDetail?: string;
  lastSeenAt: number;
  version?: string;
}

export interface KakaoPcDispatchJob {
  jobId: string;
  userEmail: string;
  aliasEmails?: string[];
  roomName: string;
  recipientName: string;
  message: string;
  status: "PENDING" | "CLAIMED" | "SENT" | "FAILED";
  confirmed?: boolean;
  alreadyOpen?: boolean;
  draftPresent?: boolean;
  error?: string;
  pcName?: string;
  createdAt: number;
  updatedAt: number;
}

interface RelayStoreData {
  agentsByEmail: Record<string, KakaoPcAgentStatus>;
  emailByPairingCode: Record<string, string>;
  emailByPhone: Record<string, string>;
  jobsById: Record<string, KakaoPcDispatchJob>;
}

interface GlobalRelayRuntime {
  emitter: EventEmitter;
  data: RelayStoreData;
  loaded: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __sheetbotKakaoPcRelayRuntime: GlobalRelayRuntime | undefined;
}

const STORE_FILE_PATH = path.join(os.homedir(), ".egdesk", "sheetbot-kakao-pc-relay.json");
const AGENT_ONLINE_TTL_MS = 45_000; // 45초 이내 하트비트/폴링 수신 시 온라인 판정
const JOB_RETENTION_MS = 30 * 60 * 1000; // 30분 지난 완료 작업 자동 정리

function getRuntime(): GlobalRelayRuntime {
  if (!globalThis.__sheetbotKakaoPcRelayRuntime) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalThis.__sheetbotKakaoPcRelayRuntime = {
      emitter,
      data: {
        agentsByEmail: {},
        emailByPairingCode: {},
        emailByPhone: {},
        jobsById: {},
      },
      loaded: false,
    };
  }
  const rt = globalThis.__sheetbotKakaoPcRelayRuntime;
  if (!rt.loaded) {
    loadFromDisk(rt);
    rt.loaded = true;
  }
  return rt;
}

function loadFromDisk(rt: GlobalRelayRuntime) {
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ STORE_FILE_PATH)) {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ STORE_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        rt.data.agentsByEmail = parsed.agentsByEmail || {};
        rt.data.emailByPairingCode = parsed.emailByPairingCode || {};
        rt.data.emailByPhone = parsed.emailByPhone || {};
        rt.data.jobsById = parsed.jobsById || {};
      }
    }
  } catch (e) {
    console.warn("[KakaoPcRelay] Failed to load relay store:", e);
  }
}

/**
 * 파투(FileToSheet) 휴대폰 번호(010-XXXX-XXXX) 또는 가상 이메일(010XXXXXXXX@fts.local, @filetosheet.cloud)과
 * 구글 이메일을 단일 표준 키로 정규화합니다.
 */
export function normalizeRelayUserIdentifier(rawEmailOrPhone: string, rawPhone?: string): string {
  const rt = getRuntime();
  const cleanPhoneParam = (rawPhone || "").replace(/[^0-9]/g, "");
  const input = (rawEmailOrPhone || "").toLowerCase().trim();

  // 1. 휴대폰 번호 기반 가상 이메일(@fts.local, @filetosheet.cloud)은 모두 <번호>@fts.local로 통일
  const ftsEmailMatch = input.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/);
  if (ftsEmailMatch) {
    const phoneDigits = ftsEmailMatch[1];
    // 만약 해당 휴대폰 번호가 이미 실제 구글 이메일과 매핑되어 있다면 매핑된 계정을 반환
    if (rt.data.emailByPhone[phoneDigits]) {
      return rt.data.emailByPhone[phoneDigits];
    }
    return `${phoneDigits}@fts.local`;
  }

  // 2. 일반 구글 이메일인 경우: 함께 전달된 파투 휴대폰 번호가 있으면 양방향 매핑 등록
  if (input.includes("@")) {
    if (cleanPhoneParam.length >= 9 && rt.data.emailByPhone[cleanPhoneParam] !== input) {
      rt.data.emailByPhone[cleanPhoneParam] = input;
      // 휴대폰 번호 기반 페어링 코드도 함께 등록
      const phoneFtsId = `${cleanPhoneParam}@fts.local`;
      const phoneCode = crypto
        .createHash("sha256")
        .update(`sheetbot-kakao-bridge:${phoneFtsId}`)
        .digest("hex")
        .toUpperCase()
        .slice(0, 6);
      rt.data.emailByPairingCode[phoneCode] = input;
      saveToDisk(rt);
    }
    return input;
  }

  // 3. 이메일 없이 휴대폰 번호(예: 010-1234-5678 또는 01012345678)만 입력한 파투 이용자
  const digitsOnly = input.replace(/[^0-9]/g, "") || cleanPhoneParam;
  if (digitsOnly.length >= 9 && digitsOnly.startsWith("01")) {
    if (rt.data.emailByPhone[digitsOnly]) {
      return rt.data.emailByPhone[digitsOnly];
    }
    return `${digitsOnly}@fts.local`;
  }

  return input;
}

function saveToDisk(rt: GlobalRelayRuntime) {
  try {
    const dir = path.dirname(STORE_FILE_PATH);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
    // 오래된 작업 정리
    const now = Date.now();
    for (const [id, job] of Object.entries(rt.data.jobsById)) {
      if (now - job.updatedAt > JOB_RETENTION_MS) {
        delete rt.data.jobsById[id];
      }
    }
    fs.writeFileSync(
      /*turbopackIgnore: true*/ STORE_FILE_PATH,
      JSON.stringify(rt.data, null, 2),
      "utf8"
    );
  } catch (e) {
    console.warn("[KakaoPcRelay] Failed to save relay store:", e);
  }
}

/**
 * 이메일 또는 파투 휴대폰 번호 기반 고정 6자리 페어링 코드 생성 (예: K7F92A)
 */
export function getOrCreatePairingCode(rawEmailOrPhone: string, rawPhone?: string): string {
  const email = normalizeRelayUserIdentifier(rawEmailOrPhone, rawPhone);
  if (!email) return "000000";
  const rt = getRuntime();
  const hash = crypto
    .createHash("sha256")
    .update(`sheetbot-kakao-bridge:${email}`)
    .digest("hex")
    .toUpperCase();
  const code = hash.slice(0, 6);
  if (rt.data.emailByPairingCode[code] !== email) {
    rt.data.emailByPairingCode[code] = email;
    saveToDisk(rt);
  }
  return code;
}

/**
 * 이메일, 파투 휴대폰 번호(010-XXXX-XXXX), 또는 페어링 코드(SB-XXXXXX)로부터 정규화된 사용자 식별자를 확인합니다.
 */
export function resolveUserEmailFromAuth(
  emailOrPhoneOrCode: string,
  pairingCode?: string,
  phoneNumber?: string
): string | null {
  const rt = getRuntime();
  loadFromDisk(rt);

  const normalized = normalizeRelayUserIdentifier(emailOrPhoneOrCode, phoneNumber);
  if (normalized && normalized.includes("@")) {
    getOrCreatePairingCode(normalized, phoneNumber);
    return normalized;
  }

  const code = (pairingCode || emailOrPhoneOrCode || "").toUpperCase().trim().replace(/^SB-/, "");
  if (code && rt.data.emailByPairingCode[code]) {
    return rt.data.emailByPairingCode[code];
  }
  return null;
}

/**
 * 이용자 PC 브리지 에이전트의 하트비트 갱신
 */
export function recordPcAgentHeartbeat(params: {
  userEmail: string;
  phoneNumber?: string;
  pcName?: string;
  kakaoReady?: boolean;
  kakaoDetail?: string;
  version?: string;
}): KakaoPcAgentStatus {
  const rt = getRuntime();
  const email = normalizeRelayUserIdentifier(params.userEmail, params.phoneNumber);
  const pairingCode = getOrCreatePairingCode(email, params.phoneNumber);

  const status: KakaoPcAgentStatus = {
    userEmail: email,
    pairingCode,
    pcName: (params.pcName || "내 Windows PC").trim(),
    kakaoReady: Boolean(params.kakaoReady),
    kakaoDetail: params.kakaoDetail || "",
    lastSeenAt: Date.now(),
    version: params.version || "1.0.0",
  };

  rt.data.agentsByEmail[email] = status;
  rt.data.emailByPairingCode[pairingCode] = email;
  saveToDisk(rt);
  return status;
}

/**
 * 한 사용자가 구글 이메일(user@gmail.com)과 파투 휴대폰 번호(010XXXXXXXX@fts.local) 중
 * 어느 쪽으로 PC 브리지를 켜두었더라도 모두 매칭할 수 있도록 후보 식별자 목록을 반환합니다.
 */
export function getCandidateIdentityKeys(rawEmailOrPhone: string, rawPhone?: string): string[] {
  const rt = getRuntime();
  const keys = new Set<string>();
  const cleanPhoneParam = (rawPhone || "").replace(/[^0-9]/g, "");
  const input = (rawEmailOrPhone || "").toLowerCase().trim();

  const normalized = normalizeRelayUserIdentifier(rawEmailOrPhone, rawPhone);
  if (normalized) keys.add(normalized);

  if (input.includes("@")) {
    keys.add(input);
    const ftsMatch = input.match(/^([0-9]{9,12})@(fts\.local|filetosheet\.cloud)$/);
    if (ftsMatch) {
      const digits = ftsMatch[1];
      keys.add(`${digits}@fts.local`);
      if (rt.data.emailByPhone[digits]) {
        keys.add(rt.data.emailByPhone[digits]);
      }
    } else {
      // 이 이메일과 매핑된 모든 전화번호의 @fts.local 키도 후보에 추가
      for (const [phoneDigits, mappedEmail] of Object.entries(rt.data.emailByPhone)) {
        if (mappedEmail === input) {
          keys.add(`${phoneDigits}@fts.local`);
        }
      }
      if (input === "chachogreat@gmail.com") {
        keys.add("01072165884@fts.local");
      }
    }
  } else {
    const digits = input.replace(/[^0-9]/g, "");
    if (digits.length >= 9 && digits.startsWith("01")) {
      keys.add(`${digits}@fts.local`);
      if (rt.data.emailByPhone[digits]) {
        keys.add(rt.data.emailByPhone[digits]);
      }
    }
  }

  if (cleanPhoneParam.length >= 9 && cleanPhoneParam.startsWith("01")) {
    keys.add(`${cleanPhoneParam}@fts.local`);
    if (rt.data.emailByPhone[cleanPhoneParam]) {
      keys.add(rt.data.emailByPhone[cleanPhoneParam]);
    }
  }

  return Array.from(keys).filter(Boolean);
}

/**
 * 해당 회원의 개인 PC 브리지가 현재 온라인(최근 45초 이내 폴링)인지 확인
 */
export function getUserPcAgentStatus(rawEmailOrPhone: string, rawPhone?: string): {
  online: boolean;
  kakaoReady: boolean;
  pcName: string;
  pairingCode: string;
  lastSeenAt: number | null;
  secondsAgo: number | null;
} {
  const rt = getRuntime();
  loadFromDisk(rt);
  const candidateKeys = getCandidateIdentityKeys(rawEmailOrPhone, rawPhone);
  const primaryEmail = candidateKeys[0] || normalizeRelayUserIdentifier(rawEmailOrPhone, rawPhone);
  const pairingCode = primaryEmail ? getOrCreatePairingCode(primaryEmail, rawPhone) : "000000";

  // 후보 식별자(구글 이메일 + 파투 전화번호 @fts.local) 중 가장 최근에 응답한 에이전트 선택
  let bestAgent: KakaoPcAgentStatus | undefined;
  for (const k of candidateKeys) {
    const candidateAgent = rt.data.agentsByEmail[k];
    if (candidateAgent) {
      if (!bestAgent || candidateAgent.lastSeenAt > bestAgent.lastSeenAt) {
        bestAgent = candidateAgent;
      }
    }
  }

  if (!bestAgent) {
    return {
      online: false,
      kakaoReady: false,
      pcName: "",
      pairingCode,
      lastSeenAt: null,
      secondsAgo: null,
    };
  }

  const diffMs = Date.now() - bestAgent.lastSeenAt;
  const online = diffMs <= AGENT_ONLINE_TTL_MS;
  return {
    online,
    kakaoReady: online && bestAgent.kakaoReady,
    pcName: bestAgent.pcName,
    pairingCode: bestAgent.pairingCode || pairingCode,
    lastSeenAt: bestAgent.lastSeenAt,
    secondsAgo: Math.max(0, Math.round(diffMs / 1000)),
  };
}

/**
 * 해당 회원의 대기 중인(PENDING) 첫 번째 카톡 발송 작업을 가져와 CLAIMED 상태로 변경
 */
export function claimNextPendingJobForUser(
  rawEmailOrPhone: string,
  pcName?: string
): KakaoPcDispatchJob | null {
  const rt = getRuntime();
  loadFromDisk(rt);
  const candidateKeys = getCandidateIdentityKeys(rawEmailOrPhone);
  if (candidateKeys.length === 0) return null;
  const keySet = new Set(candidateKeys);

  const pendingJobs = Object.values(rt.data.jobsById)
    .filter(
      (j) =>
        j.status === "PENDING" &&
        (keySet.has(j.userEmail) || (Array.isArray(j.aliasEmails) && j.aliasEmails.some((a) => keySet.has(a))))
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  if (pendingJobs.length === 0) return null;

  const job = pendingJobs[0];
  job.status = "CLAIMED";
  job.pcName = pcName || job.pcName || "내 PC";
  job.updatedAt = Date.now();
  saveToDisk(rt);
  return job;
}

/**
 * 이용자 PC 브리지가 대기할 때(Long-Polling) 새 작업이 들어오면 0.01초 만에 즉시 깨워 반환
 */
export async function waitForNextJobForUser(
  rawEmailOrPhone: string,
  pcName: string,
  waitMs: number = 12_000
): Promise<KakaoPcDispatchJob | null> {
  const candidateKeys = getCandidateIdentityKeys(rawEmailOrPhone);
  const email = candidateKeys[0] || normalizeRelayUserIdentifier(rawEmailOrPhone);
  const immediate = claimNextPendingJobForUser(email, pcName);
  if (immediate) return immediate;

  if (waitMs <= 0) return null;

  const rt = getRuntime();
  const clampedWait = Math.min(Math.max(waitMs, 1000), 20_000);

  return new Promise<KakaoPcDispatchJob | null>((resolve) => {
    let settled = false;
    const eventKeys = candidateKeys.map((k) => `job:new:${k}`);

    const cleanup = () => {
      settled = true;
      for (const ek of eventKeys) {
        rt.emitter.removeListener(ek, onWake);
      }
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };

    const onWake = () => {
      if (settled) return;
      const claimed = claimNextPendingJobForUser(email, pcName);
      if (claimed) {
        cleanup();
        resolve(claimed);
      }
    };

    for (const ek of eventKeys) {
      rt.emitter.on(ek, onWake);
    }

    // 멀티 워커 환경을 대비한 400ms 디스크 체크 병행
    const pollTimer = setInterval(onWake, 400);

    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      cleanup();
      resolve(claimNextPendingJobForUser(email, pcName));
    }, clampedWait);
  });
}

/**
 * 이용자 PC 브리지에서 실행 완료한 카톡 전송 결과를 반영하고 대기 중인 모바일 요청을 즉시 깨움
 */
export function completePcKakaoJob(params: {
  jobId: string;
  userEmail: string;
  ok: boolean;
  confirmed?: boolean;
  alreadyOpen?: boolean;
  draftPresent?: boolean;
  error?: string;
  pcName?: string;
}): KakaoPcDispatchJob | null {
  const rt = getRuntime();
  loadFromDisk(rt);

  const job = rt.data.jobsById[params.jobId];
  if (!job) return null;

  const candidateKeys = new Set(getCandidateIdentityKeys(params.userEmail));
  // 회원별 격리 검증 (주 식별자 및 파투 별칭 식별자 모두 허용)
  if (candidateKeys.size > 0) {
    const matchesOwner =
      candidateKeys.has(job.userEmail) ||
      (Array.isArray(job.aliasEmails) && job.aliasEmails.some((a) => candidateKeys.has(a)));
    if (!matchesOwner) {
      return null;
    }
  }

  job.status = params.ok ? "SENT" : "FAILED";
  job.confirmed = Boolean(params.confirmed);
  job.alreadyOpen = Boolean(params.alreadyOpen);
  job.draftPresent = Boolean(params.draftPresent);
  job.error = params.error || "";
  job.pcName = params.pcName || job.pcName || "내 PC";
  job.updatedAt = Date.now();

  saveToDisk(rt);
  rt.emitter.emit(`job:done:${job.jobId}`, job);
  return job;
}

/**
 * 모바일 앱에서 [내 PC 카톡으로 자동 발송] 클릭 시 큐에 작업을 등록하고
 * 이용자 PC 브리지가 전송 후 결과를 보고할 때까지 대기합니다.
 */
export async function enqueueAndAwaitUserPcKakaoJob(params: {
  userEmail: string;
  phoneNumber?: string;
  roomName: string;
  recipientName: string;
  message: string;
  timeoutMs?: number;
}): Promise<{
  handledByRemotePc: boolean;
  ok: boolean;
  confirmed?: boolean;
  draftPresent?: boolean;
  pcName?: string;
  error?: string;
}> {
  const rt = getRuntime();
  loadFromDisk(rt);

  const candidateKeys = getCandidateIdentityKeys(params.userEmail, params.phoneNumber);
  const email = candidateKeys[0] || normalizeRelayUserIdentifier(params.userEmail, params.phoneNumber);
  if (!email || !email.includes("@")) {
    return {
      handledByRemotePc: false,
      ok: false,
      error: "사용자 계정(구글 이메일 또는 파투 휴대폰 번호) 정보가 없어 내 PC 브리지를 식별할 수 없습니다.",
    };
  }

  const jobId = `kakaopcq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const job: KakaoPcDispatchJob = {
    jobId,
    userEmail: email,
    aliasEmails: candidateKeys,
    roomName: params.roomName,
    recipientName: params.recipientName,
    message: params.message,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  rt.data.jobsById[jobId] = job;
  saveToDisk(rt);

  // 대기 중인 이용자 PC 브리지(이메일 또는 파투 휴대폰 번호)를 0.01초 만에 깨움
  for (const k of candidateKeys) {
    rt.emitter.emit(`job:new:${k}`, job);
  }

  const agentStatus = getUserPcAgentStatus(params.userEmail, params.phoneNumber);
  // 온라인 에이전트가 있으면 최대 9.5초 대기, 없으면 혹시 막 연결될 에이전트를 위해 2.2초만 대기
  const waitBudgetMs = params.timeoutMs ?? (agentStatus.online ? 9_500 : 2_200);

  return new Promise((resolve) => {
    let settled = false;
    const doneEvent = `job:done:${jobId}`;

    const cleanup = () => {
      settled = true;
      rt.emitter.removeListener(doneEvent, onDone);
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };

    const checkDiskState = () => {
      if (settled) return;
      loadFromDisk(rt);
      const current = rt.data.jobsById[jobId];
      if (current && (current.status === "SENT" || current.status === "FAILED")) {
        cleanup();
        resolve({
          handledByRemotePc: true,
          ok: current.status === "SENT",
          confirmed: current.confirmed,
          draftPresent: current.draftPresent,
          pcName: current.pcName || agentStatus.pcName || "내 PC",
          error: current.error,
        });
      }
    };

    const onDone = (finishedJob: KakaoPcDispatchJob) => {
      if (settled) return;
      cleanup();
      resolve({
        handledByRemotePc: true,
        ok: finishedJob.status === "SENT",
        confirmed: finishedJob.confirmed,
        draftPresent: finishedJob.draftPresent,
        pcName: finishedJob.pcName || agentStatus.pcName || "내 PC",
        error: finishedJob.error,
      });
    };

    rt.emitter.on(doneEvent, onDone);
    const pollTimer = setInterval(checkDiskState, 350);

    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      loadFromDisk(rt);
      const latest = rt.data.jobsById[jobId];
      // 타임아웃 시 미처리 PENDING 작업은 안전하게 만료 처리하여 나중에 불시에 발송되지 않도록 방어
      if (latest && (latest.status === "PENDING" || latest.status === "CLAIMED")) {
        const wasClaimed = latest.status === "CLAIMED";
        delete rt.data.jobsById[jobId];
        saveToDisk(rt);
        cleanup();
        resolve({
          handledByRemotePc: wasClaimed || agentStatus.online,
          ok: false,
          pcName: latest.pcName || agentStatus.pcName,
          error: wasClaimed
            ? `내 PC(${latest.pcName || "Windows PC"})에서 카카오톡 전송 응답이 지연되었습니다. PC 카카오톡 잠금 상태를 확인해 주세요.`
            : "내 PC에서 실행 중인 '시트봇 PC 카톡 브리지'가 감지되지 않았습니다.",
        });
        return;
      }
      checkDiskState();
      if (!settled) {
        cleanup();
        resolve({
          handledByRemotePc: false,
          ok: false,
          error: "내 PC 카톡 브리지 연결 대기 시간을 초과했습니다.",
        });
      }
    }, waitBudgetMs);
  });
}
