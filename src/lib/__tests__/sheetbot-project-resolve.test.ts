import { describe, expect, it } from "vitest";
import { normalizeSheetbotProjectId } from "../sheetbot-project-id";

describe("normalizeSheetbotProjectId", () => {
  it("uses sheetbot primary id, not gas project id", () => {
    expect(
      normalizeSheetbotProjectId({
        id: "proj_123_abc",
        gas_project_id: "1Iwxjv0qC1ZuljE6J1DN0pH1FGmw_XeM5I3TFURAkMx6L7HMITIE0qqYJ",
      }),
    ).toBe("proj_123_abc");
  });

  it("strips Excel-style .0 suffix from numeric ids", () => {
    expect(normalizeSheetbotProjectId({ id: "12345.0" })).toBe("12345");
  });
});
