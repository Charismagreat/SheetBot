import { NextResponse } from "next/server";
import {
  getCurrentUserEmail,
  getCurrentVisitorSessionId,
  isCurrentUserAdmin,
  resolveVisitorSiteOriginFromRequest,
} from "@/lib/auth";
import {
  createSpreadsheet,
  createSpreadsheetInEgdeskFolder,
  callSheetsTool,
  callDriveTool,
  WorkspaceVisitorCallOptions,
  callVisitorWorkspaceTool,
} from "@/lib/egdesk-helpers";

export async function GET(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail(request);
    const isAdmin = userEmail ? await isCurrentUserAdmin(userEmail) : false;
    const visitorSessionId = await getCurrentVisitorSessionId(request);
    const siteOrigin = resolveVisitorSiteOriginFromRequest(request);

    // End users must have a visitor session — operator MCP "connected" is not their Drive.
    if (!visitorSessionId && !isAdmin) {
      return NextResponse.json({
        success: true,
        canAutoCreate: false,
        oauthRequired: true,
        code: "VISITOR_SESSION_MISSING",
        error:
          "구글 시트 자동 생성에는 BYO Google 로그인(EGDesk 방문자 세션)이 필요합니다. /login에서 다시 로그인해 주세요.",
        authStatus: { sheets: null, drive: null },
        quickCreateUrl: "https://docs.google.com/spreadsheets/create",
      });
    }

    const visitorOptions: WorkspaceVisitorCallOptions = visitorSessionId
      ? { asVisitor: true, visitorSessionId, visitorOrigin: siteOrigin }
      : {};

    const sheetsAuth = visitorSessionId
      ? await callVisitorWorkspaceTool("sheets", "sheets_auth_status", {}, visitorSessionId, siteOrigin).catch(
          () => null,
        )
      : await callSheetsTool("sheets_auth_status", {}, visitorOptions).catch(() => null);
    const driveAuth = visitorSessionId
      ? await callVisitorWorkspaceTool("drive", "drive_auth_status", {}, visitorSessionId, siteOrigin).catch(
          () => null,
        )
      : await callDriveTool("drive_auth_status", {}, visitorOptions).catch(() => null);

    const sheetsOk = Boolean(sheetsAuth && sheetsAuth.connected !== false && !sheetsAuth.error);
    const driveOk = Boolean(driveAuth && driveAuth.status === "connected");
    const canCreate = sheetsOk || driveOk;

    return NextResponse.json({
      success: true,
      canAutoCreate: canCreate,
      oauthRequired: !canCreate,
      authStatus: { sheets: sheetsAuth, drive: driveAuth },
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    });
  } catch (err: any) {
    return NextResponse.json({
      success: true,
      canAutoCreate: false,
      error: err.message,
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    });
  }
}

export async function POST(request: Request) {
  try {
    let userEmail = await getCurrentUserEmail(request);
    let apiKeyVisitorSessionId: string | null = null;

    // 만약 세션 쿠키가 없다면 API 키(Authorization: Bearer sk_sheetbot_... 또는 x-api-key) 확인
    if (!userEmail) {
      const authHeader = request.headers.get("authorization") || "";
      let apiKey = "";
      if (authHeader.startsWith("Bearer ")) {
        apiKey = authHeader.substring(7).trim();
      } else {
        apiKey = request.headers.get("x-api-key")?.trim() || request.headers.get("x-sheetbot-key")?.trim() || "";
      }

      if (apiKey && apiKey.startsWith("sk_sheetbot_")) {
        const { verifyApiKey } = await import("@/lib/api-keys");
        const keyResult = await verifyApiKey(apiKey);
        if (keyResult.valid && keyResult.userEmail) {
          userEmail = keyResult.userEmail;
          apiKeyVisitorSessionId = keyResult.visitorSessionId || null;
        }
      }
    }

    if (!userEmail && process.env.NODE_ENV === "development") {
      userEmail = "test.user@sheetbot.dev";
    }

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인 또는 API 키 인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { title = "새 스프레드시트", data = [] } = body;

    let visitorSessionId = await getCurrentVisitorSessionId(request);
    if (!visitorSessionId && apiKeyVisitorSessionId) {
      visitorSessionId = apiKeyVisitorSessionId;
    }

    const isAdmin = await isCurrentUserAdmin(userEmail);
    const siteOrigin = resolveVisitorSiteOriginFromRequest(request);

    if (!visitorSessionId && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          code: "VISITOR_SESSION_MISSING",
          oauthRequired: true,
          error:
            "구글 시트를 자동 생성하려면 BYO Google 로그인(EGDesk 방문자 세션)이 필요합니다. /login에서 다시 로그인한 뒤 재시도해 주세요.",
          quickCreateUrl: "https://docs.google.com/spreadsheets/create",
        },
        { status: 401 },
      );
    }

    const visitorOptions: WorkspaceVisitorCallOptions = visitorSessionId
      ? { asVisitor: true, visitorSessionId, visitorOrigin: siteOrigin }
      : {};

    let result: any = null;
    let createMethod = "sheets";
    const thrownErrors: string[] = [];

    // 1차 시도: 방문자(유저) 권한으로 Google Sheets API sheets_create_spreadsheet (유저 본인 드라이브에 생성)
    try {
      if (visitorSessionId) {
        result = await callVisitorWorkspaceTool(
          "sheets",
          "sheets_create_spreadsheet",
          { title, data },
          visitorSessionId,
          siteOrigin
        );
      } else {
        result = await callSheetsTool("sheets_create_spreadsheet", { title, data }, visitorOptions);
      }
    } catch (sheetsErr: any) {
      thrownErrors.push(String(sheetsErr?.message || ""));
      console.warn("[Sheets-Create] Primary sheets_create_spreadsheet failed, attempting fallback:", sheetsErr?.message);
    }

    // 2차 시도: 1차가 실패했거나 에러인 경우 Drive API (createSpreadsheetInEgdeskFolder)
    if (!result || (!result.spreadsheetId && !result.id)) {
      try {
        if (visitorSessionId) {
          result = await callVisitorWorkspaceTool(
            "drive",
            "drive_create_spreadsheet_in_folder",
            { title, subfolder: "Dev", data },
            visitorSessionId,
            siteOrigin
          );
        } else {
          result = await callDriveTool("drive_create_spreadsheet_in_folder", {
            title,
            subfolder: "Dev",
            data,
          }, visitorOptions);
        }
        createMethod = "drive";
      } catch (driveErr: any) {
        thrownErrors.push(String(driveErr?.message || ""));
        console.warn("[Sheets-Create] Drive fallback failed:", driveErr?.message);
      }
    }

    if (result && (result.spreadsheetId || result.id)) {
      const spreadsheetId = result.spreadsheetId || result.id;
      const spreadsheetUrl =
        result.spreadsheetUrl ||
        result.url ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      return NextResponse.json({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        title,
        createdVia: createMethod,
      });
    }

    // 결과 객체 또는 throw된 예외에 담긴 에러 분류
    const errorMsg =
      result?.error || result?.message || thrownErrors.find(Boolean) || "구글 시트 자동 생성에 실패했습니다.";
    const allErrText = [errorMsg, ...thrownErrors, result?.code, result?.reason].filter(Boolean).join(" | ");
    // 방문자 세션 만료 / 미로그인 / 리프레시 토큰 무효 / 사이트 불일치 → 구글 재인증 필요
    const isVisitorAuthError =
      /not signed in|startVisitorGoogleLogin|not valid for this site|token_expired|refresh token|Re-authorize|VISITOR_WORKSPACE_AUTH|VISITOR_GOOG/i.test(
        allErrText,
      );
    const isOauthError =
      isVisitorAuthError ||
      errorMsg.includes("OAuth") ||
      errorMsg.includes("token") ||
      result?.code === "GOOGLE_OAUTH_TOKEN";

    return NextResponse.json({
      success: false,
      code: isVisitorAuthError ? "VISITOR_SESSION_MISSING" : isOauthError ? "GOOGLE_OAUTH_TOKEN_MISSING" : "SHEET_CREATE_FAILED",
      oauthRequired: isOauthError,
      error: isVisitorAuthError
        ? "구글 계정 연결이 만료되었습니다. 구글 시트/드라이브 권한을 다시 승인(재로그인)한 뒤 재시도해 주세요."
        : errorMsg,
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    });
  } catch (err: any) {
    console.error("[Sheets-Create] Error:", err);
    const isOauth = err.message?.includes("OAuth") || err.message?.includes("token") || err.message?.includes("connected");
    return NextResponse.json({
      success: false,
      code: isOauth ? "GOOGLE_OAUTH_TOKEN_MISSING" : "UNKNOWN_ERROR",
      oauthRequired: isOauth,
      error: err.message || "시트 생성 중 오류가 발생했습니다.",
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    }, { status: 500 });
  }
}

