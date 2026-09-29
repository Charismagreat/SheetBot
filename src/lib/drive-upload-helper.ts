import { callDriveTool, fsUploadFile } from "@/lib/egdesk-helpers";
import fs from "fs";
import path from "path";

/**
 * 로컬 및 Vercel/원격 서버 환경 모두에서 구글 드라이브 파일 업로드를 100% 보장하는 브릿지 헬퍼
 * - 서버 컨테이너(Vercel 등)의 로컬 임시 파일은 터널 너머의 호스트 PC MCP 서버가 읽을 수 없습니다.
 * - 따라서 fs_upload_file을 통해 호스트 PC의 Downloads 폴더에 파일을 안전하게 안착시킨 후,
 *   반환된 호스트 절대 경로를 drive_upload에 전달하여 구글 드라이브 업로드를 무손실 완료합니다.
 */
export async function uploadDriveFileWithBridge(options: {
  buffer: Buffer;
  fileName: string;
  folderId?: string;
  mimeType?: string;
  tempFilePath?: string;
  preferOAuth?: boolean;
}): Promise<{
  id: string | null;
  fileId?: string | null;
  webViewLink: string;
  name?: string;
}> {
  const { buffer, fileName, folderId, mimeType, tempFilePath, preferOAuth = true } = options;

  let localPathToUse = tempFilePath || "";

  // 1. 현재 Node 프로세스에서 파일이 실제로 존재하고 접근 가능한지 검사
  const isDirectlyAccessible = localPathToUse && fs.existsSync(localPathToUse);
  const isRemoteServer = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  // 2. 파일이 로컬 디스크에 없거나 Vercel 원격 환경인 경우:
  //    이지데스크 fs_upload_file MCP 도구를 통해 호스트 PC(Downloads)에 저장하여 절대 경로 획득
  if (!isDirectlyAccessible || isRemoteServer) {
    try {
      const base64Content = buffer.toString("base64");
      const safeBasename = path.basename(fileName).replace(/[/\\?%*:|"<>]/g, "_");
      const uniqueBasename = `sb_${Date.now()}_${safeBasename}`;

      const fsRes = await fsUploadFile(uniqueBasename, base64Content, "base64");

      // fsRes 텍스트에서 호스트 PC의 절대 경로 추출 (Windows: C:\... 또는 Unix: /Users/... or /home/...)
      const fsText = typeof fsRes === "string"
        ? fsRes
        : (fsRes?.content?.[0]?.text || fsRes?.text || JSON.stringify(fsRes || ""));

      const winMatch = fsText.match(/(?:to:\s*|URI:\s*file:\/\/)([a-zA-Z]:\\[^\r\n]+)/i)
        || fsText.match(/([a-zA-Z]:\\[^\r\n"']+)/);
      const unixMatch = fsText.match(/(?:to:\s*|URI:\s*file:\/\/)?(\/(?:Users|home)\/[^\r\n"']+)/i);

      if (winMatch) {
        localPathToUse = winMatch[1].trim();
      } else if (unixMatch) {
        localPathToUse = unixMatch[1].trim();
      }

      console.log(`[DriveBridge] Handoff to host disk path: ${localPathToUse}`);
    } catch (fsErr: any) {
      console.warn("[DriveBridge] fs_upload_file bridge warning:", fsErr.message);
    }
  }

  // 3. 구글 드라이브 업로드 MCP 도구 호출
  const uploadRes = await callDriveTool("drive_upload", {
    filePath: localPathToUse,
    folderId: folderId || undefined,
    destName: fileName,
    mimeType: mimeType || undefined,
    preferOAuth,
  });

  const parsedUpload = typeof uploadRes === "string" ? JSON.parse(uploadRes) : uploadRes;
  const fileId = parsedUpload?.id || parsedUpload?.fileId || null;
  const webViewLink = parsedUpload?.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");

  return {
    id: fileId,
    fileId,
    webViewLink,
    name: parsedUpload?.name || fileName,
  };
}
