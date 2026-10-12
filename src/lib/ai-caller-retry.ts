/**
 * SheetBot-only AI Caller retry for analyze. Uses generated root `egdesk-helpers.ts`
 * (callAiCallerTool) — do not route through src/lib/egdesk-helpers shadow callAiCaller.
 */
import { callAiCallerTool } from "../../egdesk-helpers";

const ANALYZE_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"] as const;

export type AnalyzeAiCallerOptions = {
  systemPrompt?: string;
  temperature?: number;
  caller?: string;
};

export type AnalyzeAiCallerResult = {
  text: string;
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  raw?: unknown;
};

export function isTransientAiCallerError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "");
  return /AI Caller HTTP error: (500|502|503|504|429)|HTTP (500|502|503|504|429)|UNAVAILABLE|capacity|rate limit|timeout|ECONNRESET|fetch failed|Tool call failed/i.test(
    msg,
  );
}

export function isGeminiCapacityError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "");
  return /503|UNAVAILABLE|No capacity available/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAnalyzeAiOnce(
  prompt: string,
  options: AnalyzeAiCallerOptions,
  model: string,
): Promise<AnalyzeAiCallerResult> {
  const result = await callAiCallerTool("ai_caller_call", {
    prompt,
    model,
    temperature: options.temperature,
    systemPrompt: options.systemPrompt,
    caller: options.caller,
  });
  const text = String(result?.content ?? "");
  return {
    text,
    content: text,
    usage: result?.usage,
    raw: result,
  };
}

/**
 * Retry for sheet analyze — gemini-3.8-flash-high often returns transient 503 capacity.
 */
export async function callAiCallerWithAnalyzeRetry(
  prompt: string,
  options: AnalyzeAiCallerOptions,
  primaryModel: string,
): Promise<{ result: AnalyzeAiCallerResult; modelUsed: string }> {
  const models = [primaryModel, ...ANALYZE_FALLBACK_MODELS.filter((m) => m !== primaryModel)];
  let lastError: Error | undefined;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await callAnalyzeAiOnce(prompt, options, model);
        return { result, modelUsed: model };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (!isTransientAiCallerError(lastError) || attempt >= 2) {
          break;
        }
        await sleep(1500 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("AI Caller failed after retries");
}
