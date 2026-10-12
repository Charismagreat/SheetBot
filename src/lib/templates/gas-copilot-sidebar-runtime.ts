import { COPILOT_SIDEBAR_HTML } from "@/lib/templates/copilot-sidebar";

/** Public URL served by GET /api/copilot/sidebar-template (COPILOT_SIDEBAR_HTML). */
export const SHEETBOT_COPILOT_SIDEBAR_TEMPLATE_URL =
  "https://sheetbot.cloud/api/copilot/sidebar-template";

/**
 * Apps Script: load copilot UI from SheetBot cloud; offline fallback matches COPILOT_SIDEBAR_HTML.
 */
export function buildGasCopilotSidebarRuntime(): string {
  return `function showAiCopilotSidebar() {
  var htmlOutput;
  try {
    var cb = new Date().getTime();
    var res = UrlFetchApp.fetch("${SHEETBOT_COPILOT_SIDEBAR_TEMPLATE_URL}?_cb=" + cb, {
      muteHttpExceptions: true,
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0",
        "Pragma": "no-cache"
      }
    });
    if (res.getResponseCode() === 200) {
      htmlOutput = HtmlService.createHtmlOutput(res.getContentText());
    }
  } catch (e) {
    Logger.log("원격 코파일럿 사이드바 로드 실패: " + e.message);
  }
  if (!htmlOutput) {
    htmlOutput = HtmlService.createHtmlOutput(getAiCopilotSidebarHtml());
  }
  htmlOutput.setTitle("🤖 SheetBot AI 코파일럿").setWidth(360);
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function getAiCopilotSidebarHtml() {
  return ${JSON.stringify(COPILOT_SIDEBAR_HTML)};
}`;
}
