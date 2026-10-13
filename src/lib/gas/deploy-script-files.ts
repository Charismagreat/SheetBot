import { ensureStandardManifest, generateSecureEgdeskConfig, generateStandardTokenRecharge } from "@/lib/gas-manifest";
import { generateSheetBotClientGs } from "@/lib/gas/sheetbot-client-gs";
import {
  defaultSheetbotPublicApiBase,
  shouldDeploySheetbotRuntimeClient,
} from "@/lib/runtime/runtime-deploy";

type VisitorOptions = Record<string, unknown> | undefined;

type AppsScriptToolCaller = (
  tool: string,
  args: Record<string, unknown>,
  options?: VisitorOptions,
) => Promise<unknown>;

const CODE_GS_STUB = `// SheetBot splits automation across Base.gs and UserAutomation.gs.
// This file is intentionally empty to avoid duplicate onOpen handlers.
`;

/**
 * Production routes should call `pushFiles` in `sheetbot-deploy-service.ts` (wrap / updateAutomation).
 * This module is the only place that invokes `apps_script_push_to_google` for SheetBot shell deploys.
 */

/**
 * Push multi-file SheetBot layout to an Apps Script project (server-owned base + AI user file).
 */
export async function pushSheetBotGasProjectFiles(
  callAppsScriptTool: AppsScriptToolCaller,
  projectId: string,
  files: {
    baseGs: string;
    userAutomationGs: string;
    manifest?: string;
    userEmail: string;
    runtimeToken?: string;
    useRuntimeClient?: boolean;
  },
  visitorOptions?: VisitorOptions,
): Promise<void> {
  const useRuntime =
    files.useRuntimeClient ?? shouldDeploySheetbotRuntimeClient();

  if (!useRuntime) {
    await callAppsScriptTool(
      "apps_script_setup_egdesk_tunnel",
      { projectId, push: false },
      visitorOptions,
    ).catch(() => null);

    await callAppsScriptTool(
      "apps_script_write_file",
      {
        projectId,
        fileName: "EgdeskConfig.gs",
        content: generateSecureEgdeskConfig(files.userEmail),
      },
      visitorOptions,
    ).catch(() => null);
  } else {
    const clientGs = generateSheetBotClientGs({
      sheetbotApiBase: defaultSheetbotPublicApiBase(),
      runtimeToken: files.runtimeToken,
    });
    await callAppsScriptTool(
      "apps_script_write_file",
      { projectId, fileName: "SheetBotClient.gs", content: clientGs },
      visitorOptions,
    );
  }

  await callAppsScriptTool(
    "apps_script_write_file",
    {
      projectId,
      fileName: "TokenRecharge.gs",
      content: generateStandardTokenRecharge(),
    },
    visitorOptions,
  ).catch(() => null);

  await callAppsScriptTool(
    "apps_script_write_file",
    { projectId, fileName: "Base.gs", content: files.baseGs },
    visitorOptions,
  );

  await callAppsScriptTool(
    "apps_script_write_file",
    { projectId, fileName: "UserAutomation.gs", content: files.userAutomationGs },
    visitorOptions,
  );

  await callAppsScriptTool(
    "apps_script_write_file",
    { projectId, fileName: "Code.gs", content: CODE_GS_STUB },
    visitorOptions,
  );

  const manifest = ensureStandardManifest(files.manifest);
  await callAppsScriptTool(
    "apps_script_write_file",
    { projectId, fileName: "appsscript.json", content: manifest },
    visitorOptions,
  );

  await callAppsScriptTool("apps_script_push_to_google", { projectId }, visitorOptions);
}

/** `updateAutomation` default — user file only, same runtime token / shell files on sheet. */
export async function pushUserAutomationGsOnly(
  callAppsScriptTool: AppsScriptToolCaller,
  projectId: string,
  userAutomationGs: string,
  visitorOptions?: VisitorOptions,
): Promise<void> {
  await callAppsScriptTool(
    "apps_script_write_file",
    { projectId, fileName: "UserAutomation.gs", content: userAutomationGs },
    visitorOptions,
  );
  await callAppsScriptTool("apps_script_push_to_google", { projectId }, visitorOptions);
}

/** Legacy single Code.gs string (e.g. gas-bridge agent injection) → split if marker present. */
export function splitLegacyScriptCode(scriptCode: string): {
  baseGs?: string;
  userAutomationGs: string;
} {
  const marker = "// --- UserAutomation.gs ---";
  if (scriptCode.includes(marker)) {
    const [base, user] = scriptCode.split(marker);
    return { baseGs: base.trim(), userAutomationGs: user.trim() };
  }
  return { userAutomationGs: scriptCode.trim() };
}
