/**
 * Client fetch with AbortSignal timeout — kept separate from generated src/lib/api.ts.
 */
import { apiFetch } from "@/lib/api";

export async function apiFetchWithTimeout(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 45_000, ...fetchOptions } = options;
  const signal =
    fetchOptions.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);
  return apiFetch(path, { ...fetchOptions, ...(signal ? { signal } : {}) });
}
