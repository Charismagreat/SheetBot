/**
 * 🚀 Google Apps Script 코드 자동 정제 및 표준화 유틸리티 (gas-sanitizer)
 * 
 * 모든 배포 창구(generate API, gas-bridge API 등)에서 공통으로 호출되어,
 * LLM이나 외부 에이전트가 생성한 코드의 상단 메뉴를 '단일 코파일럿 사이드바' 표준 규격으로 강제 보정합니다.
 */

export function sanitizeGasScriptCode(scriptCode: string): string {
  if (!scriptCode || typeof scriptCode !== "string") {
    return scriptCode;
  }

  let code = scriptCode;

  // 1. 메뉴명 고정: ui.createMenu('...')를 무조건 ui.createMenu('🚀 SheetBot 메뉴')로 100% 통일
  code = code.replace(
    /ui\.createMenu\s*\(\s*(['"`]).*?\1\s*\)/g,
    "ui.createMenu('🚀 SheetBot 메뉴')"
  );

  // 2. 상단 메뉴 극단적 슬림화 보정:
  //    '토큰 충전' 및 '사용법/가이드' 개별 항목 제거 (코파일럿 사이드바 내부로 100% 일원화)
  code = code.replace(
    /\.addItem\s*\(\s*['"`][^'"`]*?(토큰\s*잔액|토큰\s*충전|즉시\s*충전)[^'"`]*?['"`]\s*,\s*['"`]openTokenRechargeModal['"`]\s*\)/g,
    ""
  );
  code = code.replace(
    /\.addItem\s*\(\s*['"`][^'"`]*?(사용법|활용사례|가이드)[^'"`]*?['"`]\s*,\s*['"`]openSheetBotGuide['"`]\s*\)/g,
    ""
  );

  // 3. 'showAiCopilotSidebar' 단일 제어 메뉴 자가 보정: 누락 시 구분선과 함께 자동 주입
  if (!code.includes("showAiCopilotSidebar")) {
    if (code.includes(".addToUi()")) {
      code = code.replace(
        /\.addToUi\s*\(\s*\)/g,
        ".addSeparator()\n    .addItem('🤖 SheetBot AI 코파일럿', 'showAiCopilotSidebar')\n    .addToUi()"
      );
    }
  }

  // 4. openTokenRechargeModal 함수 정의 부재 시 자동 보강 (사이드바 내부 호출용)
  if (!/function\s+openTokenRechargeModal\s*\(/.test(code)) {
    code += `\n\nfunction openTokenRechargeModal() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud/billing","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#059669;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">💳 SheetBot 토큰 충전 센터</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 창이 열리지 않으면 아래 버튼을 클릭하세요.</div><a href="https://sheetbot.cloud/billing" target="_blank" class="btn">토큰 충전 페이지 열기</a></body></html>'
  ).setWidth(340).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, "💳 SheetBot 토큰 충전 센터");
}`;
  }

  // 5. openSheetBotGuide 함수 정의 부재 시 자동 보강 (링크 대상: https://sheetbot.cloud/use-cases)
  if (!/function\s+openSheetBotGuide\s*\(/.test(code)) {
    code += `\n\nfunction openSheetBotGuide() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><base target="_blank"><script>window.onload=function(){window.open("https://sheetbot.cloud/use-cases","_blank");google.script.host.close();};</script><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f8fafc;color:#334155;}.btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:12px;}</style></head><body><div style="font-weight:bold;font-size:13px;margin-bottom:6px;">🌐 SheetBot 활용사례 및 가이드로 이동합니다</div><div style="font-size:11px;color:#64748b;margin-bottom:10px;">새 탭이 열리지 않으면 아래를 클릭하세요.</div><a href="https://sheetbot.cloud/use-cases" target="_blank" class="btn">sheetbot.cloud/use-cases 바로가기</a></body></html>'
  ).setWidth(340).setHeight(130);
  SpreadsheetApp.getUi().showModalDialog(html, "SheetBot 사용법 및 활용사례");
}`;
  }

  return code;
}
