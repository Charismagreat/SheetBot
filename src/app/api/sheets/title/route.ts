import { NextResponse } from "next/server";
import { getSpreadsheet } from "@/lib/egdesk-helpers";

// 구글 스프레드시트 URL에서 Spreadsheet ID 추출
function extractSpreadsheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && trimmed.length >= 20) return trimmed;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match && match[1] ? match[1] : null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const urlOrId = searchParams.get("url") || searchParams.get("id") || "";

    if (!urlOrId) {
      return NextResponse.json(
        { success: false, error: "구글 시트 URL 또는 ID가 필요합니다." },
        { status: 400 }
      );
    }

    const spreadsheetId = extractSpreadsheetId(urlOrId);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: "올바른 구글 스프레드시트 ID 또는 URL이 아닙니다." },
        { status: 400 }
      );
    }

    // 이지데스크 Sheets MCP 경유하여 시트 메타데이터 조회
    const sheetData = await getSpreadsheet(spreadsheetId);
    const title = sheetData?.title || sheetData?.spreadsheet?.properties?.title || "";

    return NextResponse.json({
      success: true,
      spreadsheetId,
      title: title.trim(),
    });
  } catch (err: any) {
    console.warn("Sheets title fetch warning:", err.message);
    return NextResponse.json(
      { success: false, error: err.message || "시트 정보를 가져오지 못했습니다." },
      { status: 200 } // 프론트엔드 흐름 방해 방지를 위해 200 반환
    );
  }
}
