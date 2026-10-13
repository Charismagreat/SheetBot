import {
  BILLING_CHARS_PER_TOKEN,
  calculateBillableTokens,
  estimateTokensFromCharLength,
  normalizeAiCallerUsage,
} from "../token-calculator";

describe("token-calculator", () => {
  it("estimates from char length with ÷ 2.5", () => {
    expect(estimateTokensFromCharLength(25)).toBe(10);
    expect(BILLING_CHARS_PER_TOKEN).toBe(2.5);
  });

  it("uses API usage when provided", () => {
    const r = calculateBillableTokens({
      promptText: "x".repeat(1000),
      responseText: "y".repeat(1000),
      usage: { promptTokens: 100, completionTokens: 50 },
      tokenMultiplier: 2,
    });
    expect(r.promptTokens).toBe(100);
    expect(r.completionTokens).toBe(50);
    expect(r.rawTotalTokens).toBe(150);
    expect(r.billableTokens).toBe(300);
  });

  it("falls back to char estimate when usage missing", () => {
    const r = calculateBillableTokens({
      promptText: "a".repeat(25),
      responseText: "b".repeat(25),
      tokenMultiplier: 1.1,
    });
    expect(r.promptTokens).toBe(10);
    expect(r.completionTokens).toBe(10);
    expect(r.billableTokens).toBe(Math.round(20 * 1.1));
  });

  it("normalizes snake_case usage from AI Caller", () => {
    expect(
      normalizeAiCallerUsage({ prompt_tokens: 12, completion_tokens: 8 }),
    ).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: undefined });
  });
});
