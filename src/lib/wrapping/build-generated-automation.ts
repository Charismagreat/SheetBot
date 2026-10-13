import type { GeneratedAutomation } from "./generated-automation";

export type GenerateDeployMetadata = {
  manifest: string;
  triggers: unknown[];
  generationSource: string;
  validationErrors?: string[];
};

export function buildGeneratedAutomation(bundle: {
  summary: string;
  features: string[];
  generationSource: string;
  userAutomationCode: string;
}): GeneratedAutomation {
  const source =
    bundle.generationSource === "noop"
      ? "noop"
      : bundle.generationSource === "fallback"
        ? "fallback"
        : "ai";

  return {
    summary: bundle.summary,
    features: bundle.features,
    source,
    userAutomationCode: bundle.userAutomationCode,
  };
}

export function buildGenerateApiData(
  bundle: {
    summary: string;
    features: string[];
    generationSource: string;
    userAutomationCode: string;
    manifest: string;
    triggers: unknown[];
    validationErrors?: string[];
    scriptCode?: string;
    scriptFiles?: Record<string, string>;
    baseCode?: string;
  },
  options?: { includeShellPreview?: boolean },
): GeneratedAutomation & GenerateDeployMetadata & { scriptCode?: string; scriptFiles?: Record<string, string>; baseCode?: string } {
  const automation = buildGeneratedAutomation(bundle);
  const base = {
    ...automation,
    manifest: bundle.manifest,
    triggers: bundle.triggers,
    generationSource: bundle.generationSource,
    validationErrors: bundle.validationErrors,
  };

  if (!options?.includeShellPreview) {
    return base;
  }

  return {
    ...base,
    scriptCode: bundle.scriptCode ?? bundle.userAutomationCode,
    scriptFiles: bundle.scriptFiles,
    baseCode: bundle.baseCode,
  };
}
