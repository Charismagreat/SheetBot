/** Minimal starter pushed on first `wrap()` — agents replace via `updateAutomation`. */
export const STARTER_USER_AUTOMATION = `/**
 * SheetBot — UserAutomation.gs (starter)
 * Implement menus, triggers, and business handlers here.
 */

function registerSheetBotMenuItems_(menu) {
  return menu;
}

function installSheetBotTriggers_() {
  // Example: ScriptApp.newTrigger('onSheetBotDaily_').timeBased().everyDays(1).atHour(9).create();
}

function onSheetBotOpen_(e) {
  toast_('SheetBot이 연결되었습니다.', 'SheetBot', 3);
}

function onSheetBotEdit_(e) {
  // Optional edit handler
}
`;

export const STARTER_WRAP_SUMMARY = "SheetBot 스타터 자동화 (메뉴·트리거 훅)";
export const STARTER_WRAP_FEATURES = ["SheetBot 메뉴 훅", "트리거 설치 훅", "onOpen 후처리 훅"];
