import fs from "fs";
import path from "path";
import crypto from "crypto";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { safeCreateTable } from "@/lib/setup-db";

let sharp: any = null;
try {
  sharp = require("sharp");
} catch (_) {}

export type FileCategory = "catalog" | "seal" | "docs" | "report" | "general";

export interface StoredUserFile {
  id: string;
  userEmail: string;
  category: FileCategory;
  originalName: string;
  storedFileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  publicUrl: string;
  createdAt: string;
}

/**
 * 이지데스크 영구 업로드 디렉토리 기준 경로 반환
 * 배포 스냅샷이 바뀌어도 절대 삭제되지 않는 전역 디렉토리 (~/.egdesk/uploads/{userEmail}/{category})
 */
export function getUserUploadDir(userEmail: string, category: FileCategory = "general"): string {
  const cleanEmail = (userEmail || "common").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\CHARISMA";
  const targetDir = path.join(userHome, ".egdesk", "uploads", cleanEmail, category);

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (err: any) {
    console.warn(`[UserFileStorage] Directory ensure warning:`, err.message);
  }

  return targetDir;
}

/**
 * DB 테이블 `sheetbot_user_files` 준비
 */
export async function ensureUserFilesTable(): Promise<void> {
  await safeCreateTable(
    "이용자 파일 스토리지 대장",
    [
      { name: "id", type: "TEXT" },
      { name: "user_email", type: "TEXT" },
      { name: "category", type: "TEXT" },
      { name: "original_name", type: "TEXT" },
      { name: "stored_filename", type: "TEXT" },
      { name: "file_size", type: "INTEGER" },
      { name: "mime_type", type: "TEXT" },
      { name: "storage_path", type: "TEXT" },
      { name: "public_url", type: "TEXT" },
      { name: "created_at", type: "TEXT" },
    ],
    { tableName: "sheetbot_user_files" }
  );
}

/**
 * 파일을 이지데스크 영구 스토리지에 저장하고 메타데이터 및 공용 서빙 URL 반환
 */
export async function saveUserFileToStorage(params: {
  userEmail: string;
  category: FileCategory;
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<StoredUserFile> {
  const cleanEmail = (params.userEmail || "common").trim().toLowerCase();
  const emailSlug = cleanEmail.replace(/[^a-z0-9_-]/g, "_");
  const targetDir = getUserUploadDir(cleanEmail, params.category);

  let outputBuffer = params.buffer;
  let finalMime = params.mimeType || "application/octet-stream";
  const ext = (path.extname(params.fileName) || "").toLowerCase();
  const fileHash = crypto.randomBytes(6).toString("hex");
  const timestamp = Date.now();

  let storedFileName = `${params.category}_${emailSlug}_${timestamp}_${fileHash}${ext}`;

  // 이미지 파일인 경우 1600px 리사이즈 및 85% WebP/JPEG 지능형 압축 적용 (300KB 수준 경량화)
  const isImage = finalMime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);

  if (isImage && sharp) {
    try {
      const image = sharp(params.buffer);
      const metadata = await image.metadata();

      const maxDim = 1600;
      let needResize = false;
      if ((metadata.width && metadata.width > maxDim) || (metadata.height && metadata.height > maxDim)) {
        needResize = true;
      }

      let pipeline = image;
      if (needResize) {
        pipeline = pipeline.resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true });
      }

      // 투명 배경이 필요한 도장/직인(seal)은 PNG 유지, 나머지는 고효율 WebP/JPEG 변환
      if (params.category === "seal" || ext === ".png") {
        outputBuffer = await pipeline.png({ quality: 90, compressionLevel: 8 }).toBuffer();
        finalMime = "image/png";
        storedFileName = `${params.category}_${emailSlug}_${timestamp}_${fileHash}.png`;
      } else {
        outputBuffer = await pipeline.webp({ quality: 85 }).toBuffer();
        finalMime = "image/webp";
        storedFileName = `${params.category}_${emailSlug}_${timestamp}_${fileHash}.webp`;
      }
    } catch (optErr: any) {
      console.warn(`[UserFileStorage] Sharp optimize warning:`, optErr.message);
      outputBuffer = params.buffer;
    }
  }

  // 물리 디스크 쓰기
  const absolutePath = path.join(targetDir, storedFileName);
  fs.writeFileSync(absolutePath, outputBuffer);

  const fileId = `file_${timestamp}_${fileHash}`;
  const publicUrl = `https://sheetbot.cloud/api/user/files/serve?file=${encodeURIComponent(
    storedFileName
  )}&cat=${params.category}&email=${encodeURIComponent(cleanEmail)}`;

  const nowIso = new Date().toISOString();
  const record: StoredUserFile = {
    id: fileId,
    userEmail: cleanEmail,
    category: params.category,
    originalName: params.fileName,
    storedFileName,
    fileSize: outputBuffer.length,
    mimeType: finalMime,
    storagePath: absolutePath,
    publicUrl,
    createdAt: nowIso,
  };

  // DB 메타데이터 적재
  try {
    await ensureUserFilesTable();
    await insertRows("sheetbot_user_files", [
      {
        id: fileId,
        user_email: cleanEmail,
        category: params.category,
        original_name: params.fileName,
        stored_filename: storedFileName,
        file_size: outputBuffer.length,
        mime_type: finalMime,
        storage_path: absolutePath,
        public_url: publicUrl,
        created_at: nowIso,
      },
    ]);
  } catch (dbErr: any) {
    console.warn(`[UserFileStorage] DB insert warning:`, dbErr.message);
  }

  return record;
}

/**
 * 요청된 파일을 스토리지에서 조회하여 버퍼 및 메타데이터 반환 (서빙 전용)
 */
export function getStoredUserFile(
  fileName: string,
  category: FileCategory = "general",
  userEmail?: string
): { buffer: Buffer; mimeType: string; etag: string; mtime: Date } | null {
  const sanitized = path.basename(fileName);
  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\CHARISMA";

  // 탐색 후보 디렉토리 목록
  const candidateDirs: string[] = [];

  if (userEmail) {
    const cleanEmail = userEmail.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    candidateDirs.push(path.join(userHome, ".egdesk", "uploads", cleanEmail, category));
    candidateDirs.push(path.join(userHome, ".egdesk", "uploads", cleanEmail));
  }

  candidateDirs.push(path.join(userHome, ".egdesk", "uploads", "common", category));
  candidateDirs.push(path.join(userHome, ".egdesk", "uploads", "quote-images"));
  candidateDirs.push(path.join(userHome, ".egdesk", "uploads"));

  // 상위 uploads 디렉토리 내 서브폴더들 전체 스캔 폴백
  try {
    const baseUploads = path.join(userHome, ".egdesk", "uploads");
    if (fs.existsSync(baseUploads)) {
      const topEntries = fs.readdirSync(baseUploads, { withFileTypes: true });
      for (const ent of topEntries) {
        if (ent.isDirectory()) {
          candidateDirs.push(path.join(baseUploads, ent.name, category));
          candidateDirs.push(path.join(baseUploads, ent.name));
        }
      }
    }
  } catch (_) {}

  let foundPath: string | null = null;
  for (const d of candidateDirs) {
    const p = path.join(d, sanitized);
    if (fs.existsSync(p)) {
      foundPath = p;
      break;
    }
  }

  if (!foundPath) return null;

  try {
    const stat = fs.statSync(foundPath);
    const buffer = fs.readFileSync(foundPath);
    const ext = path.extname(sanitized).toLowerCase().replace(".", "");

    let mimeType = "application/octet-stream";
    if (ext === "webp") mimeType = "image/webp";
    else if (ext === "png") mimeType = "image/png";
    else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    else if (ext === "gif") mimeType = "image/gif";
    else if (ext === "pdf") mimeType = "application/pdf";
    else if (ext === "svg") mimeType = "image/svg+xml";

    const hash = crypto.createHash("md5").update(buffer).digest("hex");
    const etag = `"${hash}"`;

    return {
      buffer,
      mimeType,
      etag,
      mtime: stat.mtime,
    };
  } catch (_) {
    return null;
  }
}
