import { NextResponse } from "next/server";
import { getCurrentUserEmail, getCurrentVisitorSessionId, isCurrentUserAdmin } from "@/lib/auth";
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
    const visitorSessionId = await getCurrentVisitorSessionId(request);
    const visitorOptions: WorkspaceVisitorCallOptions = visitorSessionId
      ? { asVisitor: true, visitorSessionId }
      : {};

    const sheetsAuth = await callSheetsTool("sheets_auth_status", {}, visitorOptions).catch(() => null);
    const driveAuth = await callDriveTool("drive_auth_status", {}, visitorOptions).catch(() => null);

    const sheetsOk = Boolean(sheetsAuth && sheetsAuth.connected !== false && !sheetsAuth.error);
    const driveOk = Boolean(driveAuth && driveAuth.status === "connected");
    const canCreate = sheetsOk || driveOk;

    return NextResponse.json({
      success: true,
      canAutoCreate: canCreate,
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
    let userEmail = await getCurrentUserEmail();
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
    const visitorOptions: WorkspaceVisitorCallOptions = visitorSessionId
      ? { asVisitor: true, visitorSessionId }
      : {};

    let result: any = null;
    let createMethod = "sheets";

    const host = request.headers.get("host") || "localhost:4003";
    const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const siteOrigin = `${protocol}://${host}`;

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

    // 결과 객체에 에러가 담겨온 경우
    const errorMsg = result?.error || result?.message || "구글 시트 자동 생성에 실패했습니다.";
    const isOauthError = errorMsg.includes("OAuth") || errorMsg.includes("token") || result?.code === "GOOGLE_OAUTH_TOKEN";

    return NextResponse.json({
      success: false,
      code: isOauthError ? "GOOGLE_OAUTH_TOKEN_MISSING" : "SHEET_CREATE_FAILED",
      oauthRequired: isOauthError,
      error: errorMsg,
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

