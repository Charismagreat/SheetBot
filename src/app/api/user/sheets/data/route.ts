export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { resolveUserSpreadsheet, SheetBindingType } from "@/lib/sheet-binding-helper";
import { callSheetsTool } from "@/lib/egdesk-helpers";
import { SHEET_DEFINITIONS } from "@/app/api/user/sheets/provision/route";

interface CachedSheetData {
  data: any;
  timestamp: number;
}
const sheetDataCache = new Map<string, CachedSheetData>();
const CACHE_TTL_MS = 30_000; // 30초 인메모리 캐시

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

    // 1. 단기 인메모리 캐시 확인 (15초 이내 중복/연속 요청 즉시 0초 반환)
    const cacheKey = `${cleanEmail}_${typeKey}`;
    const cached = sheetDataCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      });
    }

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

    // 시트의 데이터 읽기 (영수증 13열 및 명함 11열을 포함한 전체 열 조회를 위해 A1:N100으로 최적화)
    let rangeRes = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId: targetSpreadsheetId,
        range: "A1:N100",
        preferOAuth: true,
      },
      { preferOAuth: true }
    ).catch(() => null);

    // 혹시 탭 이름 명시가 필요한 경우 시트1 fallback
    if (!rangeRes || !rangeRes.values) {
      rangeRes = await callSheetsTool(
        "sheets_get_range",
        {
          spreadsheetId: targetSpreadsheetId,
          range: "시트1!A1:N100",
          preferOAuth: true,
        },
        { preferOAuth: true }
      ).catch(() => null);
    }

    const values: string[][] = rangeRes?.values || [];
    const headers =
      values.length > 0 && values[0]?.length > 0
        ? values[0]
        : def?.headers || [];
    const rows = values.length > 1 ? values.slice(1).reverse() : []; // 최신순 정렬

    const responsePayload = {
      success: true,
      spreadsheetId: targetSpreadsheetId,
      spreadsheetUrl,
      title: def?.defaultTitle || `${typeKey} 대장`,
      headers,
      rows,
      totalCount: rows.length,
    };

    // 캐시에 보관
    sheetDataCache.set(cacheKey, { data: responsePayload, timestamp: now });

    return NextResponse.json(responsePayload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error: any) {
    console.error("[SheetsDataAPI] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
