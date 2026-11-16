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
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "file";
  const localPath = path.join(cacheDir, `${fileId}_${safeName}`);

  // 이미 다운로드된 유효한 캐시 파일이 있으면 즉시 재사용 (0ms)
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

  // 1차: Owner / Personal OAuth drive_download 호출
  try {
    await callDriveTool("drive_download", {
      fileId,
      destPath: localPath,
      preferOAuth: true,
    });
  } catch (e1: any) {
    console.warn("[DriveDownload] Primary drive_download warning:", e1.message);
    // 2차: Visitor Workspace Tool 폴백
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
 * 모바일 앱에서 이메일 첨부(방식 B) 또는 폰 다운로드를 수행할 때
 * 구글 드라이브 로그인 없이 원본 바이너리 파일을 즉시 내려받는 스트리밍 프록시 엔드포인트
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
        "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err: any) {
    console.error("[DriveDownload] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
