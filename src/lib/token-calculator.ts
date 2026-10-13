/**
 * Central billing token math for SheetBot wallet deductions and usage logs.
 * Matches /api/sheets/analyze: real caller usage when present, else chars ÷ 2.5, then model multiplier.
 */

/** Character-length heuristic used when the AI Caller does not return token counts. */
export const BILLING_CHARS_PER_TOKEN = 2.5;

export type AiUsageCounts = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type CalculateBillableTokensInput = {
  promptText?: string;
  responseText?: string;
  usage?: AiUsageCounts | null;
  /** Model billing weight from getModelTokenMultiplier (default 1). */
  tokenMultiplier?: number;
  /** Extra factor after multiplier (e.g. 0.5 for batch discount). */
  additionalBillingFactor?: number;
};

export type BillableTokenResult = {
  promptTokens: number;
  completionTokens: number;
  rawTotalTokens: number;
  billableTokens: number;
};

function readUsageNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Normalize EGDesk AI Caller `usage` payloads into prompt/completion counts.
 */
export function normalizeAiCallerUsage(usage: unknown): AiUsageCounts | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const promptTokens = readUsageNumber(
    u.promptTokens ?? u.prompt_tokens ?? u.inputTokens ?? u.input_tokens,
  );
  const completionTokens = readUsageNumber(
    u.completionTokens ?? u.completion_tokens ?? u.outputTokens ?? u.output_tokens,
  );
  const totalTokens = readUsageNumber(u.totalTokens ?? u.total_tokens);
  if (promptTokens == null && completionTokens == null && totalTokens == null) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}

export function estimateTokensFromCharLength(charLength: number): number {
  if (!charLength || charLength <= 0) return 0;
  return Math.ceil(charLength / BILLING_CHARS_PER_TOKEN);
}

/**
 * Resolve per-part token counts (API usage or char estimate).
 */
export function resolveRawTokenCounts(input: {
  promptText?: string;
  responseText?: string;
  usage?: AiUsageCounts | null;
}): { promptTokens: number; completionTokens: number; rawTotalTokens: number } {
  const promptLen = (input.promptText ?? "").length;
  const respLen = (input.responseText ?? "").length;
  const usage = input.usage;

  const pTokens =
    usage?.promptTokens != null && usage.promptTokens > 0
      ? Math.round(usage.promptTokens)
      : estimateTokensFromCharLength(promptLen);

  const cTokens =
    usage?.completionTokens != null && usage.completionTokens > 0
      ? Math.round(usage.completionTokens)
      : estimateTokensFromCharLength(respLen);

  return {
    promptTokens: pTokens,
    completionTokens: cTokens,
    rawTotalTokens: pTokens + cTokens,
  };
}

/**
 * Wallet + audit log billable tokens (raw total × model multiplier × optional extra factor).
 */
export function calculateBillableTokens(input: CalculateBillableTokensInput): BillableTokenResult {
  const multiplier = input.tokenMultiplier ?? 1;
  const extra = input.additionalBillingFactor ?? 1;
  const { promptTokens, completionTokens, rawTotalTokens } = resolveRawTokenCounts({
    promptText: input.promptText,
    responseText: input.responseText,
    usage: input.usage,
  });

  const billableTokens = Math.round(rawTotalTokens * multiplier * extra);

  return {
    promptTokens,
    completionTokens,
    rawTotalTokens,
    billableTokens,
  };
}
