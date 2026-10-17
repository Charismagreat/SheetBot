/**
 * 통화 녹음 청크 업로드 전용 디스크 저장소 (EGDesk 파일 스토리지 비의존)
 *
 * 배경: 이지데스크가 자동 생성하는 proxy.ts가 모든 경로(/:path*)를 매칭하여
 *       요청 본문을 10MB까지만 보존하므로, 10MB를 넘는 단일 base64 JSON 업로드는 잘려서 실패합니다.
 *       (proxy.ts / next.config.js는 빌드 시 재생성되어 수정 불가)
 *       → 2MB 청크로 나누어 전송 후 서버에서 재조립하여 기존 녹음 파이프라인에 투입합니다.
 *
 * 디렉토리: <os.tmpdir()>/sheetbot-rec-chunks/<uploadId>/{meta.json, 0.part, 1.part, ...}
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

export const RECORDING_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB (프록시 10MB 제한 대비 충분한 여유)
export const RECORDING_MAX_TOTAL_SIZE = 300 * 1024 * 1024; // 300MB
const SESSION_TTL_MS = 2 * 3600 * 1000; // 2시간

const ROOT_DIR = path.join(os.tmpdir(), "sheetbot-rec-chunks");
const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface RecordingChunkMeta {
  uploadId: string;
  userEmail: string;
  fileName: string;
  contactName: string;
  callTime: string;
  folderName: string;
  autoRecordSheet: boolean;
  channelCount: number;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  createdAt: number;
}

export function isValidUploadId(id: string): boolean {
  return UPLOAD_ID_RE.test(id);
}

function sessionDir(uploadId: string): string {
  if (!isValidUploadId(uploadId)) throw new Error("잘못된 업로드 ID입니다.");
  return path.join(ROOT_DIR, uploadId);
}

/** 만료된(2시간 경과) 세션 디렉토리 정리 */
export function cleanupExpiredSessions(): void {
  try {
    if (!fs.existsSync(ROOT_DIR)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(ROOT_DIR)) {
      const dir = path.join(ROOT_DIR, name);
      try {
        const stat = fs.statSync(dir);
        if (now - stat.mtimeMs > SESSION_TTL_MS) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch {}
}

export function createSession(input: Omit<RecordingChunkMeta, "uploadId" | "createdAt" | "chunkSize" | "totalChunks">): RecordingChunkMeta {
  cleanupExpiredSessions();
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(input.totalSize / RECORDING_CHUNK_SIZE);
  const meta: RecordingChunkMeta = {
    ...input,
    uploadId,
    chunkSize: RECORDING_CHUNK_SIZE,
    totalChunks,
    createdAt: Date.now(),
  };
  const dir = sessionDir(uploadId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta));
  return meta;
}

export function readSession(uploadId: string): RecordingChunkMeta | null {
  try {
    const file = path.join(sessionDir(uploadId), "meta.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as RecordingChunkMeta;
  } catch {
    return null;
  }
}

export function writeChunk(uploadId: string, index: number, data: Buffer): void {
  const dir = sessionDir(uploadId);
  const tmp = path.join(dir, `${index}.part.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, path.join(dir, `${index}.part`)); // 원자적 교체 (재전송 시 안전)
}

export function listReceivedChunks(meta: RecordingChunkMeta): number[] {
  const dir = sessionDir(meta.uploadId);
  const received: number[] = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    if (fs.existsSync(path.join(dir, `${i}.part`))) received.push(i);
  }
  return received;
}

/** 모든 청크를 순서대로 이어 붙여 하나의 Buffer로 재조립 (누락/크기 불일치 시 예외) */
export function assembleChunks(meta: RecordingChunkMeta): Buffer {
  const dir = sessionDir(meta.uploadId);
  const parts: Buffer[] = [];
  const missing: number[] = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    const p = path.join(dir, `${i}.part`);
    if (!fs.existsSync(p)) {
      missing.push(i);
      continue;
    }
    parts.push(fs.readFileSync(p));
  }
  if (missing.length > 0) {
    throw new Error(`누락된 청크가 있습니다: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "..." : ""}`);
  }
  const buffer = Buffer.concat(parts);
  if (buffer.length !== meta.totalSize) {
    throw new Error(`재조립 크기 불일치 (expected ${meta.totalSize}, got ${buffer.length})`);
  }
  return buffer;
}

export function deleteSession(uploadId: string): void {
  try {
    fs.rmSync(sessionDir(uploadId), { recursive: true, force: true });
  } catch {}
}

export function sha256Hex(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
