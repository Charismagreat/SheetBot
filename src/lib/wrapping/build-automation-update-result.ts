import type { AutomationUpdateResult } from "./automation-update-result";

export function buildAutomationUpdateResult(input: {
  projectId: string;
  gasProjectId: string;
  scriptUrl: string;
  webAppUrl: string | null;
  deployedAt: string;
  comment: string | null;
  archiveId?: string | null;
  summary?: string;
  features?: string[];
  source?: "ai" | "agent" | "fallback";
  tokens: { deducted: number; remainingBalance: number };
  pendingSettlement?: { settlementId: string };
}): AutomationUpdateResult {
  return {
    success: true,
    project: { id: input.projectId },
    deployment: {
      gasProjectId: input.gasProjectId,
      scriptUrl: input.scriptUrl,
      webAppUrl: input.webAppUrl,
      deployedAt: input.deployedAt,
      archiveId: input.archiveId ?? null,
      comment: input.comment,
    },
    automation: {
      summary: input.summary ?? input.comment ?? "Automation updated",
      features: input.features ?? [],
      source: input.source ?? "agent",
    },
    tokens: input.tokens,
    pendingSettlement: input.pendingSettlement,
  };
}
