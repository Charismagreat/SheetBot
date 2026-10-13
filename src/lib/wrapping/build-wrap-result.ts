import type { WrapResult } from "./wrap-result";

export function buildWrapResult(input: {
  idempotentReplay?: boolean;
  project: {
    id: string;
    name: string;
    spreadsheetId: string;
    spreadsheetUrl: string;
    wrappedAt: string;
  };
  deployment: {
    gasProjectId: string;
    scriptUrl: string;
    webAppUrl: string | null;
    archiveId?: string | null;
  };
  bridgeUrl: string;
  promptTemplate: string;
  tokens: { deducted: number; remainingBalance: number };
  pendingSettlement?: { settlementId: string };
  automationSource?: "starter" | "fallback";
}): WrapResult {
  return {
    success: true,
    idempotentReplay: input.idempotentReplay,
    project: {
      id: input.project.id,
      name: input.project.name,
      spreadsheetId: input.project.spreadsheetId,
      sheetUrl: input.project.spreadsheetUrl,
      wrappedAt: input.project.wrappedAt,
    },
    deployment: {
      gasProjectId: input.deployment.gasProjectId,
      scriptUrl: input.deployment.scriptUrl,
      webAppUrl: input.deployment.webAppUrl,
      archiveId: input.deployment.archiveId ?? null,
    },
    automation: {
      summary: "SheetBot shell + starter automation",
      features: ["Base.gs shell", "UserAutomation.gs starter"],
      source: input.automationSource ?? "starter",
    },
    agent: {
      bridgeUrl: input.bridgeUrl,
      promptTemplate: input.promptTemplate,
    },
    tokens: input.tokens,
    pendingSettlement: input.pendingSettlement,
  };
}
