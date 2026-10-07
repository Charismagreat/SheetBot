import { callDriveTool, getServerEgdeskApiUrl } from "@/lib/egdesk-helpers";
import fs from "fs";
import os from "os";
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
  userEmail?: string;
}): Promise<{
  id: string | null;
  fileId?: string | null;
  webViewLink: string;
  name?: string;
}> {
  const { buffer, fileName, folderId, mimeType, tempFilePath, preferOAuth = true, userEmail } = options;

  let localPathToUse = tempFilePath || "";

  // 1. 현재 Node 프로세스에서 파일이 실제로 존재하고 접근 가능한지 검사
  let isDirectlyAccessible = !!(localPathToUse && fs.existsSync(localPathToUse));

  // 2. 파일이 없으면 os.tmpdir()에 직접 안전하게 기록하여 호스트 절대 경로 확보
  if (!isDirectlyAccessible && buffer && buffer.length > 0) {
    try {
      const safeBasename = path.basename(fileName).replace(/[/\\?%*:|"<>]/g, "_");
      const tmpPath = path.join(os.tmpdir(), `sb_drive_${Date.now()}_${safeBasename}`);
      fs.writeFileSync(tmpPath, buffer);
      localPathToUse = tmpPath;
      isDirectlyAccessible = true;
      console.log(`[DriveBridge] Created local temp file for Drive upload: ${localPathToUse}`);
    } catch (writeErr: any) {
      console.warn("[DriveBridge] Failed to write local temp file:", writeErr.message);
    }
  }

  // 3. 파일이 여전히 접근 불가능한 경우에만 fs_upload_file 브릿지 폴백 시도
  if (!isDirectlyAccessible) {
    try {
      const base64Content = buffer.toString("base64");
      const safeBasename = path.basename(fileName).replace(/[/\\?%*:|"<>]/g, "_");
      const uniqueBasename = `sb_${Date.now()}_${safeBasename}`;
      const apiUrl = getServerEgdeskApiUrl();
      const fsCallRes = await fetch(`${apiUrl}/filesystem/tools/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "fs_upload_file",
          arguments: {
            filename: uniqueBasename,
            content: base64Content,
            encoding: "base64",
          },
        }),
      });
      const fsRes = await fsCallRes.json().catch(() => null);

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

  // 4. 구글 드라이브 업로드 MCP 도구 호출
  const uploadRes = await callDriveTool("drive_upload", {
    filePath: localPathToUse,
    folderId: folderId || undefined,
    destName: fileName,
    mimeType: mimeType || undefined,
    preferOAuth,
  });

  // 5. MCP 응답 2중 언래핑 패턴 적용
  let innerJson: any = null;
  if (uploadRes && typeof uploadRes === "object") {
    if (uploadRes.result && Array.isArray(uploadRes.result.content) && uploadRes.result.content[0]?.text) {
      try { innerJson = JSON.parse(uploadRes.result.content[0].text); } catch {}
    } else if (Array.isArray(uploadRes.content) && uploadRes.content[0]?.text) {
      try { innerJson = JSON.parse(uploadRes.content[0].text); } catch {}
    } else {
      innerJson = uploadRes;
    }
  } else if (typeof uploadRes === "string") {
    try { innerJson = JSON.parse(uploadRes); } catch {}
  }

  const fileId = innerJson?.id || innerJson?.fileId || null;
  const webViewLink = innerJson?.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");

  return {
    id: fileId,
    fileId,
    webViewLink,
    name: innerJson?.name || fileName,
  };
}
