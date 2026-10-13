import { describe, expect, it } from "vitest";
import {
  assembleUserAutomationGs,
  validateUserAutomationFunctions,
} from "../gas/user-automation-schema";

describe("user-automation-schema", () => {
  it("noop produces minimal UserAutomation.gs", () => {
    const code = assembleUserAutomationGs({ noop: true });
    expect(code).toContain("onSheetBotOpen_");
    expect(code).not.toContain("function onOpen");
  });

  it("rejects reserved function names", () => {
    const result = validateUserAutomationFunctions([
      { name: "onOpen", code: "function onOpen() {}" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("wires menu items server-side", () => {
    const code = assembleUserAutomationGs({
      menuItems: [{ label: "Run", handler: "runJob" }],
      functions: [{ name: "runJob", code: "function runJob() { toast_('ok'); }" }],
    });
    expect(code).toContain("registerSheetBotMenuItems_");
    expect(code).toContain("runJob");
  });
});
