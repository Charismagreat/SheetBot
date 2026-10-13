import { describe, expect, it } from "vitest";
import {
  isRuntimeToolExposed,
  SHEET_RUNTIME_TOOL_EXPOSURE,
} from "../runtime/sheet-mcp-manifest";

describe("sheet-mcp-manifest", () => {
  it("allows ai-caller and user-data tools from catalog", () => {
    expect(isRuntimeToolExposed("ai-caller", "ai_caller_call")).toBe(true);
    expect(isRuntimeToolExposed("user-data", "user_data_query")).toBe(true);
  });

  it("excludes phone per owner decision", () => {
    expect(isRuntimeToolExposed("phone", "any_tool")).toBe(false);
    expect(SHEET_RUNTIME_TOOL_EXPOSURE.some((r) => r.service === "phone")).toBe(false);
  });
});
