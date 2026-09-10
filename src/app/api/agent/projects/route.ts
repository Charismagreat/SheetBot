export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { verifyApiKey } from "@/lib/api-keys";
import { checkTokenBalance } from "@/lib/token-wallet";
import {
  queryTable,
  insertRows,
  updateRows,
  callAppsScriptTool,
  getSpreadsheetFullContext,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

// 구글 스프레드시트 URL에서 ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * POST: 외부 AI 에이전트(안티그라비티 등)가 사용자 API 키를 통해 원격으로 프로젝트를 즉시 프로비저닝
 * - API Key 인증 (Authorization: Bearer sk_sheetbot_... 또는 X-Api-Key)
 * - 스프레드시트 검증 및 Apps Script 바운드 프로젝트 생성
 * - 이지데스크 터널 인프라 자동 주입
 * - 브릿지 토큰 및 URL 발급, 시트 구조 분석 데이터 즉시 반환
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();

    // 1. API 키 인증 추출 (Bearer 또는 X-Api-Key)
    const authHeader = request.headers.get("authorization") || "";
    let apiKey = "";

    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    } else {
      apiKey = request.headers.get("x-api-key")?.trim() || "";
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "API 키 인증이 필요합니다. 'Authorization: Bearer sk_sheetbot_...' 또는 'X-Api-Key' 헤더를 전달하세요.",
        },
        { status: 401 }
      );
    }

    const authCheck = await verifyApiKey(apiKey);
    if (!authCheck.valid || !authCheck.userEmail) {
      return NextResponse.json(
        { success: false, error: authCheck.error || "유효하지 않거나 만료된 API 키입니다." },
        { status: 403 }
      );
    }

    const userEmail = authCheck.userEmail;

    // 2. 바디 파싱
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "요청 본문(JSON)을 파싱할 수 없습니다." },
        { status: 400 }
      );
    }

    const { spreadsheetUrl, name, description, prompt = "" } = body;

    if (!spreadsheetUrl) {
      return NextResponse.json(
        { success: false, error: "spreadsheetUrl(구글 스프레드시트 주소)은 필수입니다." },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "올바른 구글 스프레드시트 URL 형식이 아닙니다." },
        { status: 400 }
      );
    }

    // 3. 토큰 잔액 검사 (최소 500 토큰 필요)
    const tokenCheck = await checkTokenBalance(userEmail, 500);
    if (!tokenCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: tokenCheck.reason || "프로젝트 생성을 위한 잔여 토큰이 부족합니다.",
          balance: tokenCheck.balance,
        },
        { status: 402 }
      );
    }

    // 4. 스프레드시트 구조 분석 (최대 30행 샘플을 읽어 헤더 및 탭 자동 탐지)
    let sheetsContext: any = null;
    let detectedStructure: any = [];
    let detectedSheetTitle = "SheetBot 자동화 프로젝트";

    try {
      sheetsContext = await getSpreadsheetFullContext(spreadsheetId, 30);
      if (sheetsContext) {
        if (sheetsContext.title) {
          detectedSheetTitle = sheetsContext.title;
        }
        if (sheetsContext.sheetsData) {
          detectedStructure = sheetsContext.sheetsData.map((tab: any) => {
            const rawHeaders = tab.headers || [];
            const sampleRows = tab.sampleData || [];

            let detectedHeaderRow = 1;
            let detectedHeaders = rawHeaders;

            if (sampleRows.length > 0) {
              for (let r = 0; r < Math.min(15, sampleRows.length); r++) {
                const row = sampleRows[r];
                if (Array.isArray(row)) {
                  const nonEmptyCount = row.filter(
                    (c: any) => c !== null && c !== undefined && String(c).trim().length > 0
                  ).length;
                  if (nonEmptyCount >= 3 && nonEmptyCount > (rawHeaders.length || 0)) {
                    detectedHeaderRow = r + 2;
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
      }
    } catch (sheetErr: any) {
      console.warn("[Agent-Projects] Spreadsheets context fetch warning:", sheetErr.message);
    }

    const projectName = (name && name.trim()) || detectedSheetTitle || "SheetBot 자동화 프로젝트";
    const now = new Date().toISOString();
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const bridgeToken = `sec_${crypto.randomBytes(16).toString("hex")}`;

    // 5. 구글 Apps Script 바운드 프로젝트 생성 시도
    let gasProjectId = "";
    let scriptId = "";
    let scriptUrl = "";

    try {
      // 이미 해당 스프레드시트에 연결된 바운드 프로젝트가 있는지 우선 검색
      let existingGasProject: any = null;
      try {
        const listRes = await callAppsScriptTool("apps_script_list_projects", {});
        const allProjects = Array.isArray(listRes)
          ? listRes
          : (listRes?.projects || listRes?.result || []);
        existingGasProject = allProjects.find(
          (p: any) =>
            p.containerId === spreadsheetId ||
            p.spreadsheetId === spreadsheetId ||
            (p.containerUrl && p.containerUrl.includes(spreadsheetId)) ||
            (p.spreadsheetUrl && p.spreadsheetUrl.includes(spreadsheetId))
        );
      } catch (listErr: any) {
        console.warn("[Agent-Projects] list_projects check note:", listErr.message);
      }

      if (existingGasProject && (existingGasProject.id || existingGasProject.projectId)) {
        gasProjectId = existingGasProject.id || existingGasProject.projectId;
        scriptId = existingGasProject.scriptId || gasProjectId;
        scriptUrl = existingGasProject.scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
        console.log(`[Agent-Projects] Reusing existing bound Apps Script project: ${gasProjectId}`);
      } else {
        const boundRes = await callAppsScriptTool("apps_script_create_bound", {
          fileId: spreadsheetId,
          title: projectName,
        });

        if (boundRes && (boundRes.id || boundRes.projectId)) {
          gasProjectId = boundRes.id || boundRes.projectId;
          scriptId = boundRes.scriptId || gasProjectId;
          scriptUrl = boundRes.scriptUrl || `https://script.google.com/d/${scriptId}/edit`;
        }
      }

      // 이지데스크 터널 인프라 자동 주입
      await callAppsScriptTool("apps_script_setup_egdesk_tunnel", {
        projectId: gasProjectId,
      }).catch((tErr: any) => console.warn("[Agent-Projects] Tunnel setup warning:", tErr.message));
    } catch (gasErr: any) {
      console.warn("[Agent-Projects] Apps Script create bound warning:", gasErr.message);
    }

    // 6. DB 레코드 저장
    const newProjectRow = {
      id: projectId,
      uuid: crypto.randomUUID(),
      user_email: userEmail.toLowerCase().trim(),
      name: projectName,
      description: description || "AI 에이전트 원격 자동 프로비저닝",
      spreadsheet_id: spreadsheetId,
      spreadsheet_url: spreadsheetUrl,
      gas_project_id: gasProjectId,
      script_id: scriptId,
      script_url: scriptUrl,
      script_code: "",
      manifest: "",
      summary: "AI 에이전트에 의해 자동 생성된 프로젝트",
      features: JSON.stringify(["AI_AGENT_PROVISIONED", "EGDESK_TUNNEL"]),
      triggers: JSON.stringify([]),
      prompt: prompt,
      webapp_url: "",
      bridge_token: bridgeToken,
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
      updated_by: `api_key:${userEmail}`,
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    };

    await insertRows("sheetbot_projects", [newProjectRow]);

    // 7. 반환 URL 및 프롬프트 생성
    const host = request.headers.get("host") || "localhost:3002";
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const baseUrl = `${protocol}://${host}`;
    const bridgeUrl = `${baseUrl}/api/agent/gas-bridge?token=${bridgeToken}`;

    const promptTemplate = `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: ${prompt || "[여기에 원하는 자동화 요구사항 입력]"}`;

    return NextResponse.json({
      success: true,
      message: "시트봇 프로젝트가 성공적으로 생성되었으며 AI 브릿지 URL이 발급되었습니다.",
      project: {
        id: projectId,
        name: projectName,
        userEmail: userEmail,
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: spreadsheetUrl,
        gasProjectId: gasProjectId,
        scriptUrl: scriptUrl,
        createdAt: now,
      },
      bridgeToken: bridgeToken,
      bridgeUrl: bridgeUrl,
      spreadsheetAnalysis: {
        title: detectedSheetTitle,
        tabs: detectedStructure,
      },
      promptTemplate: promptTemplate,
      instructions: {
        step1: "시트의 구조가 파악되었으므로 요구사항에 맞는 Apps Script 코드를 작성하세요.",
        step2: `작성 완료된 코드를 POST ${bridgeUrl} 로 body: { "scriptCode": "..." } 형태로 전송하면 구글 시트에 즉시 자동 배포됩니다.`,
      },
    });
  } catch (err: any) {
    console.error("[Agent-Projects POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "원격 프로젝트 생성 실패" }, { status: 500 });
  }
}
