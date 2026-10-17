export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, callAppsScriptTool } from "@/lib/egdesk-helpers";
import { findSheetbotProjectByRef } from "@/lib/sheetbot-project-resolve";
import { generateStandardTokenRecharge } from "@/lib/gas-manifest";
import { sanitizeGasScriptCode } from "@/lib/gas-sanitizer";
import { readRemoteGasAutomationSources } from "@/lib/gas/read-remote-gas-files";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * POST: 구글 Apps Script UserAutomation.gs(또는 레거시 Code.gs)를 읽어 sanitizer로 맞춘 뒤 DB·클라우드에 반영
 */
export async function POST(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "동기화할 프로젝트 ID가 필요합니다." },
        { status: 400 }
      );
    }

    const project = await findSheetbotProjectByRef(userEmail, projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없거나 권한이 없습니다." },
        { status: 404 }
      );
    }

    let gasProjectId = String(project.gas_project_id || project.script_id || "");
    const spreadsheetUrl = String(project.spreadsheet_url || project.spreadsheetUrl || "");
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);

    // 2. 만약 gasProjectId가 비어있다면 스프레드시트 매칭으로 조회
    if (!gasProjectId && spreadsheetId) {
      try {
        const listRes = await callAppsScriptTool("apps_script_list_projects", {});
        const projects = Array.isArray(listRes) ? listRes : (listRes?.projects || listRes?.result || []);
        const matched = projects.find(
          (p: any) =>
            p.containerId === spreadsheetId ||
            p.spreadsheetId === spreadsheetId ||
            (p.containerUrl && p.containerUrl.includes(spreadsheetId)) ||
            (p.spreadsheetUrl && p.spreadsheetUrl.includes(spreadsheetId))
        );
        if (matched) {
          gasProjectId = matched.id || matched.projectId;
        }
      } catch (err: any) {
        console.warn("[Sync-Code] list_projects fallback warning:", err.message);
      }
    }

    if (!gasProjectId) {
      return NextResponse.json(
        { success: false, error: "구글 시트에 연결된 Apps Script 프로젝트 ID를 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    const remote = await readRemoteGasAutomationSources(callAppsScriptTool, gasProjectId);
    const latestCode = remote.userAutomationGs || remote.legacyCodeGs;

    if (!latestCode) {
      return NextResponse.json(
        { success: false, error: "구글 시트의 UserAutomation.gs(또는 Code.gs)를 읽어오지 못했습니다." },
        { status: 400 }
      );
    }

    const sanitizedCode = sanitizeGasScriptCode(latestCode);
    const codeStandardized = sanitizedCode !== latestCode;
    let codePushOk = !codeStandardized;

    if (codeStandardized) {
      try {
        await callAppsScriptTool("apps_script_write_file", {
          projectId: gasProjectId,
          fileName: "UserAutomation.gs",
          content: sanitizedCode,
        });
        await callAppsScriptTool("apps_script_push_to_google", {
          projectId: gasProjectId,
        });
        codePushOk = true;
      } catch (pushCodeErr: any) {
        console.warn("[Sync-Code] UserAutomation.gs standardize push warning:", pushCodeErr.message);
        codePushOk = false;
      }
    }

    const latestManifest = remote.manifest;

    const functionMatches = [...sanitizedCode.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)];
    const functionNames = functionMatches.map((m) => m[1]);

    // 8. SheetBot 표준 토큰 충전 모듈(TokenRecharge.gs) 최신화 및 구글 클라우드 자동 배포 (Push)
    try {
      await callAppsScriptTool("apps_script_write_file", {
        projectId: gasProjectId,
        fileName: "TokenRecharge.gs",
        content: generateStandardTokenRecharge(),
      });
      await callAppsScriptTool("apps_script_push_to_google", {
        projectId: gasProjectId,
      });
    } catch (pushErr: any) {
      console.warn("[Sync-Code] TokenRecharge.gs push warning:", pushErr.message);
    }

    // 9. SheetBot DB 갱신
    const nowStr = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      script_code: sanitizedCode,
      updated_at: nowStr,
      updated_by: userEmail,
    };
    if (latestManifest) {
      updatePayload.manifest = latestManifest;
    }
    if (gasProjectId && !project.gas_project_id) {
      updatePayload.gas_project_id = gasProjectId;
    }

    await updateRows("sheetbot_projects", updatePayload, {
      filters: {
        id: projectId,
        user_email: userEmail.toLowerCase().trim(),
      },
    });

    const standardizeNote = codeStandardized
      ? codePushOk
        ? "SheetBot 표준 UserAutomation.gs 보정본이 구글에 배포되었습니다."
        : "UserAutomation.gs 표준 보정은 적용했으나 구글 배포에 실패했습니다. 잠시 후 다시 시도해 주세요."
      : "UserAutomation.gs는 이미 SheetBot 표준과 일치합니다.";

    return NextResponse.json({
      success: true,
      message: `${standardizeNote} 최신 토큰 충전 모듈(TokenRecharge.gs)도 갱신되었습니다.`,
      syncedAt: nowStr,
      functionNames,
      codeLength: sanitizedCode.length,
      scriptCode: sanitizedCode,
      codeStandardized,
      codePushOk,
    });
  } catch (err: any) {
    console.error("[Sync-Code] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "코드 동기화 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
