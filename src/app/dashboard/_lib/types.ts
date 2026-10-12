export type DashboardAlertMessage = {
  type: "success" | "error";
  text: string;
};

export type DashboardWalletSummary = {
  balanceTokens: number;
  totalPurchasedTokens?: number;
  totalUsedTokens?: number;
  tier: string;
};
