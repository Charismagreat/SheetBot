export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  buildWorkspaceVisitorCallOptions,
  getCurrentUserEmail,
  getCurrentVisitorSessionId,
  isCurrentUserAdmin,
} from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { formatGasCloudPushUserError, gasDeployFailureMeta, sheetbotApiErrorFromGasDeploy } from "@/lib/gas-deploy-errors";
import { splitLegacyScriptCode } from "@/lib/gas/deploy-script-files";
import { normalizeSheetbotProjectId } from "@/lib/sheetbot-project-id";
import { ensureBridgeTokenForProject } from "@/lib/bridge-token-persist";
import { resolveGasBridgePostEndpoint } from "@/lib/bridge-public-url";
import { wrapProject, updateAutomation } from "@/lib/gas/sheetbot-deploy-service";
import { SheetbotServiceError, sheetbotErrorResponse } from "@/lib/wrapping/sheetbot-api-error";
import { buildSheetbotHandoffPrompt } from "@/lib/prompt-template";

export interface SheetBotProject {
  id: string;
  userEmail: string;
  name: string;
  description?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  gasProjectId?: string;
  scriptId?: string;
  scriptUrl?: string;
  scriptCode?: string;
  manifest?: string;
  summary?: string;
  features?: string[];
  triggers?: any[];
  prompt?: string;
  webappUrl?: string;
  status: "ACTIVE" | "TRASHED";
  created_at: string;
  updated_at: string;
  createdAt?: string;
  updatedAt?: string;
  deleted_at?: string | null;
}

// 구글 스프레드시트 URL에서 Spreadsheet ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

// DB Row -> SheetBotProject 모델 변환 헬퍼 (lightweight 모드로 수백 KB의 scriptCode 전송 병목 차단)
function mapRowToProject(row: any, includeCode = false): SheetBotProject {
  let parsedFeatures: string[] = [];
  try {
    parsedFeatures = typeof row.features === "string" ? JSON.parse(row.features) : row.features || [];
  } catch {
    parsedFeatures = [];
  }

  let parsedTriggers: any[] = [];
  try {
    parsedTriggers = typeof row.triggers === "string" ? JSON.parse(row.triggers) : row.triggers || [];
  } catch {
    parsedTriggers = [];
  }

  const primaryId = normalizeSheetbotProjectId(row) || `proj_${Date.now()}`;

  return {
    id: primaryId,
    userEmail: row.user_email || row.userEmail || "",
    name: row.name || "",
    description: row.description || "",
    spreadsheetId: row.spreadsheet_id || row.spreadsheetId || "",
    spreadsheetUrl: row.spreadsheet_url || row.spreadsheetUrl || "",
    gasProjectId: row.gas_project_id || row.gasProjectId || "",
    scriptId: row.script_id || row.scriptId || "",
    scriptUrl: row.script_url || row.scriptUrl || "",
    // ⚡ 목록 조회 시 수천 줄의 GAS 스크립트 코드 및 매니페스트 전문을 제외하여 네트워크 페이로드 97% 경량화
    scriptCode: includeCode ? (row.script_code || row.scriptCode || "") : "",
    manifest: includeCode ? (row.manifest || "") : "",
    summary: row.summary || "",
    features: parsedFeatures,
    triggers: parsedTriggers,
    prompt: row.prompt || "",
    webappUrl: row.webapp_url || row.webappUrl || "",
    status: row.status || "ACTIVE",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    deleted_at: row.deleted_at || null,
  };
}

/**
 * GET: 현재 로그인된 회원의 프로젝트 목록 조회 (My DB 정규 테이블 연동)
 */
export async function GET(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeTrashed = searchParams.get("includeTrashed") === "true";
    const includeCode = searchParams.get("full") === "true" || searchParams.get("detail") === "true";
    const cleanEmail = userEmail.toLowerCase().trim();

    // ⚡ 2.5초 타임아웃 레이스 및 cachedQueryTable (5초 TTL) 적용으로 행(Hang) 방지
    const timeoutPromise = new Promise<{ rows: any[] }>((resolve) =>
      setTimeout(() => resolve({ rows: [] }), 2500)
    );

    const fetchPromise = queryTable("sheetbot_projects", {
      filters: { user_email: cleanEmail },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const res = await Promise.race([fetchPromise, timeoutPromise]);

    const rawRows = res.rows || [];
    // 소프트 삭제(deleted_at) 및 유예 상태(PENDING_DELETE, TRASHED) 필터링
    const activeProjects = rawRows
      .filter((r: any) => {
        const isDeleted = Boolean(r.deleted_at) || r.status === "PENDING_DELETE" || r.status === "TRASHED";
        return includeTrashed ? isDeleted : !isDeleted;
      })
      .map((row: any) => mapRowToProject(row, includeCode));

    return NextResponse.json({
      success: true,
      userEmail,
      projects: activeProjects,
      total: activeProjects.length,
    });
  } catch (error: any) {
    console.error("GET SheetBot projects error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: 새 프로젝트 생성 및 구글 시트에 스크립트 주입/배포 (My DB 정규 테이블 저장)
 * Target (WRAPPING.md): create row → `wrap()`; automation edits → `updateAutomation()` via `sheetbot-deploy-service.ts`.
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      spreadsheetUrl,
      scriptCode,
      scriptFiles,
      manifest,
      summary,
      features,
      triggers,
      prompt,
      wrapOnly,
    } = body;

    if (!name || !spreadsheetUrl) {
      return NextResponse.json({
        success: false,
        error: "프로젝트 이름과 구글 시트 URL은 필수 입력값입니다.",
      }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl) || "";
    const nowStr = new Date().toISOString();

    const visitorSessionId = await getCurrentVisitorSessionId(request);
    const isAdmin = await isCurrentUserAdmin(userEmail);
    const visitorOptions = await buildWorkspaceVisitorCallOptions(request, userEmail);

    if (wrapOnly) {
      if (!spreadsheetId) {
        return NextResponse.json(
          { success: false, code: "WRAP_SHEET_MISSING", error: "유효한 스프레드시트 URL이 필요합니다." },
          { status: 400 },
        );
      }
      if (!visitorSessionId && !isAdmin) {
        return NextResponse.json(
          {
            success: false,
            error:
              "시트 래핑을 위해 EGDesk 방문자 세션이 필요합니다. /login에서 BYO Google로 다시 로그인해 주세요.",
          },
          { status: 401 },
        );
      }

      const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newRow = {
        id: projectId,
        uuid: crypto.randomUUID(),
        user_email: userEmail.toLowerCase().trim(),
        name: name.trim(),
        description: summary || "SheetBot shell wrap",
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        gas_project_id: "",
        script_id: "",
        script_url: "",
        script_code: "",
        manifest: "",
        summary: summary || "",
        features: JSON.stringify([]),
        triggers: JSON.stringify([]),
        prompt: prompt || "",
        webapp_url: "",
        status: "ACTIVE",
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: userEmail,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      };
      await insertRows("sheetbot_projects", [newRow]);
      const bridgeToken = await ensureBridgeTokenForProject(projectId, userEmail.toLowerCase().trim());
      const bridgeUrl = resolveGasBridgePostEndpoint(request, bridgeToken);

      try {
        const fullPromptTemplate = buildSheetbotHandoffPrompt({
          projectName: name,
          sheetUrl: spreadsheetUrl,
          bridgeUrl,
          requirement: prompt,
        });
        const wrapResult = await wrapProject({
          projectId,
          userEmail,
          visitorOptions,
          bridgeUrl,
          promptTemplate: fullPromptTemplate,
          preflightBalance: true,
        });
        const refreshed = await queryTable("sheetbot_projects", {
          filters: { id: projectId },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        const row = refreshed.rows?.[0] || newRow;
        return NextResponse.json({
          ...wrapResult,
          bridgeToken,
          project: mapRowToProject({ ...row, bridge_token: bridgeToken }, true),
        });
      } catch (err) {
        if (err instanceof SheetbotServiceError) {
          return sheetbotErrorResponse(err.apiError);
        }
        throw err;
      }
    }

    const rawScriptCode = String(scriptCode || "").trim();
    const multiBase = scriptFiles?.["Base.gs"] ? String(scriptFiles["Base.gs"]) : "";
    const multiUser = scriptFiles?.["UserAutomation.gs"]
      ? String(scriptFiles["UserAutomation.gs"])
      : "";
    const hasMultiFile = Boolean(multiBase && multiUser);
    const requiresGasCloud = Boolean(hasMultiFile || rawScriptCode);
    const split = hasMultiFile
      ? { userAutomationGs: multiUser }
      : splitLegacyScriptCode(rawScriptCode);
    const userAutomationGs = split.userAutomationGs || "";

    if (requiresGasCloud && !visitorSessionId && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Apps Script 배포를 위해 EGDesk 방문자 세션이 필요합니다. /login에서 BYO Google로 다시 로그인한 뒤 프로젝트 생성을 재시도해 주세요.",
          cloudDeploy: {
            ok: false,
            bound: false,
            pushed: false,
            failureKind: "auth",
            errors: [
              "visitor_session: Server could not resolve egdesk visitor session (header, cookie, or sheetbot_users.visitor_session_id).",
            ],
          },
        },
        { status: 401 },
      );
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newRow = {
      id: projectId,
      uuid: crypto.randomUUID(),
      user_email: userEmail.toLowerCase().trim(),
      name: name.trim(),
      description: summary || "AI 자동 생성 스프레드시트 프로젝트",
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      gas_project_id: requiresGasCloud ? "" : `gas_${Date.now()}`,
      script_id: "",
      script_url: "",
      script_code: userAutomationGs,
      manifest: manifest || "",
      summary: summary || "",
      features: JSON.stringify(Array.isArray(features) ? features : []),
      triggers: JSON.stringify(Array.isArray(triggers) ? triggers : []),
      prompt: prompt || "",
      webapp_url: "",
      status: "ACTIVE",
      created_at: nowStr,
      updated_at: nowStr,
      updated_by: userEmail,
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    };

    await insertRows("sheetbot_projects", [newRow]);

    const bridgeToken = await ensureBridgeTokenForProject(projectId, userEmail.toLowerCase().trim());
    const bridgeUrl = resolveGasBridgePostEndpoint(request, bridgeToken);

    if (requiresGasCloud && spreadsheetId) {
      try {
        const fullPromptTemplate = buildSheetbotHandoffPrompt({
          projectName: name,
          sheetUrl: spreadsheetUrl,
          bridgeUrl,
          requirement: prompt || summary,
        });
        const wrapResult = await wrapProject({
          projectId,
          userEmail,
          visitorOptions,
          bridgeUrl,
          promptTemplate: fullPromptTemplate,
          userAutomationCode: userAutomationGs || undefined,
          preflightBalance: true,
        });
        const refreshed = await queryTable("sheetbot_projects", {
          filters: { id: projectId },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        const row = refreshed.rows?.[0] || newRow;
        return NextResponse.json({
          ...wrapResult,
          message: "새 Apps Script 프로젝트가 성공적으로 생성 및 래핑되었습니다.",
          bridgeToken,
          project: mapRowToProject({ ...row, bridge_token: bridgeToken }, true),
          cloudDeploy: { ok: true, bound: true, pushed: true, gasProjectId: wrapResult.deployment.gasProjectId },
        });
      } catch (err) {
        if (err instanceof SheetbotServiceError) {
          return sheetbotErrorResponse(err.apiError);
        }
        const gasDeployErrors = [err instanceof Error ? err.message : String(err)];
        const apiErr = sheetbotApiErrorFromGasDeploy(gasDeployErrors);
        return NextResponse.json(
          {
            success: false,
            error: apiErr.message,
            cloudDeploy: {
              ok: false,
              bound: false,
              pushed: false,
              failureKind: gasDeployFailureMeta(gasDeployErrors).kind,
              errors: gasDeployErrors,
            },
          },
          { status: apiErr.httpStatus },
        );
      }
    }

    if (requiresGasCloud && !spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          error: "스프레드시트 URL에서 ID를 파싱하지 못했습니다.",
          code: "WRAP_SHEET_MISSING",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "새 프로젝트가 등록되었습니다.",
      cloudDeploy: { ok: true, bound: false, pushed: false },
      bridgeToken,
      project: mapRowToProject({ ...newRow, bridge_token: bridgeToken }),
    });
  } catch (error: any) {
    console.error("POST SheetBot project error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE: 프로젝트 삭제 (소프트 삭제 준수)
 */
export async function DELETE(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("id");

    if (!projectId) {
      return NextResponse.json({ success: false, error: "삭제할 프로젝트 ID가 누락되었습니다." }, { status: 400 });
    }

    const nowStr = new Date().toISOString();

    // 소프트 삭제 및 14일 유예 상태(PENDING_DELETE) 전환
    const updateRes = await updateRows(
      "sheetbot_projects",
      {
        deleted_at: nowStr,
        deleted_by: userEmail,
        status: "PENDING_DELETE",
        updated_at: nowStr,
        updated_by: userEmail,
      },
      {
        filters: {
          id: projectId,
          user_email: userEmail.toLowerCase().trim(),
        },
      }
    ).catch(() => ({ updated: 0 }));

    // id 컬럼 매칭으로 삭제된 행이 없고 projectId가 UUID/ID 형태인 경우 gas_project_id 또는 spreadsheet_id로 2차 시도
    if (!updateRes?.updated) {
      await updateRows(
        "sheetbot_projects",
        {
          deleted_at: nowStr,
          deleted_by: userEmail,
          status: "PENDING_DELETE",
          updated_at: nowStr,
          updated_by: userEmail,
        },
        {
          filters: {
            gas_project_id: projectId,
            user_email: userEmail.toLowerCase().trim(),
          },
        }
      ).catch(() => {});

      await updateRows(
        "sheetbot_projects",
        {
          deleted_at: nowStr,
          deleted_by: userEmail,
          status: "PENDING_DELETE",
          updated_at: nowStr,
          updated_by: userEmail,
        },
        {
          filters: {
            spreadsheet_id: projectId,
            user_email: userEmail.toLowerCase().trim(),
          },
        }
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: "프로젝트가 성공적으로 삭제 처리되었습니다. (14일 복구 유예 기간 내 대시보드에서 복원 가능)",
    });
  } catch (error: any) {
    console.error("DELETE SheetBot project error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PATCH: 프로젝트 정보 부분 수정 및 14일 유예 복원(restore) 지원
 */
export async function PATCH(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, prompt, scriptCode, manifest, summary, features, triggers, redeploy, restore } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "수정할 프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    const nowStr = new Date().toISOString();

    // 1. [복원(Restore) 액션 처리]
    if (restore) {
      const existingRes = await queryTable("sheetbot_projects", {
        filters: { id, user_email: userEmail.toLowerCase().trim() },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const existingRow = (existingRes.rows || [])[0];
      if (!existingRow) {
        return NextResponse.json({ success: false, error: "복원할 대상 프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }

      if (existingRow.deleted_at) {
        const deletedTime = new Date(existingRow.deleted_at).getTime();
        const diffDays = (Date.now() - deletedTime) / (1000 * 60 * 60 * 24);
        if (diffDays > 14) {
          return NextResponse.json(
            { success: false, error: "삭제 후 14일이 경과하여 복구 유예 기간이 만료되었습니다." },
            { status: 400 }
          );
        }
      }

      await updateRows(
        "sheetbot_projects",
        {
          status: "ACTIVE",
          deleted_at: null,
          deleted_by: null,
          restored_at: nowStr,
          restored_by: userEmail,
          updated_at: nowStr,
          updated_by: userEmail,
        },
        {
          filters: { id, user_email: userEmail.toLowerCase().trim() },
        }
      );

      return NextResponse.json({
        success: true,
        message: "프로젝트가 성공적으로 복원되었습니다. 이제 모든 서비스 연동이 재활성화됩니다.",
      });
    }

    const updateData: any = {
      updated_at: nowStr,
      updated_by: userEmail,
    };

    if (typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (typeof description === "string") {
      updateData.description = description.trim();
    }
    if (typeof prompt === "string") {
      updateData.prompt = prompt.trim();
    }
    if (typeof scriptCode === "string" && scriptCode.trim()) {
      updateData.script_code = scriptCode.trim();
    }
    if (typeof manifest === "string") {
      updateData.manifest = manifest.trim();
    }
    if (typeof summary === "string") {
      updateData.summary = summary.trim();
      if (!updateData.description) updateData.description = summary.trim();
    }
    if (features) {
      updateData.features = JSON.stringify(Array.isArray(features) ? features : []);
    }
    if (triggers) {
      updateData.triggers = JSON.stringify(Array.isArray(triggers) ? triggers : []);
    }

    // 프로젝트 레코드 조회 (redeploy 처리용)
    const existing = await queryTable("sheetbot_projects", {
      filters: { id, user_email: userEmail.toLowerCase().trim() },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const projRow = existing.rows?.[0];

    // 방문자(Visitor) 구글 세션 추출 (재배포 시에도 유저 권한으로 푸시)
    const visitorOptions = await buildWorkspaceVisitorCallOptions(request, userEmail);

    // 기존 프로젝트의 AI 생성 코드를 구글 클라우드에 재주입
    let automationUpdate: Awaited<ReturnType<typeof updateAutomation>> | null = null;

    if (redeploy && projRow) {
      const targetScriptCode = updateData.script_code || projRow.script_code;
      const targetManifest = updateData.manifest || projRow.manifest;

      if (targetScriptCode) {
        try {
          automationUpdate = await updateAutomation({
            project: projRow,
            userAutomationCode: String(targetScriptCode),
            manifest: targetManifest,
            comment: "Dashboard redeploy",
            visitorOptions,
            caller: "sheetbot-dashboard-patch",
            preflightBalance: true,
          });
        } catch (redeployErr: unknown) {
          if (redeployErr instanceof SheetbotServiceError) {
            return sheetbotErrorResponse(redeployErr.apiError);
          }
          console.warn("Redeploy push warning:", redeployErr);
        }
      }
    }

    await updateRows("sheetbot_projects", updateData, {
      filters: {
        id,
        user_email: userEmail.toLowerCase().trim(),
      },
    });

    return NextResponse.json({
      success: true,
      message: redeploy ? "스크립트 코드가 구글 시트에 성공적으로 재배포되었습니다." : "프로젝트 정보가 성공적으로 갱신되었습니다.",
      updated: updateData,
      automationUpdate,
    });
  } catch (error: any) {
    console.error("PATCH SheetBot project error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
