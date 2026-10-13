import { buildGasCopilotSidebarRuntime } from "@/lib/templates/gas-copilot-sidebar-runtime";

export type BuildSheetBotBaseGsOptions = {
  userEmail: string;
  includeCopilotSidebar: boolean;
};

/**
 * Server-owned Apps Script shell (Base.gs). Never sent to or emitted by the LLM.
 */
export function buildSheetBotBaseGs(options: BuildSheetBotBaseGsOptions): string {
  const email = String(options.userEmail || "user@example.com").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const copilotBlock = options.includeCopilotSidebar ? `\n${buildGasCopilotSidebarRuntime()}\n` : "";

  return `/**
 * SheetBot platform shell (Base.gs) — server-managed. User automation lives in UserAutomation.gs.
 */
var SHEETBOT_USER_EMAIL = "${email}";

function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu("🚀 SheetBot 메뉴");
  if (typeof registerSheetBotMenuItems_ === "function") {
    try {
      var extended = registerSheetBotMenuItems_(menu);
      if (extended) menu = extended;
    } catch (err) {
      Logger.log("registerSheetBotMenuItems_ error: " + err);
    }
  }
  menu.addSeparator();
  if (typeof showAiCopilotSidebar === "function") {
    menu.addItem("🤖 SheetBot AI 코파일럿", "showAiCopilotSidebar");
  }
  menu.addToUi();

  if (typeof installSheetBotTriggers_ === "function") {
    try {
      installSheetBotTriggers_();
    } catch (triggerErr) {
      Logger.log("installSheetBotTriggers_ error: " + triggerErr);
    }
  }

  if (typeof onSheetBotOpen_ === "function") {
    try {
      onSheetBotOpen_(e);
    } catch (openHookErr) {
      Logger.log("onSheetBotOpen_ error: " + openHookErr);
    }
  }
}

/** Shared helpers (signatures stable for UserAutomation.gs) */
function toast_(message, title, seconds) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      String(message || ""),
      String(title || "SheetBot"),
      Number(seconds || 3)
    );
  } catch (e) {}
}

function getSheetByName_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(String(name || ""));
  if (!sheet) {
    throw new Error("시트를 찾을 수 없습니다: " + name);
  }
  return sheet;
}

function getTunnelStatusData() {
  var startTime = new Date().getTime();
  try {
    if (typeof egdeskUserDataListTables === "function") {
      egdeskUserDataListTables();
    }
    return {
      success: true,
      elapsed: new Date().getTime() - startTime,
      serverName: "EGDesk Cloud",
      message: "터널 통신 준비 완료",
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
      elapsed: new Date().getTime() - startTime,
      message: "터널 점검 실패",
    };
  }
}
${copilotBlock}`;
}

/** Legacy single-file preview: Base + user file separated by marker. */
export function combineGasFilesForPreview(baseGs: string, userAutomationGs: string): string {
  return `${baseGs.trim()}\n\n// --- UserAutomation.gs ---\n\n${userAutomationGs.trim()}`;
}
