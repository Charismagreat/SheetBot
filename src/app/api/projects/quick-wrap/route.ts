export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows, getSpreadsheetFullContext } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import crypto from "crypto";

// 구글 스프레드시트 URL에서 Spreadsheet ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    await setupDatabase();
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || "guest@sheetbot.cloud";

    const body = await request.json();
    const { sheetUrl, templateName, presetPrompt } = body;

    const rawSheetUrl = (sheetUrl || "").trim();
    const isNewSheet = !rawSheetUrl || rawSheetUrl === "NEW_SHEET" || rawSheetUrl.includes("spreadsheets/create");
    const spreadsheetId = extractSpreadsheetId(rawSheetUrl);
    if (!spreadsheetId && !isNewSheet) {
      return NextResponse.json({ success: false, error: "올바른 구글 스프레드시트 주소(https://docs.google.com/spreadsheets/d/...)를 입력해 주세요." }, { status: 400 });
    }

    // 1. 이미 동일한 시트로 등록된 프로젝트가 있는지 확인 (기존 스프레드시트 ID가 있는 경우에만 매칭)
    let project: any = null;
    let isExisting = false;

    if (spreadsheetId) {
      const existingProjects = await queryTable("sheetbot_projects", {
        filters: { user_email: userEmail },
        limit: 100,
      }).catch(() => ({ rows: [] }));

      const matched = (existingProjects.rows || []).find(
        (p: any) => p.spreadsheet_id === spreadsheetId
      );

      const now = new Date().toISOString();

      if (matched) {
        project = matched;
        isExisting = true;

        // 만약 휴지통에 있던 프로젝트라면 자동으로 활성화 복원
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
            { filters: { id: matched.id } }
          ).catch(() => null);
          project.deleted_at = null;
          project.status = "ACTIVE";
        }

        // 템플릿 이름이 전달되었고 기존 이름이 기본값인 경우 최신화
        if (templateName && (matched.name === "시트봇 자동화 프로젝트" || matched.name === "스마트 자동화 시트")) {
          await updateRows(
            "sheetbot_projects",
            { name: templateName, updated_at: now },
            { filters: { id: matched.id } }
          ).catch(() => null);
          project.name = templateName;
        }
      }
    }

    const now = new Date().toISOString();

    if (!project) {
      // 2. 신규 프로젝트 즉시 생성 (Dual Naming Policy: 빈 시트는 [SheetBot], 기존 시트는 원래 이름 100% 보존)
      const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let projectName = templateName || "";

      if (isNewSheet) {
        // [빈 시트]: [SheetBot] 접두사 표준 적용
        projectName = templateName
          ? `[SheetBot] ${templateName.replace(/^\[SheetBot\]\s*/i, "")}`
          : "[SheetBot] 스마트 자동화 시트";
      } else if (!projectName && spreadsheetId) {
        // [기존 시트]: 구글 시트 원본 파일명을 100% 그대로 프로젝트명으로 채택
        try {
          const fullContext = await getSpreadsheetFullContext(spreadsheetId, 1);
          if (fullContext?.metadata?.title) {
            projectName = fullContext.metadata.title.trim();
          }
        } catch (e: any) {
          console.warn("[Quick-Wrap] Failed to get spreadsheet title:", e.message);
        }
      }

      if (!projectName) {
        projectName = isNewSheet ? "[SheetBot] 스마트 자동화 시트" : "시트봇 자동화 프로젝트";
      }

      const finalSheetUrl = isNewSheet ? "https://sheets.new" : rawSheetUrl;

      const newRow = {
        id: projectId,
        user_email: userEmail,
        name: projectName,
        description: "1초 래핑으로 자동 등록된 AI 에이전트(안티그라비티, Cursor, Claude Code) 연동 프로젝트",
        spreadsheet_id: spreadsheetId || "",
        spreadsheet_url: finalSheetUrl,
        status: "ACTIVE",
        features: JSON.stringify(["안티그라비티 바이브코딩 연동", "브릿지 API 지원"]),
        created_at: now,
        updated_at: now,
      };

      await insertRows("sheetbot_projects", [newRow]);
      project = newRow;
      isExisting = false;
    }

    // 3. 브릿지 토큰 발급
    let token = project.bridge_token;
    if (!token) {
      const existingTokenRes = await queryTable("sheetbot_bridge_tokens", {
        filters: { project_id: project.id },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (existingTokenRes.rows && existingTokenRes.rows.length > 0) {
        token = existingTokenRes.rows[0].token;
      } else {
        token = `sec_${crypto.randomBytes(16).toString("hex")}`;
        await insertRows("sheetbot_bridge_tokens", [
          {
            token,
            project_id: project.id,
            user_email: userEmail,
            created_at: now,
          },
        ]).catch(() => null);
      }
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost || request.headers.get("host") || request.nextUrl.host || "";

    let baseUrl = "https://sheetbot.cloud";
    if (host && host.includes("localhost")) {
      baseUrl = `http://${host}`;
    } else if (host) {
      baseUrl = `https://${host}`;
    }
    baseUrl = baseUrl.replace(/\/$/, "");
    const bridgeUrl = `${baseUrl}/api/agent/gas-bridge?token=${token}`;

    const defaultRequirement = presetPrompt || (
      isNewSheet
        ? "새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘."
        : "내 구글 시트의 헤더 구조와 데이터를 파악하고, 실무에 필요한 스프레드시트 자동화 메뉴와 기능을 주입해줘."
    );

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
    });
  } catch (err: any) {
    console.error("[Quick-Wrap API] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "1초 래핑 처리 실패" }, { status: 500 });
  }
}
