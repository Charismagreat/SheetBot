export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getStoredUserFile, FileCategory } from "@/lib/user-file-storage";

/**
 * GET /api/user/files/serve
 * 이지데스크 영구 스토리지에 저장된 이미지/바이너리 고속 스트리밍 서빙 엔드포인트
 * - ETag 및 304 Not Modified 지원으로 불필요한 트래픽 100% 제거
 * - 1년 장기 캐시(Cache-Control: max-age=31536000) 지원
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fileName = url.searchParams.get("file");
    const category = (url.searchParams.get("cat") || "general") as FileCategory;
    const userEmail = url.searchParams.get("email") || undefined;

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: "file parameter is required" },
        { status: 400 }
      );
    }

    const fileResult = getStoredUserFile(fileName, category, userEmail);

    if (!fileResult) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    // 1. ETag 캐시 검증 (304 Not Modified 반환 시 트래픽 0 바이트)
    const clientEtag = req.headers.get("if-none-match");
    if (clientEtag && clientEtag === fileResult.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "ETag": fileResult.etag,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 2. 전체 파일 바이너리 스트리밍 반환
    return new NextResponse(new Uint8Array(fileResult.buffer), {
      status: 200,
      headers: {
        "Content-Type": fileResult.mimeType,
        "Content-Length": String(fileResult.buffer.length),
        "ETag": fileResult.etag,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Last-Modified": fileResult.mtime.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("[ServeFile] Internal error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to serve file", details: err.message },
      { status: 500 }
    );
  }
}
