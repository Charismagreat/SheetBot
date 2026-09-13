import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  createSpreadsheet,
  createSpreadsheetInEgdeskFolder,
  callSheetsTool,
  callDriveTool,
} from "@/lib/egdesk-helpers";

export async function GET() {
  try {
    const sheetsAuth = await callSheetsTool("sheets_auth_status", {}).catch(() => null);
    const driveAuth = await callDriveTool("drive_auth_status", {}).catch(() => null);

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
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { title = "새 스프레드시트", data = [] } = body;

    let result: any = null;
    let createMethod = "sheets";

    // 1차 시도: Google Sheets API createSpreadsheet
    try {
      result = await createSpreadsheet(title, data);
    } catch (sheetsErr: any) {
      console.warn("[Sheets-Create] Primary createSpreadsheet failed, attempting Drive fallback:", sheetsErr?.message);
    }

    // 2차 시도: 1차가 실패했거나 에러인 경우 Drive API (createSpreadsheetInEgdeskFolder)
    if (!result || (!result.spreadsheetId && !result.id)) {
      try {
        result = await createSpreadsheetInEgdeskFolder({
          title,
          subfolder: "Dev",
          data,
        });
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

