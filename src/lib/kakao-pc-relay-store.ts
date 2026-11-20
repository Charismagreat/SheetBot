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
        rt.data.jobsById = parsed.jobsById || {};
      }
    }
  } catch (e) {
    console.warn("[KakaoPcRelay] Failed to load relay store:", e);
  }
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
 * 이메일 기반 고정 6자리 페어링 코드 생성 (예: K7F92A)
 */
export function getOrCreatePairingCode(rawEmail: string): string {
  const email = (rawEmail || "").toLowerCase().trim();
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
 * 이메일 또는 페어링 코드로부터 정규화된 사용자 이메일을 확인합니다.
 */
export function resolveUserEmailFromAuth(emailOrCode: string, pairingCode?: string): string | null {
  const rt = getRuntime();
  loadFromDisk(rt);

  const candidateEmail = (emailOrCode || "").toLowerCase().trim();
  if (candidateEmail.includes("@")) {
    getOrCreatePairingCode(candidateEmail);
    return candidateEmail;
  }

  const code = (pairingCode || emailOrCode || "").toUpperCase().trim().replace(/^SB-/, "");
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
  pcName?: string;
  kakaoReady?: boolean;
  kakaoDetail?: string;
  version?: string;
}): KakaoPcAgentStatus {
  const rt = getRuntime();
  const email = params.userEmail.toLowerCase().trim();
  const pairingCode = getOrCreatePairingCode(email);

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
 * 해당 회원의 개인 PC 브리지가 현재 온라인(최근 45초 이내 폴링)인지 확인
 */
export function getUserPcAgentStatus(rawEmail: string): {
  online: boolean;
  kakaoReady: boolean;
  pcName: string;
  pairingCode: string;
  lastSeenAt: number | null;
  secondsAgo: number | null;
} {
  const rt = getRuntime();
  loadFromDisk(rt);
  const email = (rawEmail || "").toLowerCase().trim();
  const pairingCode = email ? getOrCreatePairingCode(email) : "000000";
  const agent = email ? rt.data.agentsByEmail[email] : undefined;

  if (!agent) {
    return {
      online: false,
      kakaoReady: false,
      pcName: "",
      pairingCode,
      lastSeenAt: null,
      secondsAgo: null,
    };
  }

  const diffMs = Date.now() - agent.lastSeenAt;
  const online = diffMs <= AGENT_ONLINE_TTL_MS;
  return {
    online,
    kakaoReady: online && agent.kakaoReady,
    pcName: agent.pcName,
    pairingCode,
    lastSeenAt: agent.lastSeenAt,
    secondsAgo: Math.max(0, Math.round(diffMs / 1000)),
  };
}

/**
 * 해당 회원의 대기 중인(PENDING) 첫 번째 카톡 발송 작업을 가져와 CLAIMED 상태로 변경
 */
export function claimNextPendingJobForUser(
  rawEmail: string,
  pcName?: string
): KakaoPcDispatchJob | null {
  const rt = getRuntime();
  loadFromDisk(rt);
  const email = (rawEmail || "").toLowerCase().trim();
  if (!email) return null;

  const pendingJobs = Object.values(rt.data.jobsById)
    .filter((j) => j.userEmail === email && j.status === "PENDING")
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
  rawEmail: string,
  pcName: string,
  waitMs: number = 12_000
): Promise<KakaoPcDispatchJob | null> {
  const email = (rawEmail || "").toLowerCase().trim();
  const immediate = claimNextPendingJobForUser(email, pcName);
  if (immediate) return immediate;

  if (waitMs <= 0) return null;

  const rt = getRuntime();
  const clampedWait = Math.min(Math.max(waitMs, 1000), 20_000);

  return new Promise<KakaoPcDispatchJob | null>((resolve) => {
    let settled = false;
    const eventKey = `job:new:${email}`;

    const cleanup = () => {
      settled = true;
      rt.emitter.removeListener(eventKey, onWake);
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

    rt.emitter.on(eventKey, onWake);

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

  // 회원별 격리 검증
  if (params.userEmail && job.userEmail !== params.userEmail.toLowerCase().trim()) {
    return null;
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

  const email = (params.userEmail || "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return {
      handledByRemotePc: false,
      ok: false,
      error: "사용자 이메일 인증 정보가 없어 내 PC 브리지를 식별할 수 없습니다.",
    };
  }

  const jobId = `kakaopcq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const job: KakaoPcDispatchJob = {
    jobId,
    userEmail: email,
    roomName: params.roomName,
    recipientName: params.recipientName,
    message: params.message,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  rt.data.jobsById[jobId] = job;
  saveToDisk(rt);

  // 대기 중인 이용자 PC 브리지를 0.01초 만에 깨움
  rt.emitter.emit(`job:new:${email}`, job);

  const agentStatus = getUserPcAgentStatus(email);
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
