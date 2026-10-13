import { splitLegacyScriptCode } from "./deploy-script-files";

type AppsScriptReadCaller = (
  tool: string,
  args: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown>;

function readFileContent(readRes: unknown): string {
  if (typeof readRes === "string") return readRes;
  if (readRes && typeof readRes === "object") {
    const row = readRes as { content?: string; data?: string };
    return row.content || row.data || "";
  }
  return "";
}

/**
 * Pull latest GAS sources and resolve the user-owned automation file (multi-file layout first).
 */
export async function readRemoteGasAutomationSources(
  callAppsScriptTool: AppsScriptReadCaller,
  gasProjectId: string,
  visitorOptions?: Record<string, unknown>,
): Promise<{
  userAutomationGs: string;
  manifest: string;
  legacyCodeGs: string;
}> {
  await callAppsScriptTool(
    "apps_script_pull_from_google",
    { projectId: gasProjectId },
    visitorOptions,
  ).catch(() => null);

  let userAutomationGs = "";
  let legacyCodeGs = "";
  let manifest = "";

  try {
    const uaRes = await callAppsScriptTool(
      "apps_script_read_file",
      { projectId: gasProjectId, fileName: "UserAutomation.gs" },
      visitorOptions,
    );
    userAutomationGs = readFileContent(uaRes).trim();
  } catch {
    /* optional */
  }

  try {
    const codeRes = await callAppsScriptTool(
      "apps_script_read_file",
      { projectId: gasProjectId, fileName: "Code.gs" },
      visitorOptions,
    );
    legacyCodeGs = readFileContent(codeRes).trim();
  } catch {
    /* optional */
  }

  if (!userAutomationGs && legacyCodeGs) {
    const split = splitLegacyScriptCode(legacyCodeGs);
    userAutomationGs = split.userAutomationGs;
  }

  try {
    const manifestRes = await callAppsScriptTool(
      "apps_script_read_file",
      { projectId: gasProjectId, fileName: "appsscript.json" },
      visitorOptions,
    );
    manifest = readFileContent(manifestRes).trim();
  } catch {
    /* optional */
  }

  return { userAutomationGs, manifest, legacyCodeGs };
}
