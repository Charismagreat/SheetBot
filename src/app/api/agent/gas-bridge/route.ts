export const dynamic = "force-dynamic";

/**
 * Agent bridge (WRAPPING.md): GET = context + shellContract; POST = `updateAutomation` only (not wrap).
 * Requires wrapped project for POST; GET allowed when spreadsheet is linked (migration).
 */

import { NextResponse, NextRequest } from "next/server";
import { getCurrentVisitorSessionId, isCurrentUserAdmin } from "@/lib/auth";
import {
  queryTable,
  updateRows,
  callAppsScriptTool,
  getSpreadsheetFullContext,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getAiModelSettings } from "@/lib/ai-settings";
import { sanitizeGasScriptCode } from "@/lib/gas-sanitizer";
import { getArchiveHistory } from "@/lib/agent-archive-helper";
import { resolveGasBridgePostEndpoint } from "@/lib/bridge-public-url";
import { updateAutomation } from "@/lib/gas/sheetbot-deploy-service";
import { isBridgeGetAllowed } from "@/lib/wrapping/project-wrapped";
import {
  RESERVED_GAS_FUNCTION_NAMES,
} from "@/lib/gas/user-automation-schema";
import {
  SHEET_MCP_MANIFEST_VERSION,
  runtimeToolsForShellContract,
  SHEET_RUNTIME_TOOL_EXPOSURE,
} from "@/lib/runtime/sheet-mcp-manifest";
import { shouldDeploySheetbotRuntimeClient } from "@/lib/runtime/runtime-deploy";
import { SheetbotServiceError, sheetbotErrorResponse } from "@/lib/wrapping/sheetbot-api-error";
import { readRemoteGasAutomationSources } from "@/lib/gas/read-remote-gas-files";
import {
  buildBridgeCodingInstructions,
  shellContractCallableFromUser,
} from "@/lib/wrapping/bridge-coding-instructions";

function buildBridgeVisitorOptions(
  visitorSessionId: string | null | undefined,
): WorkspaceVisitorCallOptions {
  if (!visitorSessionId) return {};
  return {
    asVisitor: true,
    visitorSessionId,
  };
}

/**
 * 브릿지 토큰을 통해 프로젝트를 조회하고 삭제(소프트 삭제/PENDING_DELETE/TRASHED) 및 소유자 탈퇴 여부를 검증합니다.
 * 차단 사유 발생 시 HTTP 410 Gone을 즉각 반환합니다.
 */
async function findAndValidateBridgeProject(token: string): Promise<{
  project?: any;
  errorResponse?: NextResponse;
}> {
  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "토큰(?token=...)이 필요합니다." },
        { status: 400 }
      ),
    };
  }

  let rawProject: any = null;
  let targetProjectId = token;

  if (token.startsWith("sec_")) {
    const tokenRes = await queryTable("sheetbot_bridge_tokens", {
      filters: { token },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (tokenRes.rows && tokenRes.rows.length > 0) {
      const tokenRow = tokenRes.rows[0];
      if (tokenRow.deleted_at) {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              code: "TOKEN_REVOKED",
              error: "해지되었거나 만료된 브릿지 토큰입니다. (서비스 차단)",
            },
            { status: 410 }
          ),
        };
      }
      targetProjectId = tokenRow.project_id;
    }
  }

  if (targetProjectId.startsWith("proj_")) {
    const idRes = await queryTable("sheetbot_projects", {
      filters: { id: targetProjectId },
      limit: 1,
    }).catch(() => ({ rows: [] }));
    rawProject = (idRes.rows || []).find((r: any) => r.id === targetProjectId);
  } else {
    const allRes = await queryTable("sheetbot_projects", {
      limit: 100,
    }).catch(() => ({ rows: [] }));
    rawProject = (allRes.rows || []).find((r: any) => r.bridge_token === token || r.id === token);
  }

  if (!rawProject) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "유효하지 않거나 존재하지 않는 브릿지 토큰입니다." },
        { status: 404 }
      ),
    };
  }

  // 1. 프로젝트 소프트 삭제 및 유예 상태(PENDING_DELETE, TRASHED) 검증 -> HTTP 410 Gone 선제 거부
  if (
    rawProject.deleted_at ||
    rawProject.status === "PENDING_DELETE" ||
    rawProject.status === "TRASHED" ||
    rawProject.status === "REVOKED"
  ) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          code: "PROJECT_REVOKED",
          error: "삭제된 프로젝트이므로 서비스가 즉시 차단되었습니다. 시트봇 대시보드에서 프로젝트를 복원하세요.",
        },
        { status: 410 }
      ),
    };
  }

  // 2. 소유자 회원 탈퇴 상태(WITHDRAWN, SUSPENDED) 검증 -> HTTP 410 Gone 즉각 차단
  if (rawProject.user_email) {
    try {
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: rawProject.user_email.toLowerCase().trim() },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      const userRow = (userRes.rows || [])[0];
      if (userRow && (userRow.status === "WITHDRAWN" || userRow.status === "SUSPENDED" || userRow.deleted_at)) {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              code: "ACCOUNT_WITHDRAWN",
              error: "탈퇴하였거나 이용 정지된 회원 계정의 프로젝트이므로 서비스가 영구 차단되었습니다.",
            },
            { status: 410 }
          ),
        };
      }
    } catch (err: any) {
      console.warn("[Bridge Validation] User status check error:", err.message);
    }
  }

  return { project: rawProject };
}

/**
 * 1. GET: 외부 AI 에이전트가 스프레드시트의 탭, 헤더(10행 등), 기존 코드 및 코딩 지침 조회
 */
export async function GET(request: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";

    const { project, errorResponse } = await findAndValidateBridgeProject(token);
    if (errorResponse) return errorResponse;

    if (!isBridgeGetAllowed(project)) {
      return sheetbotErrorResponse({
        code: "NOT_WRAPPED",
        message: "스프레드시트가 연결되지 않았거나 래핑이 완료되지 않았습니다. sheetbot.cloud에서 시트를 연결·wrap 해 주세요.",
        httpStatus: 409,
      });
    }

    const spreadsheetId = project.spreadsheet_id;
    let sheetsContext: any = null;
    let detectedStructure: any = null;

    // 스프레드시트 구조 분석 (최대 30행 샘플을 읽어 10행 헤더 등 고정 양식 완벽 파악)
    if (spreadsheetId) {
      try {
        sheetsContext = await getSpreadsheetFullContext(spreadsheetId, 30);
        if (sheetsContext && sheetsContext.sheetsData) {
          detectedStructure = sheetsContext.sheetsData.map((tab: any) => {
            const rawHeaders = tab.headers || [];
            const sampleRows = tab.sampleData || [];

            // 1~15행 중 실제 헤더 행 자동 탐지 (공란이 아니고 컬럼명이 가장 많은 행 탐색)
            let detectedHeaderRow = 1;
            let detectedHeaders = rawHeaders;

            if (sampleRows.length > 0) {
              for (let r = 0; r < Math.min(15, sampleRows.length); r++) {
                const row = sampleRows[r];
                if (Array.isArray(row)) {
                  const nonEmptyCount = row.filter((c: any) => c !== null && c !== undefined && String(c).trim().length > 0).length;
                  if (nonEmptyCount >= 3 && nonEmptyCount > (rawHeaders.length || 0)) {
                    detectedHeaderRow = r + 2; // sampleRows는 2행부터 시작
                    detectedHeaders = row.map((v: any) => String(v || "").trim());
                  }
                }
              }
            }

            return {
              tabTitle: tab.sheetTitle,
              rowCount: tab.rowCount,
              columnCount: tab.columnCount,
              suggestedHeaderRow: detectedHeaderRow,
              dataStartRow: detectedHeaderRow + 1,
              headers: detectedHeaders.map((h: string, idx: number) => ({
                colIndex: idx + 1,
                colLetter: String.fromCharCode(65 + idx),
                name: h || `열 ${String.fromCharCode(65 + idx)}`,
              })),
              samplePreview: sampleRows.slice(0, 5),
            };
          });
        }
      } catch (err: any) {
        console.warn("[Gas-Bridge GET] Failed to fetch sheets context:", err.message);
      }
    }

    let currentUserAutomation = project.script_code || "";
    let currentManifest = project.manifest || "";
    let legacyCodeGs = "";
    const gasProjectId = project.gas_project_id || "";

    if (gasProjectId) {
      try {
        const remote = await readRemoteGasAutomationSources(callAppsScriptTool, gasProjectId);
        if (remote.userAutomationGs) currentUserAutomation = remote.userAutomationGs;
        if (remote.manifest) currentManifest = remote.manifest;
        legacyCodeGs = remote.legacyCodeGs;
      } catch (e: any) {
        console.warn("[Gas-Bridge GET] Sync existing code note:", e.message);
      }
    }

    // 💡 계정의 '[SheetBot] 아카이빙' 시트에서 과거 작업 이력 선제 조회 (최근 5건)
    let archiveInfo: { spreadsheetId?: string; spreadsheetUrl?: string; history: any[] } = { history: [] };
    if (project.user_email) {
      try {
        archiveInfo = await getArchiveHistory(project.user_email, 5);
      } catch (archErr: any) {
        console.warn("[Gas-Bridge GET] Archive history check note:", archErr.message);
      }
    }

    const postEndpoint = resolveGasBridgePostEndpoint(request, token);
    const useRuntimeClient = shouldDeploySheetbotRuntimeClient();
    const deploymentTokenCost = (await getAiModelSettings()).agentBridgeDeploymentTokens ?? 500;

    const shellContract = {
      shellVersion: "2026-wrapping-2",
      hooks: [
        { name: "registerSheetBotMenuItems_", signature: "(menu) → menu?", definedIn: "UserAutomation.gs" as const },
        { name: "installSheetBotTriggers_", signature: "() → void", definedIn: "UserAutomation.gs" as const },
        { name: "onSheetBotOpen_", signature: "(e) → void", definedIn: "UserAutomation.gs" as const },
        { name: "onSheetBotEdit_", signature: "(e) → void", definedIn: "UserAutomation.gs" as const },
      ],
      callableFromUser: shellContractCallableFromUser(useRuntimeClient),
      mcp: {
        manifestVersion: SHEET_MCP_MANIFEST_VERSION,
        transport: (useRuntimeClient ? "sheetbot-runtime" : "egdesk-tunnel") as
          | "sheetbot-runtime"
          | "egdesk-tunnel",
        entrypoint: (useRuntimeClient ? "sheetbotCall_" : "egdeskToolsCall") as
          | "sheetbotCall_"
          | "egdeskToolsCall",
        exposedRuntimeTools: runtimeToolsForShellContract(SHEET_RUNTIME_TOOL_EXPOSURE),
        exposedSheetbot: [] as { service: string; tool: string }[],
      },
      reservedFunctionNames: Array.from(RESERVED_GAS_FUNCTION_NAMES),
      aiParsingHelpers: ["egdeskExtractAiText", "egdeskExtractAiJson"],
      runtimeErrorCodes: [
        "INSUFFICIENT_BALANCE",
        "SPEND_CAP_EXCEEDED",
        "RATE_LIMITED",
        "MANIFEST_VIOLATION",
        "NOT_WRAPPED",
        "INVALID_RUNTIME_AUTH",
      ],
      rechargeUiAction: "openTokenRechargeModal",
    };

    return NextResponse.json({
      success: true,
      shellContract,
      project: {
        id: project.id,
        name: project.name,
        spreadsheetId: project.spreadsheet_id,
        spreadsheetUrl: project.spreadsheet_url,
        gasProjectId: project.gas_project_id,
        scriptUrl: project.script_url,
        webappUrl: project.webapp_url,
      },
      spreadsheetAnalysis: {
        tabs: detectedStructure || [],
        rawSheetsContext: sheetsContext,
      },
      existingCode: {
        userAutomationGs: currentUserAutomation,
        codeGs: legacyCodeGs || currentUserAutomation,
        manifest: currentManifest,
      },
      previousArchiveHistory: archiveInfo.history || [],
      archiveSpreadsheet: {
        spreadsheetId: archiveInfo.spreadsheetId || null,
        spreadsheetUrl: archiveInfo.spreadsheetUrl || null,
      },
      codingInstructions: buildBridgeCodingInstructions({
        postEndpoint,
        deploymentTokenCost,
        useRuntimeClient,
      }),
    });
  } catch (err: any) {
    console.error("[Gas-Bridge GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * 2. POST: `updateAutomation` only — requires wrapped project (see WRAPPING.md).
 */
export async function POST(request: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { success: false, error: "토큰(?token=...)이 필요합니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      scriptCode,
      userAutomationCode,
      manifest,
      comment = "AI 에이전트 자동 코드 주입",
    } = body;

    const rawAutomation = String(userAutomationCode || scriptCode || "").trim();
    if (!rawAutomation) {
      return NextResponse.json(
        { success: false, error: "userAutomationCode 또는 scriptCode(주입할 UserAutomation.gs)가 필요합니다." },
        { status: 400 }
      );
    }

    const sanitizedScriptCode = sanitizeGasScriptCode(rawAutomation);

    const { project, errorResponse } = await findAndValidateBridgeProject(token || "");
    if (errorResponse) return errorResponse;

    let visitorSessionId = await getCurrentVisitorSessionId(request);
    if (!visitorSessionId && project.user_email) {
      try {
        const userRes = await queryTable("sheetbot_users", {
          filters: { email: project.user_email.toLowerCase().trim() },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        const userRow = (userRes.rows || [])[0];
        if (userRow && userRow.visitor_session_id) {
          visitorSessionId = userRow.visitor_session_id;
        }
      } catch {}
    }

    const visitorOptions = buildBridgeVisitorOptions(visitorSessionId);
    const userAgent = request.headers.get("user-agent") || "";
    const detectedCaller = userAgent.includes("Cursor")
      ? "Cursor"
      : userAgent.includes("Windsurf")
        ? "Windsurf"
        : userAgent.includes("Antigravity")
          ? "Antigravity"
          : "AI Agent (Bridge)";

    const result = await updateAutomation({
      project,
      userAutomationCode: sanitizedScriptCode,
      manifest,
      comment,
      visitorOptions,
      caller: "sheetbot-agent-bridge",
      userAgent: detectedCaller,
      archive: true,
      preflightBalance: true,
      fullShellPush: false,
    });

    const currentName = String(project.name || "").trim();
    const isDefaultName =
      !currentName ||
      currentName === "스마트 자동화 시트" ||
      currentName === "[SheetBot] 스마트 자동화 시트" ||
      currentName === "시트봇 자동화 프로젝트";

    if (isDefaultName && comment && comment !== "AI 에이전트 자동 코드 주입") {
      const cleanComment = comment.replace(/(기능\s*주입|자동화\s*코드|자동\s*주입|개발\s*완료)$/i, "").trim();
      await updateRows(
        "sheetbot_projects",
        { name: `[SheetBot] ${cleanComment}`, updated_at: new Date().toISOString() },
        { filters: { id: project.id } },
      ).catch(() => null);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof SheetbotServiceError) {
      return sheetbotErrorResponse(err.apiError);
    }
    console.error("[Gas-Bridge POST] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
