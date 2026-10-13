/**
 * Target runtime client for wrapped sheets (Phase 1.7 / 6-lite).
 * Deployed when `USE_SHEETBOT_RUNTIME` or runtime wrap path is enabled.
 */
export function generateSheetBotClientGs(options: {
  sheetbotApiBase: string;
  /** Set on wrap — stored in Script Properties on first load. */
  runtimeToken?: string;
}): string {
  const base = options.sheetbotApiBase.replace(/\/$/, "");
  const seedToken = (options.runtimeToken || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `/**
 * SheetBot runtime client — do not edit (server-owned).
 * Calls SheetBot /api/runtime/call with per-project runtime token.
 */

function sheetbotEnsureRuntimeToken_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SHEETBOT_RUNTIME_TOKEN") && "${seedToken}") {
    props.setProperty("SHEETBOT_RUNTIME_TOKEN", "${seedToken}");
  }
}

function sheetbotCall_(service, tool, args) {
  sheetbotEnsureRuntimeToken_();
  var idempotencyKey = Utilities.getUuid();
  var scriptId = ScriptApp.getScriptId();
  var payload = {
    scriptId: scriptId,
    service: service,
    tool: tool,
    arguments: args || {},
    idempotencyKey: idempotencyKey
  };
  var url = "${base}/api/runtime/call";
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("SHEETBOT_RUNTIME_TOKEN") || "";
  if (!token) {
    return sheetbotHandleApiError_({ code: "INVALID_RUNTIME_AUTH", message: "runtime token missing" });
  }
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var bodyText = res.getContentText() || "{}";
  var parsed;
  try { parsed = JSON.parse(bodyText); } catch (e) { parsed = { success: false, error: { code: "INTERNAL_ERROR", message: bodyText } }; }
  if (code >= 400 || parsed.success === false) {
    return sheetbotHandleApiError_(parsed.error || { code: "INTERNAL_ERROR", message: bodyText, httpStatus: code });
  }
  return parsed;
}

function sheetbotHandleApiError_(err) {
  var code = (err && err.code) ? err.code : "INTERNAL_ERROR";
  var details = (err && err.details) ? err.details : {};
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      if (typeof showTokenRechargeSidebar === "function") {
        showTokenRechargeSidebar({
          reason: "low_balance",
          balance: details.balance,
          required: details.required
        });
      } else if (typeof openTokenRechargeModal === "function") {
        openTokenRechargeModal();
      }
      break;
    case "SPEND_CAP_EXCEEDED":
      SpreadsheetApp.getUi().alert("이 시트의 AI 사용 한도에 도달했습니다. 내일 다시 시도하거나 대시보드에서 한도를 확인하세요.");
      break;
    case "RATE_LIMITED":
      SpreadsheetApp.getUi().alert("요청이 많습니다. 잠시 후 다시 시도해 주세요.");
      break;
    case "MANIFEST_VIOLATION":
      SpreadsheetApp.getUi().alert("이 시트에서는 사용할 수 없는 기능입니다.");
      break;
    case "NOT_WRAPPED":
    case "INVALID_RUNTIME_AUTH":
      SpreadsheetApp.getUi().alert("시트봇 연결이 만료되었습니다. sheetbot.cloud에서 다시 래핑해 주세요.");
      break;
    default:
      console.warn("[SheetBot]", code, err && err.message);
      SpreadsheetApp.getUi().alert((err && err.message) || "시트봇 요청에 실패했습니다.");
  }
  return { ok: false, code: code, error: err };
}
`;
}
