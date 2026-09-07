export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  queryTable,
  updateRows,
  callAppsScriptTool,
  getSpreadsheetFullContext,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * 1. GET: 외부 AI 에이전트가 스프레드시트의 탭, 헤더(10행 등), 기존 코드 및 코딩 지침 조회
 */
export async function GET(request: Request) {
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

    // 프로젝트 조회 (소유자 및 토큰 일치)
    const projectRes = await queryTable("sheetbot_projects", {
      filters: { bridge_token: token },
      limit: 1,
    });

    const project = (projectRes.rows || [])[0];
    if (!project || project.deleted_at) {
      return NextResponse.json(
        { success: false, error: "유효하지 않거나 만료된 브릿지 토큰입니다." },
        { status: 404 }
      );
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

    // 기존 Apps Script 프로젝트 소스코드 확인
    let currentCode = project.script_code || "";
    let currentManifest = project.manifest || "";
    let gasProjectId = project.gas_project_id || "";

    if (gasProjectId) {
      try {
        await callAppsScriptTool("apps_script_pull_from_google", { projectId: gasProjectId }).catch(() => null);
        const codeRes = await callAppsScriptTool("apps_script_read_file", { projectId: gasProjectId, fileName: "Code.gs" }).catch(() => null);
        if (codeRes && codeRes.content) currentCode = codeRes.content;
        const manifestRes = await callAppsScriptTool("apps_script_read_file", { projectId: gasProjectId, fileName: "appsscript.json" }).catch(() => null);
        if (manifestRes && manifestRes.content) currentManifest = manifestRes.content;
      } catch (e: any) {
        console.warn("[Gas-Bridge GET] Sync existing code note:", e.message);
      }
    }

    const host = request.headers.get("host") || "localhost:3002";
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const baseUrl = `${protocol}://${host}`;
    const postEndpoint = `${baseUrl}/api/agent/gas-bridge?token=${token}`;

    return NextResponse.json({
      success: true,
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
        codeGs: currentCode,
        manifest: currentManifest,
      },
      codingInstructions: {
        overview: "본 프로젝트는 이지데스크 터널 인프라(EgdeskConfig.gs, EgdeskClient.gs)가 자동 탑재되는 환경입니다.",
        absoluteRules: [
          "1. [개인 API 키 요구 금지]: 사용자에게 Gemini/OpenAI API 키를 요구하는 팝업/UI를 만들지 마세요. 이미 주입된 egdeskToolsCall('ai-caller', 'ai_caller_call', ...) 함수를 호출하세요.",
          "2. [실제 헤더 1:1 매핑]: 상단에 보고서 타이틀/결재란이 있어 헤더가 10행 등에 위치하는 경우, suggestedHeaderRow 및 dataStartRow를 엄격히 준수하여 신규 데이터를 기입하세요.",
          "3. [다중 품목 분리 삽입]: 발주서나 견적서 등 다중 품목 문서는 1건당 1행이 아니라 품목별로 1행씩(N개 행) 분리하여 시트에 순차 기록하세요.",
          "4. [onOpen 메뉴 등록]: 구글 시트 상단에 '🚀 SheetBot 자동화' 메뉴를 등록하는 onOpen() 함수를 반드시 포함하세요.",
          "5. [AI 응답 언래핑 함수]: parseAiCallerResponse(toolRes) 유틸리티 함수를 Code.gs에 포함하여 안전하게 JSON을 추출하세요.",
        ],
        postEndpoint,
        postPayloadExample: {
          scriptCode: "/* 완성된 Code.gs 전체 소스코드 */",
          manifest: "/* (선택) appsscript.json 내용. 생략 시 기본값 자동 적용 */",
          comment: "/* 변경 요약 (예: '발주서 OCR 분석 및 10행 기준 자동 기입 기능 주입') */",
        },
      },
    });
  } catch (err: any) {
    console.error("[Gas-Bridge GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * 2. POST: 외부 AI 에이전트가 완성한 코드를 구글 클라우드에 원클릭 자동 주입 및 배포
 */
export async function POST(request: Request) {
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
    const { scriptCode, manifest, comment = "AI 에이전트 자동 코드 주입" } = body;

    if (!scriptCode || !scriptCode.trim()) {
      return NextResponse.json(
        { success: false, error: "scriptCode(주입할 소스코드)가 필요합니다." },
        { status: 400 }
      );
    }

    // 프로젝트 조회
    const projectRes = await queryTable("sheetbot_projects", {
      filters: { bridge_token: token },
      limit: 1,
    });

    const project = (projectRes.rows || [])[0];
    if (!project || project.deleted_at) {
      return NextResponse.json(
        { success: false, error: "유효하지 않거나 만료된 브릿지 토큰입니다." },
        { status: 404 }
      );
    }

    let gasProjectId = project.gas_project_id;
    let scriptId = project.script_id;
    let scriptUrl = project.script_url;
    let webAppUrl = project.webapp_url || "";

    // 바인딩된 Apps Script 프로젝트가 아직 없으면 생성
    if (!gasProjectId && project.spreadsheet_id) {
      const boundRes = await callAppsScriptTool("apps_script_create_bound", {
        fileId: project.spreadsheet_id,
        title: project.name || "SheetBot 자동화",
        scriptCode,
      });

      if (boundRes && (boundRes.id || boundRes.projectId)) {
        gasProjectId = boundRes.id || boundRes.projectId;
        scriptId = boundRes.scriptId || gasProjectId;
        scriptUrl = boundRes.scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
      }
    }

    if (!gasProjectId) {
      return NextResponse.json(
        { success: false, error: "연동된 Google Apps Script 프로젝트를 초기화하지 못했습니다." },
        { status: 500 }
      );
    }

    // 1. 이지데스크 터널 인프라(EgdeskConfig.gs, EgdeskClient.gs) 자동 주입 보장
    try {
      await callAppsScriptTool("apps_script_setup_egdesk_tunnel", {
        projectId: gasProjectId,
        push: false,
      });
      console.log(`[Gas-Bridge POST] Injected EGDesk tunnel into ${gasProjectId}`);
    } catch (tunnelErr: any) {
      console.warn("[Gas-Bridge POST] Setup tunnel warning:", tunnelErr.message);
    }

    // 2. Code.gs 파일 기록
    await callAppsScriptTool("apps_script_write_file", {
      projectId: gasProjectId,
      fileName: "Code.gs",
      content: scriptCode,
    });

    // 3. appsscript.json 매니페스트 기록
    const finalManifest =
      manifest ||
      JSON.stringify(
        {
          timeZone: "Asia/Seoul",
          dependencies: {},
          exceptionLogging: "STACKDRIVER",
          runtimeVersion: "V8",
          oauthScopes: [
            "https://www.googleapis.com/auth/script.external_request",
            "https://www.googleapis.com/auth/spreadsheets",
          ],
        },
        null,
        2
      );

    await callAppsScriptTool("apps_script_write_file", {
      projectId: gasProjectId,
      fileName: "appsscript.json",
      content: finalManifest,
    });

    // 4. 구글 클라우드 최종 동기화 (Push)
    await callAppsScriptTool("apps_script_push_to_google", {
      projectId: gasProjectId,
    });

    // 5. 웹앱(doGet) 포함 시 웹앱 자동 배포
    if (scriptCode.includes("doGet") || scriptCode.includes("HtmlService")) {
      try {
        const deployRes = await callAppsScriptTool("apps_script_create_deployment", {
          projectId: gasProjectId,
          access: "ANYONE_ANONYMOUS",
          executeAs: "USER_DEPLOYING",
          description: `[Bridge] ${comment}`,
        });
        if (deployRes) {
          webAppUrl =
            deployRes.webAppUrl ||
            deployRes.url ||
            deployRes.entryPoints?.[0]?.webApp?.url ||
            (deployRes.deploymentId ? `https://script.google.com/macros/s/${deployRes.deploymentId}/exec` : "");
        }
      } catch (deployErr: any) {
        console.warn("[Gas-Bridge POST] Web app deployment note:", deployErr.message);
      }
    }

    // 6. DB 상태 갱신
    await updateRows(
      "sheetbot_projects",
      {
        gas_project_id: gasProjectId,
        script_id: scriptId || gasProjectId,
        script_url: scriptUrl,
        script_code: scriptCode,
        manifest: finalManifest,
        webapp_url: webAppUrl,
        updated_at: new Date().toISOString(),
      },
      {
        filters: { id: project.id },
      }
    );

    return NextResponse.json({
      success: true,
      message: "Google Apps Script 프로젝트에 코드가 성공적으로 주입 및 배포되었습니다.",
      deployment: {
        gasProjectId,
        scriptUrl,
        webAppUrl: webAppUrl || null,
        deployedAt: new Date().toISOString(),
        comment,
      },
    });
  } catch (err: any) {
    console.error("[Gas-Bridge POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
