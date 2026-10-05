/**
 * 청크 분할 업로드 세션 메타데이터 관리 맵
 * - uploadId를 키로 하여 클라이언트가 전달한 시트봇 메타데이터(유저 이메일, 폴더명, OCR 타입 등) 보관
 * - 1시간 TTL 자동 만료
 */

export interface UploadSessionMeta {
  uploadId: string;
  userEmail: string;
  folderName?: string;
  ocrType?: "GENERIC" | "RECEIPT" | "BUSINESS_CARD" | string;
  memo?: string;
  autoRecordSheet?: boolean;
  deviceId?: string;
  contactName?: string;
  callTime?: string;
  isCallRecording?: boolean;
  rawFileName?: string;
  mimeType?: string;
  createdAt: number;
}

const sessions = new Map<string, UploadSessionMeta>();

export function saveUploadSession(meta: UploadSessionMeta): void {
  cleanExpiredSessions();
  sessions.set(meta.uploadId, meta);
}

export function getUploadSession(uploadId: string): UploadSessionMeta | undefined {
  cleanExpiredSessions();
  return sessions.get(uploadId);
}

export function deleteUploadSession(uploadId: string): void {
  sessions.delete(uploadId);
}

function cleanExpiredSessions(): void {
  const now = Date.now();
  const ONE_HOUR = 3600 * 1000;
  for (const [id, meta] of sessions.entries()) {
    if (now - meta.createdAt > ONE_HOUR) {
      sessions.delete(id);
    }
  }
}
