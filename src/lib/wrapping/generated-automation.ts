export type GeneratedAutomation = {
  summary: string;
  features: string[];
  source: "ai" | "noop" | "fallback";
  userAutomationCode: string;
};
