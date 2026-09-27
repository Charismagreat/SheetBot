export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";
import { SHEET_DEFINITIONS } from "@/app/api/user/sheets/provision/route";

/**
 * GET /api/user/sheets/data?email=...&sheetType=...
 * 모바일 스마트 웹앱용 시트 데이터 실시간 조회 API
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const sheetType = searchParams.get("sheetType");

    if (!email || !sheetType) {
      return NextResponse.json(
        { success: false, error: "email and sheetType are required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const typeKey = sheetType.toUpperCase() as SheetBindingType;
    const def = SHEET_DEFINITIONS[typeKey];

    const sheetIdParam = searchParams.get("sheetId");
    let targetSpreadsheetId = sheetIdParam || null;
    let spreadsheetUrl = targetSpreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`
      : "";

    // sheetId가 직접 전달되지 않은 경우에만 resolveUserSpreadsheet 실행
    if (!targetSpreadsheetId) {
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: typeKey,
        defaultTitle: def?.defaultTitle || `[SheetBot] ${typeKey} 대장`,
        preferOAuth: true,
      });
      targetSpreadsheetId = resolved.spreadsheetId;
      spreadsheetUrl =
        resolved.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
    }

    if (!targetSpreadsheetId) {
      return NextResponse.json({
        success: false,
        error: "연결된 구글 스프레드시트가 없습니다. 먼저 모바일 앱에서 기능을 켜주세요.",
      });
    }

    // 1. 첫 번째 메인 탭 이름 동적 확인 (시트1 vs Sheet1 호환)
    let primaryTabName = "시트1";
    try {
      const meta = await callSheetsTool(
        "sheets_get_spreadsheet",
        { spreadsheetId: targetSpreadsheetId, preferOAuth: true },
        { preferOAuth: true }
      );
      if (meta?.sheets && meta.sheets.length > 0 && meta.sheets[0].title) {
        primaryTabName = meta.sheets[0].title;
      }
    } catch (metaErr: any) {
      console.warn("[SheetsDataAPI] Failed to get spreadsheet metadata:", metaErr.message);
    }

    // 2. 시트의 데이터 읽기 (상위 300행)
    const rangeToRead = `${primaryTabName}!A1:Z300`;
    const rangeRes = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: rangeToRead,
        preferOAuth: true,
      },
      { preferOAuth: true }
    ).catch((err: any) => {
      console.warn("[SheetsDataAPI] Failed to get range:", err.message);
      return null;
    });

    const values: string[][] = rangeRes?.values || [];
    const headers =
      values.length > 0 && values[0]?.length > 0
        ? values[0]
        : def?.headers || [];
    const rows = values.length > 1 ? values.slice(1).reverse() : []; // 최신순 정렬

    return NextResponse.json({
      success: true,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl,
      title: def?.defaultTitle || `${typeKey} 대장`,
      headers,
      rows,
      totalCount: rows.length,
    });
  } catch (error: any) {
    console.error("[SheetsDataAPI] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
