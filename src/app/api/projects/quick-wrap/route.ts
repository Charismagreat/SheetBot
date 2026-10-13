export const dynamic = "force-dynamic";

/**
 * Target (WRAPPING.md): create/resolve sheet → `wrap()` → `WrapResult` (bridge only after `wrapped_at`).
 * Phase 2: default path calls `wrapProject` when a spreadsheet id exists.
 * Legacy bridge-only (no shell): set `SHEETBOT_LEGACY_QUICK_WRAP=1`.
 */

import { NextResponse, NextRequest } from "next/server";
import {
  buildWorkspaceVisitorCallOptions,
  getCurrentUserEmail,
  getCurrentVisitorSessionId,
  isCurrentUserAdmin,
  resolveVisitorSiteOriginFromRequest,
} from "@/lib/auth";
import { queryTable, insertRows, updateRows, getSpreadsheetFullContext } from "@/lib/egdesk-helpers";
import { ensureBridgeTokenForProject } from "@/lib/bridge-token-persist";
import { resolveGasBridgePostEndpoint } from "@/lib/bridge-public-url";
import { setupDatabase } from "@/lib/setup-db";
import { wrapProject } from "@/lib/gas/sheetbot-deploy-service";
import { createUserSpreadsheet } from "@/lib/sheets/create-user-spreadsheet";
import { SheetbotServiceError, sheetbotErrorResponse } from "@/lib/wrapping/sheetbot-api-error";

function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

function useLegacyQuickWrapBridgeOnly(): boolean {
  return process.env.SHEETBOT_LEGACY_QUICK_WRAP === "1";
}

export async function POST(request: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json(
        {
          success: false,
          code: "LOGIN_REQUIRED",
          error:
            "1초 래핑을 진행하려면 로그인이 필요합니다. BYO Google 로그인 후 다시 시도해 주세요. (NextAuth 세션 쿠키 또는 방문자 세션이 서버에 전달되어야 합니다.)",
        },
        { status: 401 },
      );
    }

    const visitorSessionId = await getCurrentVisitorSessionId(request);
    const isAdmin = await isCurrentUserAdmin(userEmail);
    const visitorWorkspaceOptions = await buildWorkspaceVisitorCallOptions(request, userEmail);
    const siteOrigin = resolveVisitorSiteOriginFromRequest(request);

    const body = await request.json();
    const { sheetUrl, templateName, presetPrompt } = body;

    const rawSheetUrl = (sheetUrl || "").trim();
    const isNewSheet = !rawSheetUrl || rawSheetUrl === "NEW_SHEET" || rawSheetUrl.includes("spreadsheets/create");
    let spreadsheetId = extractSpreadsheetId(rawSheetUrl);
    let sheetUrlResolved = rawSheetUrl;

    if (!spreadsheetId && !isNewSheet) {
      return NextResponse.json({ success: false, error: "올바른 구글 스프레드시트 주소(https://docs.google.com/spreadsheets/d/...)를 입력해 주세요." }, { status: 400 });
    }

    const tplTitle = templateName || (isNewSheet ? "스마트 자동화 시트" : "");
    if (isNewSheet && !spreadsheetId) {
      const created = await createUserSpreadsheet({
        title: templateName ? `[SheetBot] ${String(templateName).replace(/^\[SheetBot\]\s*/i, "")}` : "[SheetBot] 스마트 자동화 시트",
        visitorSessionId,
        siteOrigin,
        visitorOptions: visitorWorkspaceOptions.asVisitor ? visitorWorkspaceOptions : {},
      });
      if (!created.ok) {
        return NextResponse.json(
          {
            success: false,
            code: created.code,
            error: created.message,
            oauthRequired: created.oauthRequired,
          },
          { status: created.oauthRequired ? 401 : 502 },
        );
      }
      spreadsheetId = created.spreadsheetId;
      sheetUrlResolved = created.spreadsheetUrl;
    }

    if (!spreadsheetId && !useLegacyQuickWrapBridgeOnly()) {
      return NextResponse.json(
        {
          success: false,
          code: "WRAP_SHEET_MISSING",
          error: "래핑하려면 스프레드시트 ID가 필요합니다. 시트를 생성하거나 URL을 입력해 주세요.",
        },
        { status: 400 },
      );
    }

    let project: any = null;
    let isExisting = false;

    if (spreadsheetId) {
      const existingProjects = await queryTable("sheetbot_projects", {
        filters: { user_email: userEmail },
        limit: 100,
      }).catch(() => ({ rows: [] }));

      const matched = (existingProjects.rows || []).find((p: any) => p.spreadsheet_id === spreadsheetId);

      const now = new Date().toISOString();

      if (matched) {
        project = matched;
        isExisting = true;

        if (matched.deleted_at || matched.status === "PENDING_DELETE" || matched.status === "TRASHED") {
          await updateRows(
            "sheetbot_projects",
            {
              status: "ACTIVE",
              deleted_at: null,
              deleted_by: null,
              restored_at: now,
              restored_by: userEmail,
              updated_at: now,
              updated_by: userEmail,
            },
            { filters: { id: matched.id } },
          ).catch(() => null);
          project.deleted_at = null;
          project.status = "ACTIVE";
        }

        if (templateName && (matched.name === "시트봇 자동화 프로젝트" || matched.name === "스마트 자동화 시트")) {
          await updateRows(
            "sheetbot_projects",
            { name: templateName, updated_at: now },
            { filters: { id: matched.id } },
          ).catch(() => null);
          project.name = templateName;
        }
      }
    }

    const now = new Date().toISOString();

    if (!project) {
      const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let projectName = templateName || "";

      if (isNewSheet) {
        projectName = templateName
          ? `[SheetBot] ${templateName.replace(/^\[SheetBot\]\s*/i, "")}`
          : "[SheetBot] 스마트 자동화 시트";
      } else if (!projectName && spreadsheetId) {
        try {
          const fullContext = await getSpreadsheetFullContext(
            spreadsheetId,
            1,
            visitorWorkspaceOptions.asVisitor ? visitorWorkspaceOptions : {},
          );
          if (fullContext?.metadata?.title) {
            projectName = fullContext.metadata.title.trim();
          }
        } catch (e: any) {
          console.warn("[Quick-Wrap] Failed to get spreadsheet title:", e.message);
          if (!isAdmin && !visitorSessionId) {
            console.warn("[Quick-Wrap] Title fetch may need BYO visitor session; continuing with default project name.");
          }
        }
      }

      if (!projectName) {
        projectName = isNewSheet ? "[SheetBot] 스마트 자동화 시트" : "시트봇 자동화 프로젝트";
      }

      const newRow = {
        id: projectId,
        user_email: userEmail,
        name: projectName,
        description: "1초 래핑으로 자동 등록된 AI 에이전트(안티그라비티, Cursor, Claude Code) 래핑 프로젝트",
        spreadsheet_id: spreadsheetId || "",
        spreadsheet_url: sheetUrlResolved || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : "https://sheets.new"),
        status: "ACTIVE",
        features: JSON.stringify(["안티그라비티 바이브코딩 연동", "브릿지 API 지원"]),
        created_at: now,
        updated_at: now,
      };

      await insertRows("sheetbot_projects", [newRow]);
      project = newRow;
      isExisting = false;
    }

    const defaultRequirement = presetPrompt || (
      isNewSheet
        ? "새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘."
        : "내 구글 시트의 헤더 구조와 데이터를 파악하고, 실무에 필요한 스프레드시트 자동화 메뉴와 기능을 주입해줘."
    );

    const legacyBridge = useLegacyQuickWrapBridgeOnly();

    if (!legacyBridge && spreadsheetId) {
      const token = await ensureBridgeTokenForProject(project.id, userEmail, project.bridge_token);
      const bridgeUrl = resolveGasBridgePostEndpoint(request, token);
      const promptTemplate = isNewSheet
        ? `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: ${defaultRequirement}`
        : `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: ${defaultRequirement}`;

      try {
        const wrapResult = await wrapProject({
          projectId: project.id,
          userEmail,
          visitorOptions: visitorWorkspaceOptions.asVisitor ? visitorWorkspaceOptions : {},
          bridgeUrl,
          promptTemplate,
          preflightBalance: true,
        });
        return NextResponse.json({ ...wrapResult, isExisting, isNewSheet });
      } catch (err) {
        if (err instanceof SheetbotServiceError) {
          return sheetbotErrorResponse(err.apiError);
        }
        throw err;
      }
    }

    const token = await ensureBridgeTokenForProject(project.id, userEmail, project.bridge_token);
    const bridgeUrl = resolveGasBridgePostEndpoint(request, token);
    const promptTemplate = isNewSheet
      ? `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: ${defaultRequirement}`
      : `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:
웹 주소: ${bridgeUrl}
요구사항: ${defaultRequirement}`;

    return NextResponse.json({
      success: true,
      isExisting,
      isNewSheet,
      projectId: project.id,
      projectName: project.name,
      sheetUrl: project.spreadsheet_url,
      spreadsheetId: project.spreadsheet_id || "",
      token,
      bridgeUrl,
      promptTemplate,
      legacyBridgeOnly: true,
    });
  } catch (err: any) {
    console.error("[Quick-Wrap API] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "1초 래핑 처리 실패" }, { status: 500 });
  }
}
