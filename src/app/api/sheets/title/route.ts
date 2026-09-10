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

    let title = "";

    // 1. 이지데스크 Sheets MCP 경유하여 시트 메타데이터 조회 시도
    try {
      const sheetData = await getSpreadsheet(spreadsheetId);
      title = sheetData?.title || sheetData?.spreadsheet?.properties?.title || "";
    } catch {}

    // 2. Drive MCP 경유 조회 시도
    if (!title) {
      try {
        const { getDriveFile } = await import("@/lib/egdesk-helpers");
        const driveData = await getDriveFile(spreadsheetId);
        title = driveData?.name || driveData?.title || "";
      } catch {}
    }

    // 3. 웹 HTML 메타데이터 파싱 시도 (공개 또는 웹 접근 가능 시트)
    if (!title) {
      try {
        const res = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          redirect: "follow",
        });
        const html = await res.text();
        const ogMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        if (ogMatch && ogMatch[1]) {
          title = ogMatch[1].replace(/\s*-\s*Google\s*(Sheets|스프레드시트)\s*$/i, "").trim();
        } else {
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(/\s*-\s*Google\s*(Sheets|스프레드시트)\s*$/i, "").trim();
          }
        }
      } catch {}
    }

    if (!title) {
      return NextResponse.json({
        success: false,
        spreadsheetId,
        error: "구글 시트 제목을 자동으로 조회하지 못했습니다. 비공개 시트인 경우 직접 프로젝트 이름을 입력해 주세요.",
      });
    }

    return NextResponse.json({
      success: true,
      spreadsheetId,
      title: title.trim(),
    });
  } catch (err: any) {
    console.warn("Sheets title fetch warning:", err.message);
    return NextResponse.json(
      { success: false, error: err.message || "시트 정보를 가져오지 못했습니다." },
      { status: 200 }
    );
  }
}
