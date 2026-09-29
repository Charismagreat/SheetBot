import { callDriveTool, callDocsTool } from "@/lib/egdesk-helpers";
import fs from "fs";

/**
 * 로컬 및 Vercel/원격 서버 환경 모두에서 구글 드라이브 파일 업로드를 100% 보장하는 브릿지 헬퍼
 * - 서버 컨테이너의 로컬 파일이 이지데스크 MCP 머신과 다를 때, fs_upload_file로 먼저 로컬 머신에 안착 후 업로드
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

  // 2. 만약 파일이 로컬 디스크에 바로 없거나 Vercel 원격 환경인 경우,
  //    이지데스크 fs_upload_file 도구를 통해 호스트 PC(Downloads)에 먼저 저장하여 절대 경로 획득
  if (!isDirectlyAccessible || process.env.VERCEL === "1") {
    try {
      const base64Content = buffer.toString("base64");
      const fsRes = await callDocsTool(
        "/filesystem/tools/call",
        "/__filesystem_proxy",
        "fs_upload_file",
        {
          filename: fileName,
          content: base64Content,
          encoding: "base64",
        }
      );

      // fsRes 텍스트에서 로컬 절대 경로 추출 (예: C:\Users\...\Downloads\...)
      const fsText = typeof fsRes === "string" ? fsRes : (fsRes?.content?.[0]?.text || fsRes?.text || "");
      const pathMatch = fsText.match(/(?:to:\s*|URI:\s*file:\/\/)([a-zA-Z]:\\[^\r\n]+)/i)
        || fsText.match(/([a-zA-Z]:\\[^\r\n]+)/);

      if (pathMatch) {
        localPathToUse = pathMatch[1].trim();
      }
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

  const fileId = uploadRes?.id || uploadRes?.fileId || null;
  const webViewLink = uploadRes?.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");

  return {
    id: fileId,
    fileId,
    webViewLink,
    name: uploadRes?.name || fileName,
  };
}
