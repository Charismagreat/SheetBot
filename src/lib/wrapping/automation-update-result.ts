export type AutomationUpdateResult = {
  success: boolean;
  project: { id: string };
  deployment: {
    gasProjectId: string;
    scriptUrl: string;
    webAppUrl: string | null;
    deployedAt: string;
    archiveId: string | null;
    comment: string | null;
  };
  automation: {
    summary: string;
    features: string[];
    source: "ai" | "agent" | "fallback";
  };
  tokens: { deducted: number; remainingBalance: number };
  pendingSettlement?: { settlementId: string };
};
