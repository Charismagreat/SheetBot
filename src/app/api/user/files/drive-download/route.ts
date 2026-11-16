export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { callDriveTool } from "@/lib/sqlite-drive-service";
import { callVisitorWorkspaceTool } from "@/lib/egdesk-helpers";

function inferMimeTypeFromFileName(fileName: string, fallback = "application/octet-stream"): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "csv":
      return "text/csv";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
      return "text/plain; charset=utf-8";
    case "zip":
      return "application/zip";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "mp4":
      return "video/mp4";
    default:
      return fallback;
  }
}

/**
 * 구글 드라이브 fileId를 로컬 임시 캐시 폴더로 다운로드하고 로컬 파일 경로를 반환합니다.
 */
export async function downloadDriveFileToLocalTemp(
  fileId: string,
  fileName = "attachment.bin"
): Promise<{ localPath: string; mimeType: string; size: number } | null> {
  if (!fileId || fileId === "learned_file") return null;

  const cacheDir = path.join(os.tmpdir(), "sheetbot_drive_attachments");
  const publicUploadDir = path.join(process.cwd(), "public", "uploads", "ai-products");
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
  const localPath = path.join(cacheDir, `${fileId}_${safeName}`);

  // 1. 직접 지정된 캐시 파일 존재 확인 (0ms)
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.size > 0) {
      return {
        localPath,
        mimeType: inferMimeTypeFromFileName(safeName),
        size: stat.size,
      };
    }
  }

  // 2. public/uploads/ai-products 디렉토리 우선 탐색
  if (fs.existsSync(publicUploadDir)) {
    const publicPath = path.join(publicUploadDir, `${fileId}_${safeName}`);
    if (fs.existsSync(publicPath)) {
      const stat = fs.statSync(publicPath);
      if (stat.size > 0) {
        return {
          localPath: publicPath,
          mimeType: inferMimeTypeFromFileName(safeName),
          size: stat.size,
        };
      }
    }
    const publicPathAlt = path.join(publicUploadDir, safeName);
    if (fs.existsSync(publicPathAlt)) {
      const stat = fs.statSync(publicPathAlt);
      if (stat.size > 0) {
        return {
          localPath: publicPathAlt,
          mimeType: inferMimeTypeFromFileName(safeName),
          size: stat.size,
        };
      }
    }
  }

  // 3. 캐시 디렉토리에서 fileId prefix로 시작하는 파일 자동 탐색 (와일드카드 폴백)
  try {
    const files = fs.readdirSync(cacheDir);
    const matched = files.find((f) => f.startsWith(`${fileId}_`));
    if (matched) {
      const matchedPath = path.join(cacheDir, matched);
      const stat = fs.statSync(matchedPath);
      if (stat.size > 0) {
        return {
          localPath: matchedPath,
          mimeType: inferMimeTypeFromFileName(matched),
          size: stat.size,
        };
      }
    }
  } catch {}

  // 4. Owner / Personal OAuth drive_download 호출
  try {
    await callDriveTool("drive_download", {
      fileId,
      destPath: localPath,
      preferOAuth: true,
    });
  } catch (e1: any) {
    console.warn("[DriveDownload] Primary drive_download warning:", e1.message);
    // 5. Visitor Workspace Tool 폴백
    try {
      await callVisitorWorkspaceTool("drive", "drive_download", {
        fileId,
        destPath: localPath,
        preferOAuth: true,
      });
    } catch (e2: any) {
      console.warn("[DriveDownload] Fallback drive_download warning:", e2.message);
    }
  }

  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.size > 0) {
      return {
        localPath,
        mimeType: inferMimeTypeFromFileName(safeName),
        size: stat.size,
      };
    }
  }

  return null;
}

/**
 * GET /api/user/files/drive-download?fileId=...&fileName=...
 * 모바일 앱 또는 웹 쇼츠 플레이어에서 구글 드라이브/로컬 제품 이미지를
 * 즉시 브라우저 인라인 렌더링(inline) 또는 스트리밍 수신하는 엔드포인트
 */
export async function GET(req: NextRequest) {
  try {
    const fileId = (req.nextUrl.searchParams.get("fileId") || "").trim();
    const fileName = (req.nextUrl.searchParams.get("fileName") || "attachment").trim();
    const requestedMime = (req.nextUrl.searchParams.get("mimeType") || "").trim();

    if (!fileId) {
      return NextResponse.json({ success: false, error: "fileId 파라미터가 필요합니다." }, { status: 400 });
    }

    const downloaded = await downloadDriveFileToLocalTemp(fileId, fileName);
    if (!downloaded || !fs.existsSync(downloaded.localPath)) {
      return NextResponse.json(
        { success: false, error: "구글 드라이브에서 원본 파일을 가져오지 못했습니다." },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(downloaded.localPath);
    const finalMime =
      requestedMime && requestedMime !== "application/octet-stream"
        ? requestedMime
        : downloaded.mimeType;
    const encodedName = encodeURIComponent(fileName);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": finalMime,
        "Content-Length": String(fileBuffer.length),
        // 브라우저 <img> 태그에서 100% 화면 렌더링을 위해 inline 지정 (절대 다운로드 강제 금지)
        "Content-Disposition": `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      },
    });
  } catch (err: any) {
    console.error("[DriveDownload] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
