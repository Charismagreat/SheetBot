export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /downloads/[filename]
 * 시트봇 전용 APK 및 관련 설정 파일 안전 다운로드 엔드포인트
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const safeFilename = path.basename(filename);

    const publicPath = path.join(process.cwd(), "public", "downloads", safeFilename);

    // 1. APK 파일의 경우: 프록시/Next.js 라우트의 UTF-8 텍스트 오염(Binary Corruption)을 원천 차단하기 위해
    // GitHub Releases 고속 CDN 직통 링크로 즉시 302 리다이렉트
    if (safeFilename.toLowerCase().endsWith(".apk")) {
      let cdnUrl = `https://github.com/Charismagreat/SheetBot/releases/latest/download/${safeFilename}`;

      if (safeFilename.toLowerCase().includes("sheetbotagent")) {
        // 일반 이용자용 시트봇 에이전트 최신 정본 APK (GitHub Releases latest)
        cdnUrl = "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk";
      } else if (safeFilename.toLowerCase().includes("deposit")) {
        // 관리자용 시트봇 에이전트 M 최신 정본 APK
        cdnUrl = "https://github.com/Charismagreat/SheetBot/releases/download/v1.5.2/sheetbot-deposit-agent.apk";
      }

      return NextResponse.redirect(cdnUrl, 302);
    }

    // 2. 비-APK 파일(설정 json 등)의 경우 로컬 public/downloads/ 직접 서빙
    if (fs.existsSync(publicPath)) {
      const fileBuffer = fs.readFileSync(publicPath);
      const contentType = safeFilename.endsWith(".json")
        ? "application/json"
        : "application/octet-stream";

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Content-Length": String(fileBuffer.length),
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `요청하신 파일(${safeFilename})을 찾을 수 없습니다.` },
      { status: 404 }
    );
  } catch (err: any) {
    console.error("[Downloads] error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
