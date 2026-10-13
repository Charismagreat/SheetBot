import { describe, expect, it } from "vitest";
import { computePushReceiptId } from "../gas/sheetbot-deploy-service";
import { splitLegacyScriptCode } from "../gas/deploy-script-files";

describe("sheetbot-deploy-service", () => {
  it("computePushReceiptId differs for full vs user-only push", () => {
    const full = computePushReceiptId("gas-1", "full", 100, 50);
    const userOnly = computePushReceiptId("gas-1", "user-only", 100, 50);
    expect(full).not.toBe(userOnly);
    expect(full).toHaveLength(24);
  });

  it("splitLegacyScriptCode isolates user automation", () => {
    const code = "// base\n// --- UserAutomation.gs ---\nfunction foo_() {}";
    const split = splitLegacyScriptCode(code);
    expect(split.baseGs).toContain("base");
    expect(split.userAutomationGs).toContain("foo_");
  });
});
