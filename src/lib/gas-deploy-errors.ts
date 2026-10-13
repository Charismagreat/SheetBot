import type { SheetbotApiError, SheetbotErrorCode } from "@/lib/wrapping/sheetbot-api-error";

const GENERIC_PUSH_FAILURE =
  "Code.gs를 Google Apps Script에 푸시하지 못했습니다. EGDesk 로그에서 apps_script_write_file / apps_script_push_to_google 오류를 확인해 주세요.";

const QUOTA_PUSH_FAILURE =
  "Google Apps Script API 호출 한도(분당 관리 요청)에 도달했습니다. 1~2분 기다린 뒤 배포를 한 번만 다시 시도해 주세요. 연속 클릭·재시도는 한도를 더 빨리 소진합니다.";

const AI_SYNTAX_PUSH_FAILURE =
  "AI가 생성한 Apps Script(Code.gs)에 문법 오류가 있어 Google에 배포하지 못했습니다. 2단계에서 요구사항을 조율하거나 코드 미리보기를 확인한 뒤 다시 생성·배포해 주세요.";

export type GasDeployFailureKind = "ai_syntax" | "quota" | "auth" | "infra" | "unknown";

/** Classify MCP / Apps Script deploy errors for UI (AI vs quota vs EGDesk). */
export function classifyGasDeployFailure(gasDeployErrors: string[]): GasDeployFailureKind {
  const combined = gasDeployErrors.join("\n").toLowerCase();
  if (isAppsScriptManagementQuotaError(combined)) {
    return "quota";
  }
  if (
    /syntaxerror|syntax error|unexpected token|parse error|line:\s*\d+.*code\.gs|file:\s*code\.gs/i.test(
      gasDeployErrors.join("\n"),
    )
  ) {
    return "ai_syntax";
  }
  if (
    /permission|oauth|scope|403|401|unauthorized|insufficient|auth/i.test(combined)
  ) {
    return "auth";
  }
  if (
    /egdesk|mcp|create_bound|list_projects|connection|econnrefused|not enabled/i.test(
      combined,
    )
  ) {
    return "infra";
  }
  return "unknown";
}

/** Detect Google Script API management quota / rate-limit errors from EGDesk or MCP messages. */
export function isAppsScriptManagementQuotaError(text: string): boolean {
  const m = text.toLowerCase();
  if (m.includes("quota exceeded") && (m.includes("management requests") || m.includes("script.googleapis.com"))) {
    return true;
  }
  if (m.includes("rate limit") && m.includes("script")) {
    return true;
  }
  if (m.includes("resource exhausted") && m.includes("script")) {
    return true;
  }
  return false;
}

export function formatGasCloudPushUserError(gasDeployErrors: string[]): string {
  const kind = classifyGasDeployFailure(gasDeployErrors);
  if (kind === "quota") {
    return QUOTA_PUSH_FAILURE;
  }
  if (kind === "ai_syntax") {
    return AI_SYNTAX_PUSH_FAILURE;
  }
  return GENERIC_PUSH_FAILURE;
}

export function gasDeployFailureMeta(gasDeployErrors: string[]): {
  kind: GasDeployFailureKind;
  userMessage: string;
} {
  const kind = classifyGasDeployFailure(gasDeployErrors);
  return {
    kind,
    userMessage: formatGasCloudPushUserError(gasDeployErrors),
  };
}

/** Map deploy / MCP failures to stable API codes (WRAPPING.md § API errors). */
export function sheetbotApiErrorFromGasDeploy(gasDeployErrors: string[]): SheetbotApiError {
  const kind = classifyGasDeployFailure(gasDeployErrors);
  const code: SheetbotErrorCode =
    kind === "auth"
      ? "WRAP_OAUTH"
      : kind === "quota"
        ? "RATE_LIMITED"
        : kind === "ai_syntax"
          ? "WRAP_PUSH_FAILED"
          : "WRAP_PUSH_FAILED";
  const httpStatus = kind === "auth" ? 403 : kind === "quota" ? 429 : 502;
  return {
    code,
    message: formatGasCloudPushUserError(gasDeployErrors),
    httpStatus,
    details: kind === "quota" ? { retryAfterSeconds: 90 } : undefined,
  };
}
