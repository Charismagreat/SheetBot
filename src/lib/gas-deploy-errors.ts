const GENERIC_PUSH_FAILURE =
  "Code.gs를 Google Apps Script에 푸시하지 못했습니다. EGDesk 로그에서 apps_script_write_file / apps_script_push_to_google 오류를 확인해 주세요.";

const QUOTA_PUSH_FAILURE =
  "Google Apps Script API 호출 한도(분당 관리 요청)에 도달했습니다. 1~2분 기다린 뒤 배포를 한 번만 다시 시도해 주세요. 연속 클릭·재시도는 한도를 더 빨리 소진합니다.";

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
  const combined = gasDeployErrors.join("\n");
  if (isAppsScriptManagementQuotaError(combined)) {
    return QUOTA_PUSH_FAILURE;
  }
  return GENERIC_PUSH_FAILURE;
}
