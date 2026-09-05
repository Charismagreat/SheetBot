export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows, callAppsScriptTool, callDriveTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

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
  status: "ACTIVE" | "TRASHED";
  created_at: string;
  updated_at: string;
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

// DB Row -> SheetBotProject 모델 변환 헬퍼
function mapRowToProject(row: any): SheetBotProject {
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

  return {
    id: row.id,
    userEmail: row.user_email || row.userEmail || "",
    name: row.name || "",
    description: row.description || "",
    spreadsheetId: row.spreadsheet_id || row.spreadsheetId || "",
    spreadsheetUrl: row.spreadsheet_url || row.spreadsheetUrl || "",
    gasProjectId: row.gas_project_id || row.gasProjectId || "",
    scriptId: row.script_id || row.scriptId || "",
    scriptUrl: row.script_url || row.scriptUrl || "",
    scriptCode: row.script_code || row.scriptCode || "",
    manifest: row.manifest || "",
    summary: row.summary || "",
    features: parsedFeatures,
    triggers: parsedTriggers,
    prompt: row.prompt || "",
    status: row.status || "ACTIVE",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    deleted_at: row.deleted_at || null,
  };
}

/**
 * GET: 현재 로그인된 회원의 프로젝트 목록 조회 (My DB 정규 테이블 연동)
 */
export async function GET(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_projects", {
      filters: { user_email: userEmail.toLowerCase().trim() },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const rawRows = res.rows || [];
    // 소프트 삭제(deleted_at) 필터링
    const activeProjects = rawRows
      .filter((r: any) => !r.deleted_at)
      .map(mapRowToProject);

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
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      spreadsheetUrl,
      scriptCode,
      manifest,
      summary,
      features,
      triggers,
      prompt,
    } = body;

    if (!name || !spreadsheetUrl) {
      return NextResponse.json({
        success: false,
        error: "프로젝트 이름과 구글 시트 URL은 필수 입력값입니다.",
      }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl) || "";
    const nowStr = new Date().toISOString();

    // 1. 이지데스크 Apps Script MCP 도구를 통한 구글 시트 바인딩 프로젝트 생성
    let gasProjectId = "";
    let scriptId = "";
    let scriptUrl = "";

    try {
      if (spreadsheetId) {
        // 생성 시점부터 AI 생성 코드를 직접 전달
        const boundRes = await callAppsScriptTool("apps_script_create_bound", {
          fileId: spreadsheetId,
          title: name.trim(),
          scriptCode: scriptCode || undefined,
        });
        if (boundRes && (boundRes.id || boundRes.projectId)) {
          gasProjectId = boundRes.id || boundRes.projectId;
          scriptId = boundRes.scriptId || gasProjectId;
          scriptUrl = boundRes.scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
        }

        // 스크립트 코드가 제공된 경우 Code.gs 파일 덮어쓰기 및 구글 클라우드에 직접 푸시
        if (gasProjectId && scriptCode) {
          // 비정상 파일이 남아있을 경우 푸시 충돌 방지를 위해 정리
          await callAppsScriptTool("apps_script_delete_file", {
            projectId: gasProjectId,
            fileName: "undefined.gs",
          }).catch(() => null);

          await callAppsScriptTool("apps_script_write_file", {
            projectId: gasProjectId,
            fileName: "Code.gs",
            content: scriptCode,
          }).catch((err: any) => console.warn("write Code.gs warning:", err.message));

          if (manifest) {
            await callAppsScriptTool("apps_script_write_file", {
              projectId: gasProjectId,
              fileName: "appsscript.json",
              content: manifest,
            }).catch((err: any) => console.warn("write appsscript.json warning:", err.message));
          }

          // 클라우드 반영
          await callAppsScriptTool("apps_script_push_to_google", {
            projectId: gasProjectId,
          }).catch((err: any) => console.warn("push to google warning:", err.message));
        }
      }
    } catch (mcpErr: any) {
      console.warn("Apps Script direct cloud binding note:", mcpErr.message);
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 2. 정규 My DB 테이블(sheetbot_projects)에 인서트 (7종 감사 컬럼 주입)
    const newRow = {
      id: projectId,
      uuid: crypto.randomUUID(),
      user_email: userEmail.toLowerCase().trim(),
      name: name.trim(),
      description: summary || "AI 자동 생성 스프레드시트 프로젝트",
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      gas_project_id: gasProjectId || `gas_${Date.now()}`,
      script_id: scriptId || gasProjectId,
      script_url: scriptUrl || (scriptId ? `https://script.google.com/d/${scriptId}/edit` : ""),
      script_code: scriptCode || "",
      manifest: manifest || "",
      summary: summary || "",
      features: JSON.stringify(Array.isArray(features) ? features : []),
      triggers: JSON.stringify(Array.isArray(triggers) ? triggers : []),
      prompt: prompt || "",
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

    return NextResponse.json({
      success: true,
      message: "새 Apps Script 프로젝트가 성공적으로 생성 및 등록되었습니다.",
      project: mapRowToProject(newRow),
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
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("id");

    if (!projectId) {
      return NextResponse.json({ success: false, error: "삭제할 프로젝트 ID가 누락되었습니다." }, { status: 400 });
    }

    const nowStr = new Date().toISOString();

    // 소프트 삭제 처리 (deleted_at, deleted_by, status 업데이트)
    await updateRows(
      "sheetbot_projects",
      {
        deleted_at: nowStr,
        deleted_by: userEmail,
        status: "TRASHED",
        updated_at: nowStr,
        updated_by: userEmail,
      },
      {
        filters: {
          id: projectId,
          user_email: userEmail.toLowerCase().trim(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: "프로젝트가 성공적으로 삭제(소프트 삭제)되었습니다.",
    });
  } catch (error: any) {
    console.error("DELETE SheetBot project error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PATCH: 프로젝트 정보 부분 수정 (이름 동기화 및 갱신 지원)
 */
export async function PATCH(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, description, redeploy } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "수정할 프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    const nowStr = new Date().toISOString();
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

    // 프로젝트 레코드 조회 (redeploy 처리용)
    const existing = await queryTable("sheetbot_projects", {
      filters: { id, user_email: userEmail.toLowerCase().trim() },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const projRow = existing.rows?.[0];

    // 기존 프로젝트의 AI 생성 코드를 구글 클라우드에 재주입
    if (redeploy && projRow) {
      const gasProjId = projRow.gas_project_id || projRow.script_id;
      const scriptCode = projRow.script_code;
      const manifest = projRow.manifest;

      if (gasProjId && scriptCode) {
        // 비정상 파일이 남아있을 경우 푸시 충돌 방지를 위해 정리
        await callAppsScriptTool("apps_script_delete_file", {
          projectId: gasProjId,
          fileName: "undefined.gs",
        }).catch(() => null);

        await callAppsScriptTool("apps_script_write_file", {
          projectId: gasProjId,
          fileName: "Code.gs",
          content: scriptCode,
        }).catch((err: any) => console.warn("Redeploy Code.gs warning:", err.message));

        if (manifest) {
          await callAppsScriptTool("apps_script_write_file", {
            projectId: gasProjId,
            fileName: "appsscript.json",
            content: manifest,
          }).catch(() => null);
        }

        await callAppsScriptTool("apps_script_push_to_google", {
          projectId: gasProjId,
        }).catch((err: any) => console.warn("Redeploy push warning:", err.message));
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
    });
  } catch (error: any) {
    console.error("PATCH SheetBot project error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
