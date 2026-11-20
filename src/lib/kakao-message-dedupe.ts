import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

interface DedupeRuntime {
  fingerprintMap: Map<string, number>;
  recentTextMap: Map<string, number>;
  syncedLogIdsByUser: Record<string, string[]>;
  loaded: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __sheetbotKakaoDedupeRuntime: DedupeRuntime | undefined;
}

const LOGID_STORE_PATH = path.join(os.homedir(), ".egdesk", "sheetbot-kakao-synced-logids.json");
const ROOM_MSG_TTL_MS = 5 * 60 * 1000; // 5분 (동일 방 + 동일 메시지)
const ANY_ROOM_TEXT_TTL_MS = 45 * 1000; // 45초 (모바일 알림 방 이름 vs PC 커스텀 방 이름 차이 방어)
const MAX_LOGIDS_PER_USER = 1500;

function getDedupeRuntime(): DedupeRuntime {
  if (!globalThis.__sheetbotKakaoDedupeRuntime) {
    globalThis.__sheetbotKakaoDedupeRuntime = {
      fingerprintMap: new Map<string, number>(),
      recentTextMap: new Map<string, number>(),
      syncedLogIdsByUser: {},
      loaded: false,
    };
  }
  const rt = globalThis.__sheetbotKakaoDedupeRuntime;
  if (!rt.loaded) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ LOGID_STORE_PATH)) {
        const raw = fs.readFileSync(/*turbopackIgnore: true*/ LOGID_STORE_PATH, "utf8");
        rt.syncedLogIdsByUser = JSON.parse(raw) || {};
      }
    } catch {}
    rt.loaded = true;
  }
  return rt;
}

function saveLogIdsToDisk(rt: DedupeRuntime) {
  try {
    const dir = path.dirname(LOGID_STORE_PATH);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
    fs.writeFileSync(
      /*turbopackIgnore: true*/ LOGID_STORE_PATH,
      JSON.stringify(rt.syncedLogIdsByUser, null, 2),
      "utf8"
    );
  } catch {}
}

function normalizeRoomOrSender(raw: string): string {
  return (raw || "")
    .replace(/^\[단체\s*채팅방\]\s*/g, "")
    .replace(/^\[(단톡방|개인톡)\]\s*/g, "")
    .replace(/^[📤📩💬🖥️📱💛]+\s*/g, "")
    .replace(/^\[?나\s*➔\s*/g, "")
    .replace(/\]$/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function normalizeMessageText(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .slice(0, 160)
    .trim();
}

/**
 * 스마트폰 알림(KakaoNotificationListener), AI 비서 발송(send/route.ts),
 * PC 카카오톡 로컬 DB 감시(kakao_native) 3개 채널 통합 중복 검사 및 지문 등록.
 *
 * @returns true 이면 이미 타 채널/직전 요청으로 기록된 중복 메시지이므로 시트 적재를 건너뛰어야 함.
 */
export function isDuplicateAndRegisterKakaoMessage(params: {
  userKey: string; // 전화번호(010XXXXXXXX) 또는 이메일
  roomName?: string;
  senderName?: string;
  message: string;
  logId?: string | number;
}): boolean {
  const rt = getDedupeRuntime();
  const now = Date.now();

  const cleanUser = (params.userKey || "")
    .toLowerCase()
    .replace(/@(fts\.local|filetosheet\.cloud)$/, "")
    .trim();
  const normMsg = normalizeMessageText(params.message);
  if (!cleanUser || !normMsg) return false;

  // 1. 카카오톡 고유 logId 기반 영구 중복 검사 (서버 재시작 후에도 100% 중복 차단)
  const logIdStr = params.logId !== undefined && params.logId !== null ? String(params.logId).trim() : "";
  if (logIdStr && logIdStr !== "0") {
    const userLogs = rt.syncedLogIdsByUser[cleanUser] || [];
    if (userLogs.includes(logIdStr)) {
      return true;
    }
  }

  // 만료된 캐시 정리
  for (const [k, ts] of rt.fingerprintMap.entries()) {
    if (now - ts > ROOM_MSG_TTL_MS) rt.fingerprintMap.delete(k);
  }
  for (const [k, ts] of rt.recentTextMap.entries()) {
    if (now - ts > ANY_ROOM_TEXT_TTL_MS) rt.recentTextMap.delete(k);
  }

  const normRoom = normalizeRoomOrSender(params.roomName || params.senderName || "");
  const normSender = normalizeRoomOrSender(params.senderName || params.roomName || "");

  const roomHash = crypto
    .createHash("sha256")
    .update(`${cleanUser}|${normRoom}|${normMsg}`)
    .digest("hex")
    .slice(0, 24);
  const senderHash = crypto
    .createHash("sha256")
    .update(`${cleanUser}|${normSender}|${normMsg}`)
    .digest("hex")
    .slice(0, 24);
  const textOnlyHash = crypto
    .createHash("sha256")
    .update(`${cleanUser}|${normMsg}`)
    .digest("hex")
    .slice(0, 24);

  // 2. 5분 이내 동일 (방이름 + 메시지) 또는 (발신자 + 메시지) 지문 존재 여부 확인
  const prevRoomTs = rt.fingerprintMap.get(roomHash);
  if (prevRoomTs && now - prevRoomTs <= ROOM_MSG_TTL_MS) {
    return true;
  }
  const prevSenderTs = rt.fingerprintMap.get(senderHash);
  if (prevSenderTs && now - prevSenderTs <= ROOM_MSG_TTL_MS) {
    return true;
  }

  // 3. 45초 이내 동일 사용자에게 들어온 완전히 똑같은 메시지 본문 확인 (모바일 알림 방 제목 vs PC 커스텀 방 제목 불일치 방어)
  const prevTextTs = rt.recentTextMap.get(textOnlyHash);
  if (prevTextTs && now - prevTextTs <= ANY_ROOM_TEXT_TTL_MS) {
    return true;
  }

  // 신규 메시지로 확정 -> 지문 및 logId 등록
  rt.fingerprintMap.set(roomHash, now);
  rt.fingerprintMap.set(senderHash, now);
  rt.recentTextMap.set(textOnlyHash, now);

  if (logIdStr && logIdStr !== "0") {
    const existing = rt.syncedLogIdsByUser[cleanUser] || [];
    rt.syncedLogIdsByUser[cleanUser] = [...existing, logIdStr].slice(-MAX_LOGIDS_PER_USER);
    saveLogIdsToDisk(rt);
  }

  return false;
}
