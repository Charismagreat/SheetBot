import { describe, expect, it } from "vitest";
import { sanitizeGasScriptCode } from "../gas-sanitizer";
import { COPILOT_SIDEBAR_HTML } from "../templates/copilot-sidebar";
import { SHEETBOT_COPILOT_SIDEBAR_TEMPLATE_URL } from "../templates/gas-copilot-sidebar-runtime";

describe("sanitizeGasScriptCode copilot sidebar", () => {
  it("replaces createTemplateFromFile Sidebar with remote template loader", () => {
    const wrong = `
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚀 SheetBot 메뉴')
    .addItem('🤖 SheetBot AI 코파일럿', 'showAiCopilotSidebar')
    .addToUi();
}
function showAiCopilotSidebar() {
  var template = HtmlService.createTemplateFromFile('Sidebar');
  SpreadsheetApp.getUi().showSidebar(template.evaluate().setWidth(360));
}
`;
    const out = sanitizeGasScriptCode(wrong);
    expect(out).toContain(SHEETBOT_COPILOT_SIDEBAR_TEMPLATE_URL);
    expect(out).not.toContain("createTemplateFromFile('Sidebar')");
    expect(out).toContain(COPILOT_SIDEBAR_HTML.slice(0, 80));
  });
});
