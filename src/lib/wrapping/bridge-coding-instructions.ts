export function buildBridgeCodingInstructions(input: {
  postEndpoint: string;
  deploymentTokenCost: number;
  useRuntimeClient: boolean;
}) {
  const { postEndpoint, deploymentTokenCost, useRuntimeClient } = input;
  const mcpEntry = useRuntimeClient ? "sheetbotCall_" : "egdeskToolsCall";
  const shellNote = useRuntimeClient
    ? "SheetBot runtime (`SheetBotClient.gs`) — MCP via `sheetbotCall_(service, tool, args)`."
    : "Legacy EGDesk tunnel (`EgdeskConfig.gs`, `EgdeskClient.gs`) — MCP via `egdeskToolsCall(...)`. Prefer migrating with `SHEETBOT_RUNTIME_DEPLOY=1` on wrap.";

  return {
    overview: `SheetBot multi-file shell (Base.gs + UserAutomation.gs). ${shellNote}`,
    targetFile: "UserAutomation.gs",
    deploymentTokenCost,
    tokenPolicy: `코드 배포(POST) 완료 시 프로젝트 소유자 토큰 지갑에서 ${deploymentTokenCost} 토큰이 차감됩니다. (0 설정 시 무료)`,
    absoluteRules: [
      `1. [UserAutomation only]: 수정·제출은 **UserAutomation.gs** 내용만 작성하세요. Base.gs / ${useRuntimeClient ? "SheetBotClient.gs" : "EgdeskConfig.gs"} 는 서버가 관리합니다.`,
      `2. [MCP 호출]: 시트 런타임 AI는 주입된 **${mcpEntry}** 를 사용하세요. 사용자에게 별도 API 키를 요구하지 마세요.`,
      "3. [실제 헤더 1:1 매핑]: spreadsheetAnalysis의 suggestedHeaderRow·dataStartRow를 준수해 신규 데이터를 기입하세요.",
      "4. [메뉴·트리거]: onOpen/onEdit는 UserAutomation.gs의 registerSheetBotMenuItems_ / installSheetBotTriggers_ / onSheetBotOpen_ / onSheetBotEdit_ 패턴을 따르세요. 상단 메뉴는 '🚀 SheetBot 메뉴' + 코파일럿 일원화 규칙을 유지하세요.",
      "5. [코파일럿 사이드바]: showAiCopilotSidebar()는 UrlFetchApp으로 https://sheetbot.cloud/api/copilot/sidebar-template 을 불러 HtmlService.createHtmlOutput 후 showSidebar 하세요.",
      "6. [AI JSON]: Base.gs의 egdeskExtractAiText / egdeskExtractAiJson 또는 동등 유틸을 사용하세요. parseAiCallerResponse 패턴을 UserAutomation에 두지 마세요.",
      "7. [빈 시트 탭]: 기본 탭 1개만 유지 — insertSheet로 불필요한 탭을 추가하지 말고 setName으로 이름만 변경하세요.",
      "8. [아카이브 이력]: previousArchiveHistory의 함수명·규칙과 충돌하지 않게 설계하세요. POST 성공 시 서버가 '[SheetBot] 아카이빙'에 작업을 기록합니다.",
    ],
    postEndpoint,
    postPayloadExample: {
      userAutomationCode: "/* UserAutomation.gs 전체 (권장) */",
      scriptCode: "/* userAutomationCode 와 동일 — 레거시 alias */",
      manifest: "/* (선택) appsscript.json. 생략 시 기존 유지 */",
      comment: "/* 변경 요약 */",
    },
  };
}

export function shellContractCallableFromUser(useRuntimeClient: boolean) {
  if (useRuntimeClient) {
    return [
      { name: "toast_", file: "Base.gs" as const },
      { name: "getSheetByName_", file: "Base.gs" as const },
      { name: "sheetbotCall_", file: "SheetBotClient.gs" as const },
    ];
  }
  return [
    { name: "toast_", file: "Base.gs" as const },
    { name: "getSheetByName_", file: "Base.gs" as const },
    { name: "getTunnelStatusData", file: "Base.gs" as const },
    { name: "egdeskToolsCall", file: "EgdeskClient.gs" as const },
  ];
}
