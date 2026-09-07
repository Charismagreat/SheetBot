export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAppsScriptTool } from "@/lib/egdesk-helpers";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

export async function GET(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const urlOrId = searchParams.get("sheetUrl") || searchParams.get("url") || searchParams.get("id") || "";

    if (!urlOrId.trim()) {
      return NextResponse.json(
        { success: false, error: "스프레드시트 URL 또는 ID가 필요합니다." },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(urlOrId);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "유효한 스프레드시트 URL 또는 ID가 아닙니다." },
        { status: 400 }
      );
    }

    // 1. 등록된 Apps Script 프로젝트 목록에서 해당 시트(containerId)와 매칭되는 프로젝트 검색
    let matchedProject: any = null;
    try {
      const listRes = await callAppsScriptTool("apps_script_list_projects", {});
      const projects = Array.isArray(listRes)
        ? listRes
        : (listRes?.projects || listRes?.result || []);

      matchedProject = projects.find(
        (p: any) =>
          p.containerId === spreadsheetId ||
          p.spreadsheetId === spreadsheetId ||
          (p.containerUrl && p.containerUrl.includes(spreadsheetId)) ||
          (p.spreadsheetUrl && p.spreadsheetUrl.includes(spreadsheetId))
      );
    } catch (listErr: any) {
      console.warn("[Detect-GAS] list_projects warning:", listErr.message);
    }

    // 2. 만약 목록에 아직 등록되어 있지 않다면, apps_script_create_bound(force: false)로 기존 바인딩 감지 시도
    let gasProjectId = matchedProject?.id || matchedProject?.projectId || "";
    if (!gasProjectId) {
      try {
        const boundRes = await callAppsScriptTool("apps_script_create_bound", {
          fileId: spreadsheetId,
          force: false,
        });
        if (boundRes && (boundRes.id || boundRes.projectId)) {
          gasProjectId = boundRes.id || boundRes.projectId;
          matchedProject = boundRes;
        }
      } catch (bindErr: any) {
        console.warn("[Detect-GAS] create_bound check warning:", bindErr.message);
      }
    }

    if (!gasProjectId) {
      return NextResponse.json({
        success: true,
        hasExistingScript: false,
        message: "바인딩된 Apps Script 프로젝트가 없습니다.",
      });
    }

    // 3. 파일 목록 조회
    let files: any[] = [];
    try {
      const filesRes = await callAppsScriptTool("apps_script_list_files", {
        projectId: gasProjectId,
      });
      files = Array.isArray(filesRes)
        ? filesRes
        : (filesRes?.files || filesRes?.result || []);
    } catch (filesErr: any) {
      console.warn("[Detect-GAS] list_files warning:", filesErr.message);
    }

    // 4. Code.gs 파일 내용 읽기
    let existingCode = "";
    const codeFile = files.find((f: any) => f.name === "Code.gs" || f.name === "Code");
    if (codeFile) {
      try {
        const readRes = await callAppsScriptTool("apps_script_read_file", {
          projectId: gasProjectId,
          fileName: codeFile.name,
        });
        existingCode = typeof readRes === "string" ? readRes : (readRes?.content || readRes?.data || "");
      } catch (readErr: any) {
        console.warn("[Detect-GAS] read Code.gs warning:", readErr.message);
      }
    }

    // 5. 기본 starter 코드(단순 빈 코드나 기본 헬로월드)인지 실제 커스텀 코드가 있는지 분석
    const trimmedCode = existingCode.trim();
    const isTrivialStarter =
      !trimmedCode ||
      trimmedCode === "function myFunction() {\n  \n}" ||
      trimmedCode === "function myFunction() {}" ||
      (trimmedCode.length < 120 && trimmedCode.includes("myFunction") && !trimmedCode.includes("onOpen") && !trimmedCode.includes("SpreadsheetApp"));

    const hasMeaningfulCode = Boolean(trimmedCode && !isTrivialStarter);

    // 감지된 함수명 목록 추출
    const functionMatches = [...trimmedCode.matchAll(/function\s+([a-zA-Z0-9_$]+)\s*\(/g)];
    const functionNames = functionMatches.map((m) => m[1]);

    return NextResponse.json({
      success: true,
      hasExistingScript: hasMeaningfulCode || files.length > 2,
      projectId: gasProjectId,
      filesCount: files.length,
      files: files.map((f: any) => ({ name: f.name, type: f.type })),
      functionNames,
      existingCode: hasMeaningfulCode ? existingCode : "",
      scriptUrl: `https://script.google.com/d/${matchedProject?.scriptId || gasProjectId}/edit`,
      isTrivialStarter,
    });
  } catch (err: any) {
    console.error("[Detect-GAS] Unexpected error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Apps Script 감지 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
