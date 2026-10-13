import { describe, expect, it } from "vitest";
import { buildGenerateApiData, buildGeneratedAutomation } from "../wrapping/build-generated-automation";

describe("buildGeneratedAutomation", () => {
  it("maps generationSource to GeneratedAutomation.source", () => {
    expect(
      buildGeneratedAutomation({
        summary: "s",
        features: ["a"],
        generationSource: "noop",
        userAutomationCode: "// ua",
      }).source,
    ).toBe("noop");
  });

  it("omits shell preview fields by default", () => {
    const data = buildGenerateApiData({
      summary: "s",
      features: [],
      generationSource: "ai",
      userAutomationCode: "// ua",
      manifest: "{}",
      triggers: [],
      scriptCode: "// combined",
      baseCode: "// base",
      scriptFiles: { "UserAutomation.gs": "// ua" },
    });
    expect(data.userAutomationCode).toBe("// ua");
    expect(data.scriptCode).toBeUndefined();
    expect(data.baseCode).toBeUndefined();
    expect(data.scriptFiles).toBeUndefined();
  });

  it("includes shell preview when requested", () => {
    const data = buildGenerateApiData(
      {
        summary: "s",
        features: [],
        generationSource: "ai",
        userAutomationCode: "// ua",
        manifest: "{}",
        triggers: [],
        scriptCode: "// combined",
        baseCode: "// base",
      },
      { includeShellPreview: true },
    );
    expect(data.scriptCode).toBe("// combined");
    expect(data.baseCode).toBe("// base");
  });
});
