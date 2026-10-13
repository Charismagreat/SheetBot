const rateBuckets = new Map<string, { count: number; windowStart: number }>();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = Number(process.env.SHEETBOT_RUNTIME_RATE_PER_MIN || 30);

export function checkRuntimeRateLimit(projectId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(projectId);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(projectId, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (bucket.count >= RATE_MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((RATE_WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function defaultRuntimeDailyCap(project: Record<string, unknown>): number {
  const rowCap = Number(project.runtime_daily_cap_tokens);
  if (Number.isFinite(rowCap) && rowCap > 0) return rowCap;
  const envCap = Number(process.env.SHEETBOT_RUNTIME_DAILY_CAP_TOKENS || 100_000);
  return Number.isFinite(envCap) && envCap > 0 ? envCap : 100_000;
}
