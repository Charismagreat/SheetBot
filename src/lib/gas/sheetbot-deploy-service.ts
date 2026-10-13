import crypto from "crypto";
import {
  callAppsScriptTool,
  queryTable,
  updateRows,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";
import { getAiModelSettings } from "@/lib/ai-settings";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { ensureBridgeTokenForProject } from "@/lib/bridge-token-persist";
import { ensureStandardManifest } from "@/lib/gas-manifest";
import { buildSheetBotBaseGs } from "@/lib/gas/sheetbot-base-gs";
import {
  pushSheetBotGasProjectFiles,
  pushUserAutomationGsOnly,
  splitLegacyScriptCode,
} from "@/lib/gas/deploy-script-files";
import { sanitizeGasScriptCode } from "@/lib/gas-sanitizer";
import {
  STARTER_USER_AUTOMATION,
  STARTER_WRAP_FEATURES,
  STARTER_WRAP_SUMMARY,
} from "@/lib/gas/starter-user-automation";
import { recordToArchiveSheet } from "@/lib/agent-archive-helper";
import { buildAutomationUpdateResult } from "@/lib/wrapping/build-automation-update-result";
import { buildWrapResult } from "@/lib/wrapping/build-wrap-result";
import {
  getWrappedAt,
  isProjectWrapped,
  isWrapLockActive,
  WRAP_LOCK_TTL_MS,
} from "@/lib/wrapping/project-wrapped";
import type { AutomationUpdateResult } from "@/lib/wrapping/automation-update-result";
import type { WrapResult } from "@/lib/wrapping/wrap-result";
import {
  insufficientBalanceError,
  notWrappedError,
  SheetbotServiceError,
  wrapInProgressError,
} from "@/lib/wrapping/sheetbot-api-error";
import {
  checkTokenBalance,
  recordPendingWalletSettlement,
  settleWalletDebit,
} from "@/lib/token-wallet";
import { shouldDeploySheetbotRuntimeClient } from "@/lib/runtime/runtime-deploy";
import { issueRuntimeTokenForProject } from "@/lib/runtime/runtime-token-persist";

export type PushFilesMode = "full" | "user-only";

export type PushFilesInput = {
  gasProjectId: string;
  userEmail: string;
  projectId?: string;
  baseGs: string;
  userAutomationGs: string;
  manifest?: string;
  mode: PushFilesMode;
  visitorOptions?: WorkspaceVisitorCallOptions;
  runtimeToken?: string;
  useRuntimeClient?: boolean;
};

export type PushFilesResult = {
  pushReceiptId: string;
};

/** Sole production entry that calls `apps_script_push_to_google` (via deploy-script-files). */
export async function pushFiles(input: PushFilesInput): Promise<PushFilesResult> {
  const manifest = ensureStandardManifest(input.manifest);
  if (input.mode === "user-only") {
    await pushUserAutomationGsOnly(
      callAppsScriptTool,
      input.gasProjectId,
      input.userAutomationGs,
      input.visitorOptions,
    );
  } else {
    await pushSheetBotGasProjectFiles(
      callAppsScriptTool,
      input.gasProjectId,
      {
        baseGs: input.baseGs,
        userAutomationGs: input.userAutomationGs,
        manifest,
        userEmail: input.userEmail,
        runtimeToken: input.runtimeToken,
        useRuntimeClient: input.useRuntimeClient,
      },
      input.visitorOptions,
    );
  }

  const pushReceiptId = computePushReceiptId(
    input.gasProjectId,
    input.mode,
    input.userAutomationGs.length,
    manifest.length,
  );
  return { pushReceiptId };
}

export function computePushReceiptId(
  gasProjectId: string,
  mode: PushFilesMode,
  userAutomationLength: number,
  manifestLength: number,
): string {
  const receiptPayload = `${gasProjectId}:${mode}:${userAutomationLength}:${manifestLength}`;
  return crypto.createHash("sha256").update(receiptPayload).digest("hex").slice(0, 24);
}

async function assertNoSpreadsheetWrapConflict(
  spreadsheetId: string,
  projectId: string,
  userEmail: string,
): Promise<void> {
  const res = await queryTable("sheetbot_projects", {
    filters: { user_email: userEmail.toLowerCase().trim() },
    limit: 100,
  }).catch(() => ({ rows: [] }));

  for (const row of res.rows || []) {
    if (String(row.id) === projectId) continue;
    if (String(row.spreadsheet_id || "") !== spreadsheetId) continue;
    if (isWrapLockActive(row)) {
      throw wrapInProgressError(Math.ceil(WRAP_LOCK_TTL_MS / 1000));
    }
    if (getWrappedAt(row) && row.gas_project_id) {
      throw new SheetbotServiceError({
        code: "CONFLICT",
        message: "이 스프레드시트는 이미 다른 SheetBot 프로젝트에 래핑되어 있습니다.",
        httpStatus: 409,
        details: { conflictReason: "already_wrapped" },
      });
    }
  }
}

export type SettlePushFeeResult = {
  deducted: number;
  remainingBalance: number;
  pendingSettlement?: { settlementId: string };
};

export async function settlePushFee(options: {
  userEmail: string;
  projectId: string;
  pushReceiptId: string;
  purpose: string;
  caller: string;
  preflightBalance?: boolean;
}): Promise<SettlePushFeeResult> {
  const aiSettings = await getAiModelSettings();
  const fee = aiSettings.agentBridgeDeploymentTokens ?? 500;
  if (fee <= 0) {
    const wallet = await checkTokenBalance(options.userEmail, 0);
    return { deducted: 0, remainingBalance: wallet.balance };
  }

  if (options.preflightBalance) {
    const pre = await checkTokenBalance(options.userEmail, fee);
    if (!pre.allowed) {
      throw insufficientBalanceError(pre.balance, fee);
    }
  }

  const idempotencyKey = `gas-push:${options.projectId}:${options.pushReceiptId}`;
  const settled = await settleWalletDebit({
    userEmail: options.userEmail,
    amount: fee,
    idempotencyKey,
    kind: "gas-push",
    metadata: { projectId: options.projectId, pushReceiptId: options.pushReceiptId },
    allowDebt: true,
  });

  if (settled.status === "insufficient_funds") {
    const settlementId = await recordPendingWalletSettlement({
      userEmail: options.userEmail,
      amount: fee,
      idempotencyKey,
      kind: "gas-push",
      projectId: options.projectId,
    });
    return {
      deducted: 0,
      remainingBalance: settled.balance,
      pendingSettlement: { settlementId },
    };
  }

  if (settled.status === "pending_settlement") {
    return {
      deducted: 0,
      remainingBalance: (await checkTokenBalance(options.userEmail, 0)).balance,
      pendingSettlement: { settlementId: settled.settlementId },
    };
  }

  void recordAiUsageLog({
    userEmail: options.userEmail,
    userName: "프로젝트 소유자",
    caller: options.caller,
    purpose: options.purpose,
    model: "agent-bridge-deployment",
    promptTokens: 0,
    completionTokens: settled.deducted,
    totalTokens: settled.deducted,
    promptText: options.purpose,
  });

  return { deducted: settled.deducted, remainingBalance: settled.newBalance };
}

async function loadProjectById(projectId: string): Promise<Record<string, unknown> | null> {
  const res = await queryTable("sheetbot_projects", {
    filters: { id: projectId },
    limit: 1,
  }).catch(() => ({ rows: [] }));
  const row = (res.rows || [])[0];
  return row ?? null;
}

async function resolveOrCreateBoundGasProject(options: {
  project: Record<string, unknown>;
  spreadsheetId: string;
  visitorOptions?: WorkspaceVisitorCallOptions;
  initialUserCode?: string;
}): Promise<{ gasProjectId: string; scriptId: string; scriptUrl: string }> {
  let gasProjectId = String(options.project.gas_project_id || "");
  let scriptId = String(options.project.script_id || "");
  let scriptUrl = String(options.project.script_url || "");

  try {
    const listRes = await callAppsScriptTool("apps_script_list_projects", {}, options.visitorOptions);
    const existingProjects = Array.isArray(listRes) ? listRes : (listRes as any)?.result || [];
    const matched = existingProjects.find(
      (p: any) =>
        p.id === gasProjectId ||
        p.projectId === gasProjectId ||
        p.containerId === options.spreadsheetId ||
        p.spreadsheetId === options.spreadsheetId,
    );
    if (matched) {
      gasProjectId = matched.id || matched.projectId;
      scriptId = matched.scriptId || gasProjectId;
      scriptUrl = matched.scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
      return { gasProjectId, scriptId, scriptUrl };
    }
  } catch {
    /* list optional */
  }

  if (!gasProjectId) {
    const boundRes = await callAppsScriptTool(
      "apps_script_create_bound",
      {
        fileId: options.spreadsheetId,
        title: String(options.project.name || "SheetBot 자동화"),
        scriptCode: options.initialUserCode || STARTER_USER_AUTOMATION,
      },
      options.visitorOptions,
    );
    if (boundRes && ((boundRes as any).id || (boundRes as any).projectId)) {
      gasProjectId = (boundRes as any).id || (boundRes as any).projectId;
      scriptId = (boundRes as any).scriptId || gasProjectId;
      scriptUrl = (boundRes as any).scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
    }
  }

  if (!gasProjectId) {
    throw new SheetbotServiceError({
      code: "WRAP_PUSH_FAILED",
      message: "Google Apps Script 바운드 프로젝트를 생성하지 못했습니다.",
      httpStatus: 502,
    });
  }

  return { gasProjectId, scriptId, scriptUrl };
}

export type WrapProjectOptions = {
  projectId: string;
  userEmail: string;
  visitorOptions?: WorkspaceVisitorCallOptions;
  bridgeUrl: string;
  promptTemplate: string;
  userAutomationCode?: string;
  preflightBalance?: boolean;
};

export async function wrapProject(options: WrapProjectOptions): Promise<WrapResult> {
  const project = await loadProjectById(options.projectId);
  if (!project) {
    throw new SheetbotServiceError({
      code: "INTERNAL_ERROR",
      message: "프로젝트를 찾을 수 없습니다.",
      httpStatus: 404,
    });
  }

  const spreadsheetId = String(project.spreadsheet_id || "").trim();
  if (!spreadsheetId) {
    throw new SheetbotServiceError({
      code: "WRAP_SHEET_MISSING",
      message: "spreadsheet_id가 없습니다. 시트를 먼저 생성하거나 연결해 주세요.",
      httpStatus: 400,
    });
  }

  if (isProjectWrapped(project) && project.gas_project_id) {
    const token = await ensureBridgeTokenForProject(
      options.projectId,
      options.userEmail,
      project.bridge_token as string,
    );
    const wallet = await checkTokenBalance(options.userEmail, 0);
    return buildWrapResult({
      idempotentReplay: true,
      project: {
        id: options.projectId,
        name: String(project.name || ""),
        spreadsheetId,
        spreadsheetUrl: String(project.spreadsheet_url || ""),
        wrappedAt: getWrappedAt(project) || String(project.updated_at || new Date().toISOString()),
      },
      deployment: {
        gasProjectId: String(project.gas_project_id),
        scriptUrl: String(project.script_url || ""),
        webAppUrl: (project.webapp_url as string) || null,
      },
      bridgeUrl: options.bridgeUrl.replace(/token=[^&]+/, `token=${token}`),
      promptTemplate: options.promptTemplate,
      tokens: { deducted: 0, remainingBalance: wallet.balance },
    });
  }

  if (isWrapLockActive(project)) {
    throw wrapInProgressError();
  }

  await assertNoSpreadsheetWrapConflict(spreadsheetId, options.projectId, options.userEmail);

  const lockNow = new Date().toISOString();
  await updateRows(
    "sheetbot_projects",
    { wrap_started_at: lockNow, updated_at: lockNow },
    { filters: { id: options.projectId } },
  );

  const userAutomation = options.userAutomationCode?.trim() || STARTER_USER_AUTOMATION;
  const baseGs = buildSheetBotBaseGs({
    userEmail: options.userEmail,
    includeCopilotSidebar: true,
  });

  try {
    const authStatus = await callAppsScriptTool("apps_script_auth_status", {}, options.visitorOptions).catch(
      () => null,
    );
    if (authStatus && (authStatus as any).connected === false) {
      throw new SheetbotServiceError({
        code: "WRAP_OAUTH",
        message: (authStatus as any).error || "Google Workspace OAuth가 연결되지 않았습니다.",
        httpStatus: 403,
      });
    }

    const bound = await resolveOrCreateBoundGasProject({
      project,
      spreadsheetId,
      visitorOptions: options.visitorOptions,
      initialUserCode: userAutomation,
    });

    const useRuntimeClient = shouldDeploySheetbotRuntimeClient();
    let runtimeToken: string | undefined;
    if (useRuntimeClient) {
      let issued = await issueRuntimeTokenForProject(options.projectId);
      if (!issued) {
        issued = await issueRuntimeTokenForProject(options.projectId, { rotate: true });
      }
      runtimeToken = issued?.token;
    }

    const { pushReceiptId } = await pushFiles({
      gasProjectId: bound.gasProjectId,
      userEmail: options.userEmail,
      projectId: options.projectId,
      baseGs,
      userAutomationGs: userAutomation,
      manifest: String(project.manifest || ""),
      mode: "full",
      visitorOptions: options.visitorOptions,
      runtimeToken,
      useRuntimeClient,
    });

    const wrappedAt = new Date().toISOString();
    await updateRows(
      "sheetbot_projects",
      {
        gas_project_id: bound.gasProjectId,
        script_id: bound.scriptId,
        script_url: bound.scriptUrl,
        script_code: userAutomation,
        wrapped_at: wrappedAt,
        wrap_started_at: null,
        last_push_receipt_id: pushReceiptId,
        updated_at: wrappedAt,
      },
      { filters: { id: options.projectId } },
    );

    const token = await ensureBridgeTokenForProject(
      options.projectId,
      options.userEmail,
      project.bridge_token as string,
    );

    const fee = await settlePushFee({
      userEmail: options.userEmail,
      projectId: options.projectId,
      pushReceiptId,
      purpose: "SheetBot wrap (shell + starter)",
      caller: "sheetbot-wrap",
      preflightBalance: options.preflightBalance,
    });

    return buildWrapResult({
      project: {
        id: options.projectId,
        name: String(project.name || ""),
        spreadsheetId,
        spreadsheetUrl: String(project.spreadsheet_url || ""),
        wrappedAt,
      },
      deployment: {
        gasProjectId: bound.gasProjectId,
        scriptUrl: bound.scriptUrl,
        webAppUrl: (project.webapp_url as string) || null,
      },
      bridgeUrl: options.bridgeUrl.replace(/token=[^&]+/, `token=${token}`),
      promptTemplate: options.promptTemplate,
      tokens: { deducted: fee.deducted, remainingBalance: fee.remainingBalance },
      pendingSettlement: fee.pendingSettlement,
      automationSource: "starter",
    });
  } catch (err) {
    await updateRows(
      "sheetbot_projects",
      { wrap_started_at: null, updated_at: new Date().toISOString() },
      { filters: { id: options.projectId } },
    ).catch(() => null);
    if (err instanceof SheetbotServiceError) throw err;
    throw new SheetbotServiceError({
      code: "WRAP_PUSH_FAILED",
      message: err instanceof Error ? err.message : String(err),
      httpStatus: 502,
    });
  }
}

export type UpdateAutomationOptions = {
  project: Record<string, unknown>;
  userAutomationCode: string;
  manifest?: string;
  comment?: string;
  visitorOptions?: WorkspaceVisitorCallOptions;
  caller?: string;
  userAgent?: string;
  archive?: boolean;
  preflightBalance?: boolean;
  /** When true, re-push full shell (migration / shell version bump). */
  fullShellPush?: boolean;
};

export async function updateAutomation(options: UpdateAutomationOptions): Promise<AutomationUpdateResult> {
  if (!isProjectWrapped(options.project)) {
    throw notWrappedError();
  }

  const projectId = String(options.project.id);
  const userEmail = String(options.project.user_email || "");
  const sanitized = sanitizeGasScriptCode(options.userAutomationCode.trim());
  const split = splitLegacyScriptCode(sanitized);
  const userAutomationGs = split.userAutomationGs;
  const gasProjectId = String(options.project.gas_project_id || "");
  if (!gasProjectId) {
    throw new SheetbotServiceError({
      code: "NOT_WRAPPED",
      message: "Apps Script 프로젝트가 바인딩되지 않았습니다. wrap을 먼저 실행해 주세요.",
      httpStatus: 409,
    });
  }

  const baseGs =
    split.baseGs ||
    buildSheetBotBaseGs({
      userEmail,
      includeCopilotSidebar: true,
    });

  const authStatus = await callAppsScriptTool("apps_script_auth_status", {}, options.visitorOptions).catch(
    () => null,
  );
  if (authStatus && (authStatus as any).connected === false) {
    throw new SheetbotServiceError({
      code: "WRAP_OAUTH",
      message: (authStatus as any).error || "Google Workspace OAuth가 연결되지 않았습니다.",
      httpStatus: 403,
    });
  }

  const mode: PushFilesMode = options.fullShellPush ? "full" : "user-only";
  let pushReceiptId = "";
  try {
    const pushRes = await pushFiles({
      gasProjectId,
      userEmail,
      baseGs,
      userAutomationGs,
      manifest: options.manifest,
      mode,
      visitorOptions: options.visitorOptions,
    });
    pushReceiptId = pushRes.pushReceiptId;
  } catch (err) {
    throw new SheetbotServiceError({
      code: "WRAP_PUSH_FAILED",
      message: err instanceof Error ? err.message : String(err),
      httpStatus: 502,
    });
  }

  let webAppUrl = String(options.project.webapp_url || "");
  const deployBody = userAutomationGs + baseGs;
  if (deployBody.includes("doGet") || deployBody.includes("HtmlService")) {
    try {
      const deployRes = await callAppsScriptTool(
        "apps_script_create_deployment",
        {
          projectId: gasProjectId,
          access: "ANYONE_ANONYMOUS",
          executeAs: "USER_DEPLOYING",
          description: `[SheetBot] ${options.comment || "automation update"}`,
        },
        options.visitorOptions,
      );
      if (deployRes) {
        webAppUrl =
          (deployRes as any).webAppUrl ||
          (deployRes as any).url ||
          (deployRes as any).entryPoints?.[0]?.webApp?.url ||
          webAppUrl;
      }
    } catch {
      /* optional webapp */
    }
  }

  const deployedAt = new Date().toISOString();
  const finalManifest = ensureStandardManifest(options.manifest || String(options.project.manifest || ""));

  await updateRows(
    "sheetbot_projects",
    {
      script_code: userAutomationGs,
      manifest: finalManifest,
      webapp_url: webAppUrl,
      last_push_receipt_id: pushReceiptId,
      updated_at: deployedAt,
      ...(getWrappedAt(options.project) ? {} : { wrapped_at: deployedAt }),
    },
    { filters: { id: projectId } },
  );

  const fee = await settlePushFee({
    userEmail,
    projectId,
    pushReceiptId,
    purpose: options.comment || "Automation update",
    caller: options.caller || "sheetbot-update-automation",
    preflightBalance: options.preflightBalance ?? true,
  });

  let archiveId: string | null = null;
  if (options.archive && userEmail) {
    try {
      const archiveResult = await recordToArchiveSheet({
        userEmail,
        targetSpreadsheetId: String(options.project.spreadsheet_id || ""),
        targetSpreadsheetName: String(options.project.name || ""),
        scriptCode: sanitized,
        comment: options.comment || "Automation update",
        caller: options.userAgent || "AI Agent",
        visitorOptions: options.visitorOptions,
      });
      if (archiveResult?.success && archiveResult.spreadsheetId) {
        archiveId = archiveResult.spreadsheetId;
      }
    } catch {
      /* archive optional */
    }
  }

  return buildAutomationUpdateResult({
    projectId,
    gasProjectId,
    scriptUrl: String(options.project.script_url || `https://script.google.com/d/${gasProjectId}/edit`),
    webAppUrl: webAppUrl || null,
    deployedAt,
    comment: options.comment ?? null,
    archiveId,
    summary: options.comment || STARTER_WRAP_SUMMARY,
    features: STARTER_WRAP_FEATURES,
    source: "agent",
    tokens: { deducted: fee.deducted, remainingBalance: fee.remainingBalance },
    pendingSettlement: fee.pendingSettlement,
  });
}

/** Public API name per WRAPPING.md */
export const wrap = wrapProject;
