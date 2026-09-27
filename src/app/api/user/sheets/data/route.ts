export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";

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

    // 사용자 시트 바인딩 조회
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: typeKey,
      defaultTitle: `[SheetBot] ${typeKey} 대장`,
      preferOAuth: true,
    });

    if (!resolved.spreadsheetId) {
      return NextResponse.json({
        success: false,
        error: "연결된 구글 스프레드시트가 없습니다. 먼저 모바일 앱에서 기능을 켜주세요.",
      });
    }

    // 시트의 데이터 읽기 (상위 300행)
    const rangeRes = await callSheetsTool("sheets_get_range", {
      spreadsheetId: resolved.spreadsheetId,
      range: "A1:Z300",
      preferOAuth: true,
    }).catch((err: any) => {
      console.warn("[SheetsDataAPI] Failed to get range:", err.message);
      return null;
    });

    const values: string[][] = rangeRes?.values || [];
    const headers = values.length > 0 ? values[0] : [];
    const rows = values.length > 1 ? values.slice(1).reverse() : []; // 최신순 정렬

    const spreadsheetUrl =
      resolved.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${resolved.spreadsheetId}/edit`;

    return NextResponse.json({
      success: true,
      spreadsheetId: resolved.spreadsheetId,
      spreadsheetUrl,
      title: `${typeKey} 대장`,
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
