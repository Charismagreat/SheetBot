/**
 * 명함 AI 분석 비동기 작업 인메모리 저장소 (Zero-Timeout Architecture)
 * Render 터널링 프록시의 15~30초 소켓 타임아웃을 원천 방지하기 위해
 * 업로드 즉시 jobId를 발급하고 백그라운드에서 분석 결과를 적재합니다.
 */

export interface CardJobData {
  jobId: string;
  userEmail: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  fileName: string;
  folderName: string;
  folderId?: string;
  spreadsheetUrl?: string | null;
  ocrData?: any;
  error?: string | null;
  createdAt: number;
  completedAt?: number;
}

const globalForCardJobs = globalThis as unknown as {
  sheetbotCardJobs: Map<string, CardJobData> | undefined;
};

export const cardJobs = globalForCardJobs.sheetbotCardJobs ?? new Map<string, CardJobData>();
globalForCardJobs.sheetbotCardJobs = cardJobs;

export function createCardJob(job: Omit<CardJobData, "status" | "createdAt">): CardJobData {
  const newJob: CardJobData = {
    ...job,
    status: "PROCESSING",
    createdAt: Date.now(),
  };
  cardJobs.set(job.jobId, newJob);

  // 10분 이상 지난 작업 메모리 정리
  if (cardJobs.size > 200) {
    const now = Date.now();
    for (const [id, j] of cardJobs.entries()) {
      if (now - j.createdAt > 600000) {
        cardJobs.delete(id);
      }
    }
  }

  return newJob;
}

export function updateCardJob(jobId: string, updates: Partial<CardJobData>): CardJobData | null {
  const existing = cardJobs.get(jobId);
  if (!existing) return null;

  const updated: CardJobData = {
    ...existing,
    ...updates,
    completedAt: updates.status === "COMPLETED" || updates.status === "FAILED" ? Date.now() : existing.completedAt,
  };
  cardJobs.set(jobId, updated);
  return updated;
}

export function getCardJob(jobId: string): CardJobData | null {
  return cardJobs.get(jobId) || null;
}
