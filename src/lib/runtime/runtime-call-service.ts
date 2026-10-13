import { getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import { getModelTokenMultiplier } from "@/lib/ai-settings";
import { recordAiUsageLog } from "@/lib/ai-usage";
import {
  calculateBillableTokens,
  normalizeAiCallerUsage,
} from "@/lib/token-calculator";
import { checkTokenBalance, settleWalletDebit } from "@/lib/token-wallet";
import { SheetbotServiceError } from "@/lib/wrapping/sheetbot-api-error";
import { SHEET_MCP_MANIFEST_VERSION, getRuntimeToolExposure } from "./sheet-mcp-manifest";
import { assertRuntimeSpendCap } from "./runtime-spend-cap";
import { checkRuntimeRateLimit } from "./runtime-guards";
import { loadRuntimeIdempotency, saveRuntimeIdempotency } from "./runtime-idempotency";
import { findProjectByRuntimeToken, scriptIdMatchesProject } from "./runtime-token-persist";

const EGDESK_MASTER_KEY =
  process.env.EGDESK_MCP_INTERNAL_KEY ||
  process.env.NEXT_PUBLIC_EGDESK_API_KEY ||
  process.env.EGDESK_API_KEY ||
  "";

export type RuntimeCallBody = {
  scriptId: string;
  service: string;
  tool: string;
  arguments?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type RuntimeCallWallet = {
  baseFee: number;
  usage: number;
  deducted: number;
  remainingBalance: number;
};

function parseBearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

export function extractRuntimeAuth(req: Request, body: RuntimeCallBody): {
  token: string;
  idempotencyKey: string;
} {
  const token = parseBearerToken(req);
  const idempotencyKey =
    (body.idempotencyKey || req.headers.get("idempotency-key") || "").trim();
  return { token, idempotencyKey };
}

async function proxyEgdeskMcp(
  service: string,
  tool: string,
  args: Record<string, unknown>,
  userEmail: string,
): Promise<unknown> {
  const base = getServerEgdeskApiUrl();
  const targetUrl = `${base}/${service}/tools/call`;
  const finalArgs = { ...args };
  if (service === "user-data" && tool === "user_data_insert_rows" && Array.isArray(finalArgs.rows)) {
    finalArgs.rows = (finalArgs.rows as Record<string, unknown>[]).map((row) => ({
      ...row,
      user_email: row.user_email || userEmail,
    }));
  }

  const upstreamRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(EGDESK_MASTER_KEY ? { "X-Api-Key": EGDESK_MASTER_KEY } : {}),
    },
    body: JSON.stringify({ tool, arguments: finalArgs }),
  });

  const resultJson = await upstreamRes.json().catch(() => ({}));
  if (!upstreamRes.ok) {
    throw new SheetbotServiceError({
      code: "INTERNAL_ERROR",
      message: (resultJson as { error?: string })?.error || `EGDesk proxy failed (${upstreamRes.status})`,
      httpStatus: 502,
    });
  }
  return resultJson;
}

function extractUsageFromMcpResult(result: unknown): { usage: number; model?: string } {
  const r = result as Record<string, unknown>;
  const inner = (r.result ?? r) as Record<string, unknown>;
  const usageRaw = inner.usage ?? r.usage;
  const usage = normalizeAiCallerUsage(usageRaw);
  const model =
    (inner.model as string) ||
    ((r.arguments as Record<string, unknown>)?.model as string) ||
    "gemini-3.8-flash";

  if (!usage) {
    return { usage: 0, model };
  }

  const billing = calculateBillableTokens({
    usage,
    tokenMultiplier: 1,
  });
  return { usage: billing.billableTokens, model };
}

export async function handleRuntimeCall(req: Request, body: RuntimeCallBody): Promise<{
  success: true;
  result: unknown;
  tokens: RuntimeCallWallet;
  idempotentReplay?: boolean;
}> {
  const { token, idempotencyKey } = extractRuntimeAuth(req, body);
  if (!token || !token.startsWith("rt_")) {
    throw new SheetbotServiceError({
      code: "INVALID_RUNTIME_AUTH",
      message: "유효한 runtime Bearer 토큰이 필요합니다.",
      httpStatus: 403,
    });
  }
  if (!idempotencyKey) {
    throw new SheetbotServiceError({
      code: "INTERNAL_ERROR",
      message: "idempotencyKey (body or Idempotency-Key header) is required",
      httpStatus: 400,
    });
  }

  const { scriptId, service, tool } = body;
  const args = body.arguments && typeof body.arguments === "object" ? body.arguments : {};

  if (!scriptId || !service || !tool) {
    throw new SheetbotServiceError({
      code: "INTERNAL_ERROR",
      message: "scriptId, service, and tool are required",
      httpStatus: 400,
    });
  }

  const project = await findProjectByRuntimeToken(token);
  if (!project) {
    throw new SheetbotServiceError({
      code: "INVALID_RUNTIME_AUTH",
      message: "runtime 토큰이 유효하지 않습니다.",
      httpStatus: 403,
    });
  }

  if (!scriptIdMatchesProject(project, scriptId)) {
    throw new SheetbotServiceError({
      code: "INVALID_RUNTIME_AUTH",
      message: "scriptId가 이 프로젝트에 바인딩된 Apps Script와 일치하지 않습니다.",
      httpStatus: 403,
    });
  }

  const projectId = String(project.id);
  const userEmail = String(project.user_email || "");

  const exposure = getRuntimeToolExposure(service, tool);
  if (!exposure) {
    throw new SheetbotServiceError({
      code: "MANIFEST_VIOLATION",
      message: `허용되지 않은 runtime 도구: ${service}/${tool}`,
      httpStatus: 403,
      details: { service, tool, manifestVersion: SHEET_MCP_MANIFEST_VERSION },
    });
  }

  const idem = await loadRuntimeIdempotency(projectId, idempotencyKey, service, tool, args);
  if (idem === "mismatch") {
    throw new SheetbotServiceError({
      code: "IDEMPOTENCY_KEY_MISMATCH",
      message: "동일 idempotencyKey에 다른 요청 본문이 전달되었습니다.",
      httpStatus: 409,
      details: { conflictReason: "idempotency_mismatch" },
    });
  }
  if (idem !== "miss") {
    const wallet = await checkTokenBalance(userEmail, 0);
    return {
      success: true,
      result: idem.response,
      tokens: {
        baseFee: 0,
        usage: 0,
        deducted: 0,
        remainingBalance: wallet.balance,
      },
      idempotentReplay: true,
    };
  }

  const rate = checkRuntimeRateLimit(projectId);
  if (!rate.allowed) {
    throw new SheetbotServiceError({
      code: "RATE_LIMITED",
      message: "runtime 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      httpStatus: 429,
      details: { retryAfterSeconds: rate.retryAfterSeconds },
    });
  }

  const cap = await assertRuntimeSpendCap(project);
  if (!cap.ok) {
    throw new SheetbotServiceError({
      code: "SPEND_CAP_EXCEEDED",
      message: "이 프로젝트의 일일 runtime 토큰 한도에 도달했습니다.",
      httpStatus: 402,
      details: {
        spendCap: { window: "daily", used: cap.used, limit: cap.limit },
      },
    });
  }

  const baseFee = exposure.baseFeeTokens || 0;
  let usageFee = 0;

  const mcpResult = await proxyEgdeskMcp(service, tool, args, userEmail);

  if (exposure.billUsageFromMcp && service === "ai-caller") {
    const extracted = extractUsageFromMcpResult(mcpResult);
    const multiplier = await getModelTokenMultiplier(extracted.model || "gemini-3.8-flash");
    const billing = calculateBillableTokens({
      usage: normalizeAiCallerUsage((mcpResult as Record<string, unknown>)?.usage),
      tokenMultiplier: multiplier,
    });
    usageFee = billing.billableTokens || extracted.usage;
  }

  const totalCharge = baseFee + usageFee;
  if (totalCharge > 0) {
    const pre = await checkTokenBalance(userEmail, totalCharge);
    if (!pre.allowed) {
      throw new SheetbotServiceError({
        code: "INSUFFICIENT_BALANCE",
        message: pre.reason || "잔여 토큰이 부족합니다.",
        httpStatus: 402,
        details: { balance: pre.balance, required: totalCharge },
      });
    }
  }

  const settleKey = `runtime:${projectId}:${idempotencyKey}`;
  const settled =
    totalCharge > 0
      ? await settleWalletDebit({
          userEmail,
          amount: totalCharge,
          idempotencyKey: settleKey,
          kind: "runtime",
          metadata: { projectId, service, tool },
          allowDebt: true,
        })
      : { status: "settled" as const, deducted: 0, newBalance: (await checkTokenBalance(userEmail, 0)).balance, replay: false };

  if (settled.status === "insufficient_funds") {
    throw new SheetbotServiceError({
      code: "INSUFFICIENT_BALANCE",
      message: "잔여 토큰이 부족합니다.",
      httpStatus: 402,
      details: { balance: settled.balance, required: totalCharge },
    });
  }

  const deducted = settled.status === "settled" ? settled.deducted : 0;
  const remainingBalance = settled.status === "settled" ? settled.newBalance : (await checkTokenBalance(userEmail, 0)).balance;

  const responsePayload = {
    success: true,
    result: mcpResult,
    tokens: {
      baseFee,
      usage: usageFee,
      deducted,
      remainingBalance,
    },
  };

  await saveRuntimeIdempotency({
    projectId,
    userEmail,
    idempotencyKey,
    service,
    tool,
    args,
    cachedResponse: mcpResult,
    deducted,
  });

  void recordAiUsageLog({
    userEmail,
    userName: "시트 runtime",
    caller: "sheetbot-runtime",
    purpose: `${service}/${tool}`,
    model: service === "ai-caller" ? String(args.model || "ai-caller") : service,
    promptTokens: 0,
    completionTokens: deducted,
    totalTokens: deducted,
    promptText: `runtime ${service}.${tool}`,
  });

  return {
    success: true,
    result: mcpResult,
    tokens: responsePayload.tokens,
  };
}
