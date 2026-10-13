import type { WrapResult } from "./wrap-result";

/** Legacy quick-wrap JSON before Phase 2 wrap-by-default. */
export type LegacyQuickWrapResponse = {
  success: true;
  bridgeUrl: string;
  spreadsheetId?: string;
  token?: string;
  promptTemplate?: string;
  projectName?: string;
  projectId?: string;
};

export function isWrapResultPayload(data: unknown): data is WrapResult {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as WrapResult).success === true &&
    Boolean((data as WrapResult).agent?.bridgeUrl) &&
    Boolean((data as WrapResult).project?.id)
  );
}

/** Map `WrapResult` or legacy quick-wrap body to wrap page state. */
export function normalizeQuickWrapForClient(data: WrapResult | LegacyQuickWrapResponse) {
  if (isWrapResultPayload(data)) {
    return {
      bridgeUrl: data.agent.bridgeUrl,
      spreadsheetId: data.project.spreadsheetId,
      token: "",
      bridgePrompt: data.agent.promptTemplate,
      projectName: data.project.name,
      wrapResult: data,
    };
  }
  const legacy = data as LegacyQuickWrapResponse;
  return {
    bridgeUrl: legacy.bridgeUrl,
    spreadsheetId: legacy.spreadsheetId || "",
    token: legacy.token || "",
    bridgePrompt: legacy.promptTemplate || "",
    projectName: legacy.projectName,
    wrapResult: null as WrapResult | null,
  };
}
