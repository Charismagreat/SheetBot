export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  callAiCaller,
  listDriveFiles,
  createDriveFolder,
  uploadDriveFile,
  moveDriveFile,
  insertRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings } from "@/lib/ai-settings";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import fs from "fs";
import path from "path";
import os from "os";

const debugLogPath = path.join(process.cwd(), "upload_debug.log");
function writeDebugLog(msg: string) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] ${msg}\n`);
    console.log(`[RecordingsUpload] ${msg}`);
  } catch {}
}

/**
 * POST /api/user/recordings/upload
 * 스마트폰 시트봇 에이전트에서 통화 녹음 파일을 수신하여
 * 구글 드라이브 지정 폴더에 자동 업로드하고, 폴더 내 [SheetBot] 통화 녹음 대장 시트에 자동 기록
 */
export async function POST(req: NextRequest) {
  writeDebugLog(`>>> Incoming upload request. Content-Length: ${req.headers.get("content-length")}, Content-Type: ${req.headers.get("content-type")}`);
  let tempFilePath: string | null = null;
  try {
    await setupDatabase();

    // 1. 유저 식별 (세션, 헤더, 폼데이터/JSON 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let rawFileName = "통화녹음.m4a";
    let contactName = "미지정 연락처";
    let callTime = new Date().toISOString().replace("T", " ").slice(0, 19);
    let rawFolderName = "[SheetBot] 통화 녹음";
    let autoRecordSheet = true;
    let bodyEmail: string | null = null;

    if (contentType.includes("application/json")) {
      const json = await req.json();
      bodyEmail = json.userEmail || json.email || null;
      rawFileName = json.fileName || rawFileName;
      contactName = json.contactName || contactName;
      callTime = json.callTime || callTime;
      rawFolderName = json.folderName || rawFolderName;
      autoRecordSheet = json.autoRecordSheet !== false;

      const rawBase64 = json.fileBase64 || json.base64 || json.audioBase64 || "";
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
      writeDebugLog(`Parsed JSON: fileName=${rawFileName}, contactName=${contactName}, bufferSize=${buffer?.length}, bodyEmail=${bodyEmail}`);
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      bodyEmail = formData.get("userEmail") as string | null;
      rawFileName = (formData.get("fileName") as string | null) || (file?.name) || rawFileName;
      contactName = (formData.get("contactName") as string | null) || contactName;
      callTime = (formData.get("callTime") as string | null) || callTime;
      rawFolderName = (formData.get("folderName") as string | null) || rawFolderName;
      autoRecordSheet = formData.get("autoRecordSheet") !== "false";

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
      writeDebugLog(`Parsed form: fileName=${rawFileName}, contactName=${contactName}, fileSize=${file?.size}, bodyEmail=${bodyEmail}`);
    }

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      writeDebugLog("Error: Missing userEmail (401)");
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!buffer || buffer.length === 0) {
      writeDebugLog("Error: Missing file or empty buffer (400)");
      return NextResponse.json({ success: false, error: "업로드할 녹음 파일이 없습니다." }, { status: 400 });
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
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `sb_rec_${Date.now()}_${path.basename(targetFileName)}`);
    fs.writeFileSync(tempFilePath, buffer);
    writeDebugLog(`Step 3: Saved temp file to ${tempFilePath}`);

    function formatBytes(bytes: number): string {
      if (!bytes || bytes <= 0) return "0 Bytes";
      if (bytes < 1024) return `${bytes} Bytes`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    const fileSizeMb = formatBytes(buffer.length);

    // 4. 구글 드라이브 대상 폴더 탐색 및 생성
    let targetFolderId: string | null = null;
    try {
      writeDebugLog(`Step 4: Calling listDriveFiles for folder ${targetFolderName}...`);
      const folderSearch = await listDriveFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false`,
        preferOAuth: true,
      });
      writeDebugLog(`Step 4: folderSearch returned: ${JSON.stringify(folderSearch)}`);

      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        writeDebugLog(`Step 4: Creating folder ${targetFolderName}...`);
        const newFolderRes = await createDriveFolder(targetFolderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (folderErr: any) {
      writeDebugLog(`Step 4 warning: ${folderErr.message}`);
      console.warn("[RecordingsUpload] Folder resolve warning:", folderErr.message);
    }

    // 5. 구글 드라이브로 파일 업로드 (원격/로컬 무손실 브릿지 전송)
    let driveFileId: string | null = null;
    let webViewLink = "";
    try {
      writeDebugLog(`Step 5: Calling uploadDriveFileWithBridge for ${targetFileName}...`);
      const uploadRes = await uploadDriveFileWithBridge({
        buffer,
        fileName: targetFileName,
        folderId: targetFolderId || undefined,
        tempFilePath,
        preferOAuth: true,
      });
      writeDebugLog(`Step 5: uploadRes returned: ${JSON.stringify(uploadRes)}`);

      driveFileId = uploadRes?.id || uploadRes?.fileId || null;
      webViewLink = uploadRes?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");
    } catch (uploadErr: any) {
      writeDebugLog(`Step 5 error: ${uploadErr.message}`);
      console.error("[RecordingsUpload] Drive upload failed:", uploadErr);
      throw new Error(`구글 드라이브 파일 업로드에 실패했습니다: ${uploadErr.message}`);
    }

    // 6. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 행 기록
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      try {
        const sheetTitle = "[SheetBot] 통화 녹음 대장";
        const resolved = await resolveUserSpreadsheet({
          userEmail: cleanEmail,
          sheetType: "RECORDING",
          defaultTitle: sheetTitle,
          folderId: targetFolderId,
          preferOAuth: true,
        });

        const targetSpreadsheetId = resolved.spreadsheetId;
        spreadsheetUrl = resolved.spreadsheetUrl;

        const STANDARD_RECORDING_HEADERS = [
          "통화 일시",
          "상대방",
          "파일명",
          "파일 크기",
          "AI 3줄 핵심 요약",
          "후속 할 일 (Action Items)",
          "전체 텍스트 전사(STT)",
          "구글 드라이브 바로듣기 링크"
        ];

        if (targetSpreadsheetId) {
          // 기존 시트의 1행 헤더 확인 및 8대 표준 자동 보장
          try {
            const headerCheck = await callSheetsTool("sheets_get_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!A1:H1",
              preferOAuth: true,
            });
            const existingHeaders = headerCheck?.values?.[0] || [];
            if (existingHeaders.length < 8 || existingHeaders[4] !== STANDARD_RECORDING_HEADERS[4]) {
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "시트1!A1:H1",
                values: [STANDARD_RECORDING_HEADERS],
                preferOAuth: true,
              }).catch(() => {});

              await callSheetsTool("sheets_format_headers", {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#1e293b",
                headerTextColor: "#ffffff",
                preferOAuth: true,
              }).catch(() => {});
            }
          } catch {}

          // 6-3. 중복 파일 검사 및 행 추가/갱신
          let targetRowIndex: number | null = null;
          let isDuplicate = false;
          try {
            const filesCheck = await callSheetsTool("sheets_get_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!C:C",
              preferOAuth: true,
            });
            const existingFiles: string[] = (filesCheck?.values || []).map((row: any[]) => String(row[0] || ""));
            const matchIndex = existingFiles.findIndex((name, idx) => idx > 0 && name === targetFileName);
            if (matchIndex !== -1) {
              isDuplicate = true;
              targetRowIndex = matchIndex + 1; // 1-indexed row number
            } else {
              targetRowIndex = existingFiles.length + 1;
            }
          } catch {
            targetRowIndex = null;
          }

          if (isDuplicate && targetRowIndex) {
            // 이미 존재하는 행의 링크 및 정보 갱신
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!D${targetRowIndex}:H${targetRowIndex}`,
              values: [[fileSizeMb, "⏳ AI 분석 준비 중...", "⏳ AI 분석 준비 중...", "⏳ 음성 전사 준비 중...", webViewLink]],
              preferOAuth: true,
            }).catch(() => {});
          } else {
            // 신규 행 추가
            const initialRowValues = [
              [callTime, contactName, targetFileName, fileSizeMb, "⏳ AI 분석 준비 중...", "⏳ AI 분석 준비 중...", "⏳ 음성 전사 준비 중...", webViewLink]
            ];
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!A:H",
              values: initialRowValues,
              preferOAuth: true,
            }).catch((err: any) => {
              console.warn("[RecordingsUpload] append_values warning:", err.message);
            });
          }

          // 6-4. 비동기 백그라운드 AI 음성 전사(STT) 및 3줄 요약 실행
          const base64Audio = buffer.toString("base64");
          const targetSpreadsheetIdCopy = targetSpreadsheetId;

          triggerAiAudioAnalysis(
            base64Audio,
            targetFileName,
            targetSpreadsheetIdCopy,
            targetRowIndex,
            cleanEmail
          ).catch((e) => console.warn("[RecordingsUpload] AI analysis background error:", e.message));
        }
      } catch (sheetErr: any) {
        console.warn("[RecordingsUpload] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 7. 발송/수신 감사 대장 DB 적재 (SQLite INTEGER id 규격 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "CALL_RECORDING_UPLOAD",
        rule_name: "🎙️ 통화 녹음 구글 드라이브 자동 백업",
        device_id: "SheetBot Agent",
        recipient: contactName,
        content: `[통화녹음 업로드] ${targetFileName} (${fileSizeMb}) -> ${targetFolderName}`,
        status: "SUCCESS",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch((err) => console.warn("[RecordingsUpload] DB log insert warning:", err.message));

    writeDebugLog(`SUCCESS! File uploaded with ID: ${driveFileId}`);
    return NextResponse.json({
      success: true,
      message: `통화 녹음 파일이 구글 드라이브 '${targetFolderName}' 폴더로 안전하게 업로드되었습니다.`,
      fileId: driveFileId,
      fileName: targetFileName,
      folderName: targetFolderName,
      folderId: targetFolderId,
      webViewLink,
      spreadsheetUrl,
    });
  } catch (err: any) {
    writeDebugLog(`FATAL ERROR in route.ts: ${err.message}\nStack: ${err.stack}`);
    console.error("[RecordingsUpload] Error:", err);
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

/**
 * 백그라운드 AI 음성 전사(STT) 및 핵심 3줄 요약 & Action Items 파이프라인
 */
async function triggerAiAudioAnalysis(
  base64Audio: string,
  fileName: string,
  spreadsheetId: string,
  rowIndex: number | null,
  userEmail: string
) {
  try {
    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 최소 오디오 크기 검사 (1KB 미만은 더미/손상 파일이므로 API 에러 방지)
    const audioBytesLen = Buffer.byteLength(base64Audio, "base64");
    if (audioBytesLen < 1024) {
      if (spreadsheetId && rowIndex && rowIndex > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!E${rowIndex}:G${rowIndex}`,
          values: [["⚠️ 테스트 파일 (음성 파형 없음)", "-", "-"]],
          preferOAuth: true,
        }).catch(() => {});
      }
      return;
    }

    // 2. 잔여 토큰 사전 점검 (음성 STT 및 분석용 최소 500 토큰)
    const balanceCheck = await checkTokenBalance(cleanEmail, 500);
    if (!balanceCheck.allowed) {
      const noTokenMsg = "⚠️ 잔여 토큰 부족으로 AI 음성 분석이 생략되었습니다. (충전 후 정상 분석)";
      if (spreadsheetId && rowIndex && rowIndex > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!E${rowIndex}:G${rowIndex}`,
          values: [[noTokenMsg, "-", "-"]],
          preferOAuth: true,
        }).catch(() => {});
      }
      return;
    }

    // 3. 오디오 분석 최적화 모델 (gemini-2.5-flash 기본 타겟)
    const aiSettings = await getAiModelSettings().catch(() => ({ defaultModel: "gemini-2.5-flash", tokenMultiplier: 1.0 }));
    let targetModel = aiSettings.defaultModel || "gemini-2.5-flash";
    if (targetModel.includes("3.8") || targetModel.includes("3.5")) {
      targetModel = "gemini-2.5-flash";
    }

    // 파일 확장자에 따른 적정 MIME 타입 매핑
    let mimeType = "audio/mp4";
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".mp3")) mimeType = "audio/mp3";
    else if (lowerName.endsWith(".wav")) mimeType = "audio/wav";
    else if (lowerName.endsWith(".aac")) mimeType = "audio/aac";
    else if (lowerName.endsWith(".ogg")) mimeType = "audio/ogg";
    else if (lowerName.endsWith(".flac")) mimeType = "audio/flac";

    const prompt = `당신은 비즈니스 통화 녹음 분석 전문 AI입니다.
첨부된 통화 녹음 파일("${fileName}")의 음성을 정밀하게 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 기타 텍스트 없이 순수 JSON만 반환하세요:
{
  "summary": "1. [고객 주요 문의 내용]\\n2. [협의 및 결정 사항]\\n3. [기타 중요 사항]",
  "actionItems": "• [후속 조치 1]\\n• [후속 조치 2]",
  "transcript": "[전체 통화 대화 내용 전사]"
}`;

    const aiRes = await callAiCaller(prompt, {
      caller: "sheetbot-voice-intelligence",
      model: targetModel,
      temperature: 0.1,
      files: [
        {
          name: fileName,
          content: base64Audio,
          encoding: "base64",
          mimeType: mimeType,
        },
      ],
    });

    let rawText = (aiRes.text || aiRes.content || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let summary = "1. 통화 확인 완료\n2. 후속 조치 요망\n3. 상세 내용 녹음 참조";
    let actionItems = "• 담당자 확인 필요";
    let transcript = "음성 분석 완료";

    try {
      const parsed = JSON.parse(rawText);
      if (parsed.summary) summary = parsed.summary;
      if (parsed.actionItems) actionItems = parsed.actionItems;
      if (parsed.transcript) transcript = parsed.transcript;
    } catch {
      if (rawText.length > 0) {
        summary = rawText.slice(0, 300);
        transcript = rawText;
      }
    }

    // 4. 사용 토큰 계산 및 실제 차감 (오디오 STT 가중치 기본 500 + 입출력 토큰)
    const promptLen = prompt.length;
    const respLen = rawText.length;
    const rawTokens = Math.max(800, Math.ceil((promptLen + respLen) / 2.5) + 500);
    const multiplier = aiSettings.tokenMultiplier || 1.0;
    const usedTokens = Math.round(rawTokens * multiplier);

    await deductTokens(cleanEmail, usedTokens);

    // 5. AI 사용량 감사 로그 적재
    void recordAiUsageLog({
      userEmail: cleanEmail,
      caller: "sheetbot-voice-intelligence",
      purpose: `통화 녹음 AI STT 및 3줄 요약/Action Items (${targetModel} / ${multiplier}x)`,
      model: targetModel,
      promptTokens: Math.ceil(promptLen / 2.5) + 500,
      completionTokens: Math.ceil(respLen / 2.5),
      totalTokens: usedTokens,
      promptText: `음성 분석: ${fileName}`,
      responseText: summary,
    });

    // 6. 구글 시트 행 업데이트 (E열: 3줄 요약, F열: Action Items, G열: 전사 텍스트)
    if (spreadsheetId && rowIndex && rowIndex > 1) {
      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: `시트1!E${rowIndex}:G${rowIndex}`,
        values: [[summary, actionItems, transcript]],
        preferOAuth: true,
      }).catch((e: any) => console.warn("[AiAudioAnalysis] Sheet update warning:", e.message));
    }

    console.log(`[AiAudioAnalysis] Audio ${fileName} analyzed & ${usedTokens} tokens deducted for ${cleanEmail}.`);
  } catch (err: any) {
    console.warn("[AiAudioAnalysis] Background audio analysis failed:", err.message);
    if (spreadsheetId && rowIndex && rowIndex > 1) {
      await callSheetsTool("sheets_update_range", {
        spreadsheetId,
        range: `시트1!E${rowIndex}:G${rowIndex}`,
        values: [[`⚠️ AI 분석 일시 지연 (${err.message?.slice(0, 40) || "파일 형식 확인 요망"})`, "-", "-"]],
        preferOAuth: true,
      }).catch(() => {});
    }
  }
}
