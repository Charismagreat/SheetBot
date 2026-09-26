export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  listDriveFiles,
  createDriveFolder,
  uploadDriveFile,
  moveDriveFile,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * POST /api/user/files/upload
 * 스마트폰 시트봇 에이전트(공유하기 메뉴 또는 앱 내 직접 선택)에서 사진/문서 파일을 수신하여
 * 구글 드라이브 지정 폴더에 자동 업로드하고, 폴더 내 [SheetBot] 파일 업로드 대장 시트에 실시간 기록
 */
export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  try {
    await setupDatabase();

    // 1. 유저 식별 (세션, 헤더, 폼데이터 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bodyEmail = formData.get("userEmail") as string | null;
    const rawFileName = (formData.get("fileName") as string | null) || (file?.name) || "업로드_파일";
    const rawFolderName = (formData.get("folderName") as string | null) || "[SheetBot] 파일 보관함";
    const memo = (formData.get("memo") as string | null) || "스마트폰 시트봇 에이전트 업로드";
    const autoRecordSheet = formData.get("autoRecordSheet") !== "false";

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!file) {
      return NextResponse.json({ success: false, error: "업로드할 파일이 없습니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 2. [SheetBot] 표준 네이밍 규칙 적용 (폴더명 및 파일명)
    let targetFolderName = rawFolderName.trim();
    if (!targetFolderName.startsWith("[SheetBot]")) {
      targetFolderName = `[SheetBot] ${targetFolderName}`;
    }

    let targetFileName = rawFileName.trim();
    if (!targetFileName.startsWith("[SheetBot]")) {
      targetFileName = `[SheetBot] ${targetFileName}`;
    }

    // 3. 임시 파일로 디스크에 저장 (Drive 업로드 도구에 로컬 경로 필요)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `sb_file_${Date.now()}_${path.basename(targetFileName)}`);
    fs.writeFileSync(tempFilePath, buffer);

    const fileSizeMb = buffer.length >= 1024 * 1024
      ? (buffer.length / (1024 * 1024)).toFixed(2) + " MB"
      : (buffer.length / 1024).toFixed(1) + " KB";
    const mimeType = file.type || "application/octet-stream";

    // 4. 구글 드라이브 대상 폴더 탐색 및 미존재 시 자동 생성
    let targetFolderId: string | null = null;
    try {
      const folderSearch = await listDriveFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false`,
        preferOAuth: true,
      });

      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await createDriveFolder(targetFolderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (folderErr: any) {
      console.warn("[FilesUpload] Folder resolve warning:", folderErr.message);
    }

    // 5. 구글 드라이브로 파일 업로드
    let driveFileId: string | null = null;
    let webViewLink = "";
    try {
      const uploadRes = await uploadDriveFile({
        localPath: tempFilePath,
        folderId: targetFolderId || undefined,
        fileName: targetFileName,
        preferOAuth: true,
      });

      driveFileId = uploadRes?.id || uploadRes?.fileId || null;
      webViewLink = uploadRes?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");
    } catch (uploadErr: any) {
      console.error("[FilesUpload] Drive upload failed:", uploadErr);
      throw new Error(`구글 드라이브 파일 업로드에 실패했습니다: ${uploadErr.message}`);
    }

    // 6. 구글 시트 대장 자동 생성 및 행 기록 (autoRecordSheet == true)
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      try {
        const sheetTitle = "[SheetBot] 파일 업로드 대장";
        let targetSpreadsheetId: string | null = null;

        // 6-1. 해당 폴더 내 대장 시트 파일 검색
        const queryStr = targetFolderId
          ? `'${targetFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`
          : `mimeType = 'application/vnd.google-apps.spreadsheet' and name = '${sheetTitle}' and trashed = false`;

        const sheetSearch = await listDriveFiles({
          query: queryStr,
          preferOAuth: true,
        }).catch(() => ({ files: [] }));

        const foundSheets = sheetSearch?.files || [];
        if (foundSheets.length > 0) {
          targetSpreadsheetId = foundSheets[0].id;
          spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
        } else {
          // 6-2. 대장 시트 신규 생성
          const createRes = await callSheetsTool("sheets_create_spreadsheet", {
            title: sheetTitle,
            preferOAuth: true,
          }).catch((err: any) => {
            console.warn("[FilesUpload] sheets_create_spreadsheet warning:", err.message);
            return null;
          });

          targetSpreadsheetId = createRes?.spreadsheetId || createRes?.id || null;

          if (targetSpreadsheetId) {
            spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

            // 해당 폴더로 시트 이동
            if (targetFolderId) {
              await moveDriveFile(targetSpreadsheetId, targetFolderId, true).catch(() => {});
            }

            // 초기 헤더 서식 기입
            const headers = [
              ["업로드 일시", "파일명", "파일 종류", "파일 크기", "출처 / 메모", "구글 드라이브 바로보기 링크"]
            ];
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "A1:F1",
              values: headers,
              preferOAuth: true,
            }).catch(() => {});

            // 헤더 서식 스타일링 (다크 네이비 테마)
            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#1e293b",
              headerTextColor: "#ffffff",
              preferOAuth: true,
            }).catch(() => {});
          }
        }

        // 6-3. 시트에 신규 파일 기록 행 추가
        if (targetSpreadsheetId) {
          const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
          const newRowValues = [
            [nowStr, targetFileName, mimeType, fileSizeMb, memo, webViewLink]
          ];
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:F",
            values: newRowValues,
            preferOAuth: true,
          }).catch((err: any) => console.warn("[FilesUpload] append_values warning:", err.message));
        }
      } catch (sheetErr: any) {
        console.warn("[FilesUpload] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 7. 발송/수신 감사 대장 DB 적재 (SQLite INTEGER id 규격 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "FILE_UPLOAD",
        rule_name: "📁 사진/파일 구글 드라이브 백업",
        device_id: "SheetBot Agent",
        recipient: "Google Drive",
        content: `[파일 업로드] ${targetFileName} (${fileSizeMb}) -> ${targetFolderName}`,
        status: "SUCCESS",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[FilesUpload] DB log insert warning:", err.message));

    return NextResponse.json({
      success: true,
      message: `파일이 구글 드라이브 '${targetFolderName}' 폴더로 안전하게 업로드되었습니다.`,
      fileId: driveFileId,
      fileName: targetFileName,
      folderName: targetFolderName,
      folderId: targetFolderId,
      webViewLink,
      spreadsheetUrl,
    });
  } catch (err: any) {
    console.error("[FilesUpload] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    // 임시 파일 삭제
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
  }
}
