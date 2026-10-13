export type WrapAutomationSource = "starter" | "fallback";

export type WrapResult = {
  success: boolean;
  idempotentReplay?: boolean;
  project: {
    id: string;
    name: string;
    spreadsheetId: string;
    sheetUrl: string;
    wrappedAt: string;
  };
  deployment: {
    gasProjectId: string;
    scriptUrl: string;
    webAppUrl: string | null;
    archiveId: string | null;
  };
  automation: {
    summary: string;
    features: string[];
    source: WrapAutomationSource;
  };
  agent: {
    bridgeUrl: string;
    promptTemplate: string;
  };
  tokens: { deducted: number; remainingBalance: number };
  pendingSettlement?: { settlementId: string };
};
