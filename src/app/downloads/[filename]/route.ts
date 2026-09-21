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

    // 1. 로컬 public/downloads/ 에 실제 파일이 존재할 경우 직접 서빙
    if (fs.existsSync(publicPath)) {
      const fileBuffer = fs.readFileSync(publicPath);
      const contentType = safeFilename.endsWith(".apk")
        ? "application/vnd.android.package-archive"
        : safeFilename.endsWith(".json")
        ? "application/json"
        : "application/octet-stream";

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Content-Length": String(fileBuffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // 2. APK 파일인데 아직 서버 로컬에 바이너리가 없는 경우:
    // GitHub Releases 최신 다운로드 링크 또는 안내로 리다이렉트
    if (safeFilename.endsWith(".apk")) {
      const githubReleaseUrl = `https://github.com/Charismagreat/SheetBot/releases/latest/download/${safeFilename}`;
      return NextResponse.redirect(githubReleaseUrl, 302);
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
