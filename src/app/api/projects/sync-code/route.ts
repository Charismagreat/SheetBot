export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, callAppsScriptTool } from "@/lib/egdesk-helpers";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * POST: 구글 시트의 클라우드 Apps Script 최신 코드를 읽어와 SheetBot DB에 동기화
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

    // 1. SheetBot DB에서 해당 프로젝트 조회 및 사용자 소유권 확인
    const projRes = await queryTable("sheetbot_projects", {
      filters: { id: projectId, user_email: userEmail.toLowerCase().trim() },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const project = projRes.rows?.[0];
    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없거나 권한이 없습니다." },
        { status: 404 }
      );
    }

    let gasProjectId = project.gas_project_id || project.script_id;
    const spreadsheetUrl = project.spreadsheet_url || project.spreadsheetUrl || "";
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

    // 3. 구글 클라우드에서 최신 버전 pull 실행
    try {
      await callAppsScriptTool("apps_script_pull_from_google", {
        projectId: gasProjectId,
      });
    } catch (pullErr: any) {
      console.warn("[Sync-Code] pull_from_google warning:", pullErr.message);
    }

    // 4. 최신 Code.gs 파일 내용 읽기
    let latestCode = "";
    try {
      const readRes = await callAppsScriptTool("apps_script_read_file", {
        projectId: gasProjectId,
        fileName: "Code.gs",
      });
      latestCode = typeof readRes === "string" ? readRes : (readRes?.content || readRes?.data || "");
    } catch (readErr: any) {
      console.warn("[Sync-Code] read Code.gs warning:", readErr.message);
    }

    if (!latestCode) {
      return NextResponse.json(
        { success: false, error: "구글 시트의 Apps Script 코드를 읽어오지 못했습니다." },
        { status: 400 }
      );
    }

    // 5. 최신 appsscript.json 파일 내용 읽기 (선택)
    let latestManifest = "";
    try {
      const manifestRes = await callAppsScriptTool("apps_script_read_file", {
        projectId: gasProjectId,
        fileName: "appsscript.json",
      });
      latestManifest = typeof manifestRes === "string" ? manifestRes : (manifestRes?.content || manifestRes?.data || "");
    } catch {
      // 매니페스트 실패는 치명적이지 않음
    }

    // 6. 감지된 함수명 목록 추출
    const functionMatches = [...latestCode.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)];
    const functionNames = functionMatches.map((m) => m[1]);

    // 7. SheetBot DB 갱신
    const nowStr = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      script_code: latestCode,
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

    return NextResponse.json({
      success: true,
      message: "구글 시트의 최신 코드가 SheetBot DB에 성공적으로 동기화되었습니다.",
      syncedAt: nowStr,
      functionNames,
      codeLength: latestCode.length,
      scriptCode: latestCode,
    });
  } catch (err: any) {
    console.error("[Sync-Code] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "코드 동기화 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
