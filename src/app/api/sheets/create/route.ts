export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { createSpreadsheet, callSheetsTool } from "@/lib/egdesk-helpers";

export async function POST(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { title = "새 스프레드시트", data = [] } = body;

    // 1. Google Sheets 연결 상태 사전 점검
    try {
      const authStatus = await callSheetsTool("sheets_auth_status", {});
      // 만약 connected가 false이면 OAuth 미연결 상태
      if (authStatus && authStatus.connected === false) {
        return NextResponse.json({
          success: false,
          oauthRequired: true,
          error: "Google Workspace 인증이 필요합니다.",
          quickCreateUrl: "https://docs.google.com/spreadsheets/create",
        });
      }
    } catch (authErr: any) {
      console.warn("[Sheets-Create] Auth check warning:", authErr.message);
    }

    // 2. Google Spreadsheet 생성 시도
    const result = await createSpreadsheet(title, data);

    if (result && (result.spreadsheetId || result.id)) {
      const spreadsheetId = result.spreadsheetId || result.id;
      const spreadsheetUrl = result.spreadsheetUrl || result.url || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      return NextResponse.json({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        title,
      });
    }

    return NextResponse.json({
      success: false,
      oauthRequired: true,
      error: "구글 시트 자동 생성에 실패했습니다.",
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    });
  } catch (err: any) {
    console.error("[Sheets-Create] Error:", err);
    return NextResponse.json({
      success: false,
      oauthRequired: err.message?.includes("OAuth") || err.message?.includes("connected"),
      error: err.message || "시트 생성 중 오류가 발생했습니다.",
      quickCreateUrl: "https://docs.google.com/spreadsheets/create",
    }, { status: 500 });
  }
}
