export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callDriveTool,
  callSheetsTool,
  callAiBatchSubmit,
  callAiBatchGet,
  listDriveFiles,
  createDriveFolder,
  insertRows,
  updateRows,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings } from "@/lib/ai-settings";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import { processPendingBatchJobs } from "@/lib/ai-batch-sweeper";
import { resolveSafeTargetRow } from "@/lib/sheet-fingerprint-guard";
import { listEnrolledSpeakers } from "@/lib/voice-transcript-helper";
import {
  createTaskItem,
  parseActionItems,
} from "@/lib/task-hub-helper";
import fs from "fs";
import path from "path";
import os from "os";

const debugLogPath = path.join(process.cwd(), "upload_debug.log");
function writeDebugLog(msg: string) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(debugLogPath, `[${timestamp}] [MeetingUpload] ${msg}\n`);
    console.log(`[MeetingUpload] ${msg}`);
  } catch {}
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// 10분 멱등성 중복 수신 방어 캐시 (동일 사용자 + 파일명 기준)
const recentMeetingUploads = new Map<
  string,
  {
    timestamp: number;
    fileId: string;
    webViewLink: string;
    targetFolderId: string | null;
    targetFolderName: string;
  }
>();

function cleanRecentUploads() {
  const now = Date.now();
  for (const [k, v] of recentMeetingUploads.entries()) {
    if (now - v.timestamp > 600000) {
      recentMeetingUploads.delete(k);
    }
  }
}

/**
 * 회의 녹음 파일명에서 회의명 및 일시 지능형 파싱
 * 예: 회의_20261006_221500.m4a -> 회의 (2026-10-06 22:15:00)
 * 예: 전략기획미팅_20261006.m4a -> 전략기획미팅
 */
function parseMeetingInfoFromFileName(fileName: string): { topic: string; meetingTime?: string } {
  const clean = fileName
    .replace(/^\[SheetBot\]\s*/i, "")
    .replace(/\.[^.]+$/, "")
    .trim();

  // 1. 주제_날짜시간 (예: 전략기획회의_20261006153000)
  const m1 = clean.match(/^([^_]+)_(\d{8,14})$/);
  if (m1) {
    const topic = m1[1].trim();
    const dt = m1[2].trim();
    let timeStr: string | undefined;
    if (dt.length >= 14) {
      timeStr = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)} ${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14)}`;
    } else if (dt.length === 8) {
      timeStr = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    }
    return { topic, meetingTime: timeStr };
  }

  // 2. 음성 녹음 001 등 기본 녹음기 형식
  const m2 = clean.match(/^(?:음성\s*녹음|Voice\s*Recorder|녹음)\s*(\d+)?/i);
  if (m2) {
    return { topic: `사내 회의 (${clean})` };
  }

  return { topic: clean || "사내 회의" };
}

/**
 * POST /api/user/meetings/upload
 * 스마트폰 시트봇 에이전트에서 회의 녹음 파일을 수신하여
 * 구글 드라이브 지정 폴더([SheetBot] 회의 녹음)에 자동 업로드하고,
 * [SheetBot] 회의록 대장 시트에 9대 표준으로 자동 기록
 */
export async function POST(req: NextRequest) {
  writeDebugLog(`>>> Incoming meeting upload request. Content-Type: ${req.headers.get("content-type")}`);
  let tempFilePath: string | null = null;
  try {
    await setupDatabase();
    // 이전에 대기 중이던 배치 작업이 있다면 백그라운드로 즉시 수거
    void processPendingBatchJobs().catch(() => {});

    // 1. 유저 식별 (세션, 헤더, 폼데이터/JSON 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let rawFileName = "회의녹음.m4a";
    let meetingTopic = "사내 회의";
    let meetingTime = new Date().toISOString().replace("T", " ").slice(0, 19);
    let rawFolderName = "[SheetBot] 회의 녹음";
    let bodyEmail: string | null = null;

    if (contentType.includes("application/json")) {
      const json = await req.json();
      bodyEmail = json.userEmail || json.email || null;
      rawFileName = json.fileName || rawFileName;
      meetingTopic = json.topic || json.meetingTopic || json.title || meetingTopic;
      meetingTime = json.meetingTime || json.time || meetingTime;
      rawFolderName = json.folderName || rawFolderName;

      const rawBase64 = json.fileBase64 || json.base64 || json.audioBase64 || "";
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
      writeDebugLog(`Parsed JSON: fileName=${rawFileName}, topic=${meetingTopic}, bufferSize=${buffer?.length}, bodyEmail=${bodyEmail}`);
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      bodyEmail = formData.get("userEmail") as string | null;
      rawFileName = (formData.get("fileName") as string | null) || (file?.name) || rawFileName;
      meetingTopic = (formData.get("topic") as string | null) || (formData.get("meetingTopic") as string | null) || meetingTopic;
      meetingTime = (formData.get("meetingTime") as string | null) || meetingTime;
      rawFolderName = (formData.get("folderName") as string | null) || rawFolderName;

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
      writeDebugLog(`Parsed form: fileName=${rawFileName}, topic=${meetingTopic}, fileSize=${file?.size}, bodyEmail=${bodyEmail}`);
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
      return NextResponse.json({ success: false, error: "업로드할 회의 녹음 파일이 없습니다." }, { status: 400 });
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

    // 파일명에서 회의명/일시 자동 보정
    const parsed = parseMeetingInfoFromFileName(targetFileName);
    if (!meetingTopic || meetingTopic === "사내 회의") {
      meetingTopic = parsed.topic;
    }
    if (parsed.meetingTime && (!meetingTime || meetingTime.includes("T"))) {
      meetingTime = parsed.meetingTime;
    }

    // ⚡ [10분 멱등성 중복 방어] 단말기 루프/재전송에 의한 중복 저장 100% 원천 차단
    cleanRecentUploads();
    const dedupeKey = `${cleanEmail}_${targetFileName}_${buffer.length}`;
    const cached = recentMeetingUploads.get(dedupeKey);
    if (cached && Date.now() - cached.timestamp < 600000) {
      writeDebugLog(`[Idempotency] Duplicate upload blocked within 600s for ${dedupeKey}. Returning cached fast response.`);
      return NextResponse.json({
        success: true,
        message: `이미 안전하게 보관된 회의 녹음 파일입니다.`,
        fileId: cached.fileId,
        fileName: targetFileName,
        folderName: cached.targetFolderName,
        folderId: cached.targetFolderId,
        webViewLink: cached.webViewLink,
      });
    }

    // 3. 임시 파일로 디스크에 저장 (Drive 업로드 도구에 로컬 경로 필요)
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `sb_meet_${Date.now()}_${path.basename(targetFileName)}`);
    fs.writeFileSync(tempFilePath, buffer);
    writeDebugLog(`Step 3: Saved temp file to ${tempFilePath}`);

    // 진입 즉시 락 등록하여 동시 중복 수신 차단
    recentMeetingUploads.set(dedupeKey, {
      timestamp: Date.now(),
      fileId: "",
      webViewLink: "",
      targetFolderId: null,
      targetFolderName,
    });

    const fileSizeMb = formatBytes(buffer.length);
    const base64Audio = buffer.toString("base64");
    const savedTempFilePath = tempFilePath;

    // ★★★ [0.2초 Fast-Return 원칙] ★★★
    // 모바일 단말기(OkHttpClient) 타임아웃 방지를 위해 즉시 200 반환
    void (async () => {
      try {
        await executeBackgroundMeetingPipeline({
          cleanEmail,
          targetFileName,
          meetingTopic,
          meetingTime,
          fileSizeMb,
          targetFolderName,
          tempFilePath: savedTempFilePath,
          base64Audio,
          dedupeKey,
        });
      } catch (bgErr: any) {
        writeDebugLog(`Background meeting pipeline error: ${bgErr.message}`);
      }
    })();

    writeDebugLog(`FAST-RETURN SUCCESS! Returning 200 response to mobile client in 0.2s.`);
    return NextResponse.json({
      success: true,
      message: `회의 녹음 파일이 정상 접수되었습니다. 백그라운드에서 구글 드라이브 보관 및 시트 회의록 작성이 안전하게 진행됩니다.`,
      fileName: targetFileName,
      folderName: targetFolderName,
    });
  } catch (err: any) {
    writeDebugLog(`FATAL ERROR in route.ts: ${err.message}\nStack: ${err.stack}`);
    console.error("[MeetingUpload] Error:", err);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * 백그라운드 구글 드라이브 보관, 시트 회의록 대장 행 업서트, Gemini Batch AI 회의록 분석
 */
async function executeBackgroundMeetingPipeline(params: {
  cleanEmail: string;
  targetFileName: string;
  meetingTopic: string;
  meetingTime: string;
  fileSizeMb: string;
  targetFolderName: string;
  tempFilePath: string;
  base64Audio: string;
  dedupeKey: string;
}) {
  const {
    cleanEmail,
    targetFileName,
    meetingTopic,
    meetingTime,
    fileSizeMb,
    targetFolderName,
    tempFilePath,
    base64Audio,
    dedupeKey,
  } = params;

  try {
    writeDebugLog(`[BackgroundPipeline] Started for ${targetFileName}...`);

    // 1. 구글 드라이브 대상 폴더 탐색 및 사전 캐싱 (0초 즉시 매핑)
    let targetFolderId: string | null = null;
    try {
      writeDebugLog(`Step 1: Searching folder ${targetFolderName}...`);
      const folderSearch = (await Promise.race([
        listDriveFiles(
          { query: `mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false` },
          { preferOAuth: true }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Folder search timeout")), 4000)),
      ])) as any;

      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await createDriveFolder(targetFolderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (folderErr: any) {
      writeDebugLog(`Step 1 folder warning: ${folderErr.message}`);
    }

    // 2. 구글 드라이브 중복 파일 검사 및 업로드
    let driveFileId: string | null = null;
    let webViewLink = "";

    try {
      writeDebugLog(`Step 2: Checking if file already exists in Drive: ${targetFileName}...`);
      const existingFileCheck = await listDriveFiles(
        { folderId: targetFolderId || undefined, query: `name = '${targetFileName}' and trashed = false` },
        { preferOAuth: true }
      );
      const existingDriveFiles = existingFileCheck?.files || [];
      if (existingDriveFiles.length > 0) {
        driveFileId = existingDriveFiles[0].id;
        webViewLink = existingDriveFiles[0].webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
        writeDebugLog(`Step 2 Duplicate Guard: Found existing file: ${driveFileId}`);
      }
    } catch (checkErr: any) {
      writeDebugLog(`Step 2 duplicate check warning: ${checkErr.message}`);
    }

    if (!driveFileId) {
      try {
        writeDebugLog(`Step 2: Uploading file to Google Drive: ${targetFileName}...`);
        const uploadRes = await uploadDriveFileWithBridge({
          buffer: Buffer.from(base64Audio, "base64"),
          fileName: targetFileName,
          folderId: targetFolderId || undefined,
          tempFilePath,
          preferOAuth: true,
        });

        driveFileId = uploadRes?.id || uploadRes?.fileId || null;
        webViewLink = uploadRes?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");
      } catch (uploadErr: any) {
        writeDebugLog(`Step 2 upload warning: ${uploadErr.message}`);
      }
    }

    // 멱등성 캐시 상세 정보 갱신
    if (driveFileId) {
      recentMeetingUploads.set(dedupeKey, {
        timestamp: Date.now(),
        fileId: driveFileId,
        webViewLink,
        targetFolderId,
        targetFolderName,
      });
    }

    // 3. 구글 스프레드시트 회의록 대장 고유 ID 영구 바인딩 및 원자적 행 업서트
    writeDebugLog(`Step 3: Resolving meeting spreadsheet for ${cleanEmail}...`);
    let targetSpreadsheetId: string | null = null;
    let targetRowIndex: number | null = null;

    try {
      const sheetTitle = "[SheetBot] 회의록 대장";
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: "MEETING",
        defaultTitle: sheetTitle,
        folderId: targetFolderId,
        preferOAuth: true,
      });
      targetSpreadsheetId = resolved.spreadsheetId;

      const STANDARD_MEETING_HEADERS = [
        "회의 일시",
        "회의명 / 주제",
        "참석자 목록",
        "파일명",
        "파일 크기",
        "AI 3줄 핵심 요약",
        "결정 사항 및 할 일 (Action Items)",
        "상세 회의록 (화자별 STT)",
        "구글 드라이브 바로듣기 링크",
      ];

      if (targetSpreadsheetId) {
        // 1행 헤더 확인 및 9대 표준 자동 보장
        try {
          const headerCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: targetSpreadsheetId,
            range: "시트1!A1:I1",
            preferOAuth: true,
          });
          const existingHeaders = headerCheck?.values?.[0] || [];
          if (existingHeaders.length < 9 || existingHeaders[5] !== STANDARD_MEETING_HEADERS[5]) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!A1:I1",
              values: [STANDARD_MEETING_HEADERS],
              preferOAuth: true,
            }).catch(() => {});

            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#0f172a",
              headerTextColor: "#38bdf8", // Sky blue 포인트
              preferOAuth: true,
            }).catch(() => {});
          }
        } catch {}

        // 시트 D열(파일명) 중복 검사
        let isDuplicate = false;
        try {
          const filesCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: targetSpreadsheetId,
            range: "시트1!D:D",
            preferOAuth: true,
          });
          const cleanTarget = targetFileName.replace(/^\[SheetBot\]\s*/i, "").trim();
          const existingFiles: string[] = (filesCheck?.values || []).map((row: any[]) => String(row[0] || ""));
          const matchIndex = existingFiles.findIndex((name, idx) => {
            if (idx <= 0) return false;
            const cleanName = name.replace(/^\[SheetBot\]\s*/i, "").trim();
            return cleanName === cleanTarget || name.trim() === targetFileName.trim();
          });
          if (matchIndex !== -1) {
            isDuplicate = true;
            targetRowIndex = matchIndex + 1;
            writeDebugLog(`Step 3: Found existing row in sheet at row ${targetRowIndex} for ${targetFileName}`);
          } else {
            targetRowIndex = existingFiles.length + 1;
          }
        } catch (sheetCheckErr: any) {
          writeDebugLog(`Step 3 sheet check warning: ${sheetCheckErr.message}`);
          targetRowIndex = null;
        }

        const listenLinkFormula = webViewLink
          ? `=HYPERLINK("${webViewLink}", "▶ 바로듣기")`
          : "-";

        if (isDuplicate && targetRowIndex) {
          writeDebugLog(`Step 3: Updating existing duplicate row ${targetRowIndex}...`);
          await callSheetsTool("sheets_update_range", {
            spreadsheetId: targetSpreadsheetId,
            range: `E${targetRowIndex}:I${targetRowIndex}`,
            values: [[fileSizeMb, "⏳ AI 배치 분석 대기 중 (비용 50% 절감)", "⏳ 분석 준비 중...", "⏳ 음성 전사 대기 중...", listenLinkFormula]],
            preferOAuth: true,
          }).catch(() => {});
        } else {
          const initialRowValues = [
            [meetingTime, meetingTopic, "참석자 분석 중...", targetFileName, fileSizeMb, "⏳ AI 배치 분석 대기 중 (비용 50% 절감)", "⏳ 분석 준비 중...", "⏳ 음성 전사 대기 중...", listenLinkFormula],
          ];
          writeDebugLog(`Step 3: Appending new row to sheet ${targetSpreadsheetId}...`);
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:I",
            values: initialRowValues,
            preferOAuth: true,
          }).catch(() => {});
        }
      }
    } catch (sheetErr: any) {
      writeDebugLog(`Step 3 Sheet warning: ${sheetErr.message}`);
    }

    // 4. 발송/수신 감사 대장 DB 적재
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: "MEETING_RECORDING_UPLOAD",
        rule_name: "🎙️ 회의 녹음 구글 드라이브 백업 및 회의록 대장",
        device_id: "SheetBot Agent",
        recipient: meetingTopic,
        content: `[회의녹음 업로드] ${targetFileName} (${fileSizeMb}) -> ${targetFolderName}`,
        status: "SUCCESS",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch(() => {});

    // 5. 백그라운드 AI 음성 전사 및 회의록 분석 실행
    if (targetSpreadsheetId) {
      await triggerMeetingAudioAnalysis({
        base64Audio,
        fileName: targetFileName,
        spreadsheetId: targetSpreadsheetId,
        rowIndex: targetRowIndex,
        userEmail: cleanEmail,
        meetingTopic,
      }).catch((e) => writeDebugLog(`Background AI error: ${e.message}`));
    }
  } catch (err: any) {
    writeDebugLog(`[BackgroundPipeline] Fatal error: ${err.message}`);
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        writeDebugLog(`[BackgroundPipeline] Cleaned temp file: ${tempFilePath}`);
      } catch {}
    }
  }
}

/**
 * 백그라운드 AI 회의록 전사(STT), 다자간 화자 분리, 안건/요약/Action Items 추출 파이프라인
 */
async function triggerMeetingAudioAnalysis(params: {
  base64Audio: string;
  fileName: string;
  spreadsheetId: string;
  rowIndex: number | null;
  userEmail: string;
  meetingTopic: string;
}) {
  const {
    base64Audio,
    fileName,
    spreadsheetId,
    rowIndex,
    userEmail,
    meetingTopic,
  } = params;

  try {
    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 최소 오디오 크기 검사 (1KB 미만 차단)
    const audioBytesLen = Buffer.byteLength(base64Audio, "base64");
    if (audioBytesLen < 1024) {
      if (spreadsheetId && rowIndex && rowIndex > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!F${rowIndex}:H${rowIndex}`,
          values: [["⚠️ 테스트 파일 (음성 파형 없음)", "-", "-"]],
          preferOAuth: true,
        }).catch(() => {});
      }
      return;
    }

    // 2. 잔여 토큰 점검 (회의 분석용 최소 500 토큰)
    const balanceCheck = await checkTokenBalance(cleanEmail, 500);
    if (!balanceCheck.allowed) {
      const noTokenMsg = "⚠️ 잔여 토큰 부족으로 AI 회의록 분석이 생략되었습니다. (충전 후 정상 분석)";
      if (spreadsheetId && rowIndex && rowIndex > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!F${rowIndex}:H${rowIndex}`,
          values: [[noTokenMsg, "-", "-"]],
          preferOAuth: true,
        }).catch(() => {});
      }
      return;
    }

    // 3. 오디오 모델 (gemini-2.5-flash 타겟)
    const aiSettings = await getAiModelSettings().catch(() => ({ defaultModel: "gemini-2.5-flash", tokenMultiplier: 1.0 }));
    let targetModel = aiSettings.defaultModel || "gemini-2.5-flash";
    if (targetModel.includes("3.8") || targetModel.includes("3.5")) {
      targetModel = "gemini-2.5-flash";
    }

    // 4. 이지데스크 Voice Transcript 등록된 성문 프로필 확인
    let hasVoiceProfile = false;
    try {
      const voiceProfileRes = await listEnrolledSpeakers().catch(() => null);
      const speakers = voiceProfileRes?.speakers || [];
      hasVoiceProfile = speakers.some(
        (s: any) => s.id === cleanEmail || s.name === `본인 (${cleanEmail})` || s.name === cleanEmail || s.name === "본인"
      );
    } catch {}

    let mimeType = "audio/mp4";
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".mp3")) mimeType = "audio/mp3";
    else if (lowerName.endsWith(".wav")) mimeType = "audio/wav";
    else if (lowerName.endsWith(".aac")) mimeType = "audio/aac";
    else if (lowerName.endsWith(".ogg")) mimeType = "audio/ogg";
    else if (lowerName.endsWith(".flac")) mimeType = "audio/flac";

    const voiceProfileHint = hasVoiceProfile
      ? `• [내 목소리 성문 프로필 연동] 회의 주최자이자 시트봇 기기 소유자인 '본인 (${cleanEmail})'의 음성 성문 프로필이 등록되어 있습니다. 회의를 주재하거나 발언하는 '본인'의 목소리를 정확히 식별하여 '[본인]: [발화]'로 라벨링하세요.`
      : `• 회의 주최자인 본인(SheetBot 사용자)의 발화는 '[본인]: [발화]'로 라벨링하세요.`;

    const prompt = `당신은 비즈니스 회의록 작성 및 다자간 화자 분리(Multi-speaker Diarization) 전문 AI입니다.
첨부된 회의 녹음 파일("${fileName}")의 음성을 정밀 분석하여, 전체 회의의 안건, 참석자, 핵심 논의 내용 및 후속 할 일(Action Items), 화자별 상세 발화록을 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 기타 텍스트 없이 순수 JSON만 반환하세요:
{
  "title": "회의 핵심 주제 및 안건명",
  "participants": ["본인", "참석자 A", "참석자 B"],
  "summary": "1. [회의 배경 및 목적]\\n2. [핵심 논의 및 의사결정 사항]\\n3. [향후 일정 및 주요 이슈]",
  "actionItems": "• [담당자 / 마감기한 / 수행할 일]\\n• [예: 홍길동 대리 / 10월 10일까지 / 견적서 작성]",
  "transcript": "[본인]: [발화 내용]\\n[참석자 A]: [발화 내용]\\n[참석자 B]: [발화 내용]\\n..."
}

화자 분리 및 회의록 작성 필수 준수사항:
1. 화자 라벨링:
   - 기기 소유자인 본인은 반드시 '[본인]'으로 명시하세요.
   - 다른 참석자들은 음색, 직책, 호칭(예: 김 부장, 이 대리 등)을 감지하여 구체적인 호칭 또는 '[참석자 1]', '[참석자 2]' 등으로 일관성 있게 구분하세요.
${voiceProfileHint}
2. actionItems(결정 사항 및 할 일):
   - 회의 중 언급된 '누가, 언제까지, 무엇을 할 것인지'를 구체적으로 정리하세요.
   - 담당자가 불분명한 경우 '담당자 미정'으로 표시하세요.
3. transcript(상세 회의록):
   - 화자들의 대화를 타임라인 순서대로 번갈아가며 한 문장/발화 단위로 정확히 분리하여 전사하세요. 문단을 합치지 마세요.`;

    writeDebugLog(`Submitting async AI Batch meeting job for ${fileName}...`);
    const batchSubmitRes = await callAiBatchSubmit(
      [
        {
          key: `meet-${Date.now()}`,
          prompt,
          temperature: 0.1,
          files: [
            {
              name: fileName,
              content: base64Audio,
              encoding: "base64",
              mimeType,
            },
          ],
        },
      ],
      {
        caller: "sheetbot-meeting-batch",
        model: targetModel,
        displayName: `MeetingRecording-${fileName.slice(0, 30)}`,
      }
    );

    if (batchSubmitRes.success && batchSubmitRes.jobName) {
      let batchJobId: number | null = null;
      try {
        const insertRes = await insertRows("sheetbot_ai_batch_jobs", [
          {
            job_name: batchSubmitRes.jobName,
            job_type: "MEETING",
            user_email: cleanEmail,
            file_name: fileName,
            spreadsheet_id: spreadsheetId,
            row_index: rowIndex,
            model: targetModel,
            status: "PENDING",
            created_at: getKoreanTimeString(),
          },
        ]);
        batchJobId = insertRes?.insertedIds?.[0] || null;
        writeDebugLog(`Meeting batch ticket registered in DB: ID ${batchJobId}`);
      } catch (e: any) {
        writeDebugLog(`[BatchJobs] Insert error: ${e.message}`);
      }

      // [15초 Fast-Check]
      const batchGetRes = await callAiBatchGet(batchSubmitRes.jobName, {
        waitMs: 15000,
        pollIntervalMs: 3000,
      });

      if (batchGetRes.success && batchGetRes.results && batchGetRes.results.length > 0) {
        const firstResult = batchGetRes.results[0];
        let rawText = (firstResult.text || firstResult.content || firstResult.response || "").trim();
        if (rawText.startsWith("```json")) {
          rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (rawText.startsWith("```")) {
          rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        if (rawText.length > 0) {
          writeDebugLog(`Fast-Check Meeting Batch job succeeded! Text length: ${rawText.length}`);
          const nowStr = getKoreanTimeString();
          if (batchJobId) {
            await updateRows("sheetbot_ai_batch_jobs", {
              status: "SUCCEEDED",
              completed_at: nowStr,
              updated_at: nowStr,
            }, { ids: [batchJobId] }).catch(() => {});
          }

          let meetingTitle = meetingTopic || "회의록";
          let participants = "본인, 참석자";
          let summary = "1. 회의 안건 확인\n2. 주요 논의 진행\n3. 후속 과제 도출";
          let actionItems = "• 담당자 확인 필요";
          let transcript = "회의 음성 분석 완료";

          try {
            const parsed = JSON.parse(rawText);
            if (parsed.title) meetingTitle = parsed.title;
            if (parsed.topic) meetingTitle = parsed.topic;
            if (parsed.participants) {
              participants = Array.isArray(parsed.participants)
                ? parsed.participants.join(", ")
                : String(parsed.participants);
            }
            if (parsed.summary) summary = parsed.summary;
            if (parsed.actionItems) actionItems = parsed.actionItems;
            if (parsed.transcript) transcript = parsed.transcript;
          } catch {}

          // 🛡️ 지능형 행 핑거프린트 가드
          const guardRes = await resolveSafeTargetRow({
            spreadsheetId,
            expectedRow: rowIndex && rowIndex > 1 ? rowIndex : 2,
            fileName,
          });
          const targetRow = guardRes.safeRow;

          if (targetRow && targetRow > 1) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId,
              range: `시트1!B${targetRow}:C${targetRow}`,
              values: [[meetingTitle, participants]],
              preferOAuth: true,
            }).catch(() => {});

            await callSheetsTool("sheets_update_range", {
              spreadsheetId,
              range: `시트1!F${targetRow}:H${targetRow}`,
              values: [[summary, actionItems, transcript]],
              preferOAuth: true,
            }).catch(() => {});
          }

          // Task Hub 할 일 자동 등록
          try {
            const parsedTasks = parseActionItems(actionItems);
            for (const task of parsedTasks) {
              await createTaskItem({
                userEmail: cleanEmail,
                sourceType: "MEETING_RECORDING",
                sourceRef: fileName,
                contactName: meetingTitle,
                taskTitle: task.title,
                dueDate: task.dueDate,
                priority: task.priority,
                badgeText: "회의록",
              }).catch(() => {});
            }
          } catch {}

          const promptLen = 5000;
          const respLen = rawText.length;
          const rawTokens = Math.max(1000, Math.ceil((promptLen + respLen) / 2.5) + 600);
          const usedTokens = Math.round(rawTokens * 0.5);

          await deductTokens(cleanEmail, usedTokens).catch(() => {});
          void recordAiUsageLog({
            userEmail: cleanEmail,
            caller: "sheetbot-meeting-fast-check",
            purpose: `회의 녹음 AI 회의록 정리 [Fast-Check(50% 절감)] (${targetModel} / 0.5x)`,
            model: targetModel,
            promptTokens: Math.ceil(promptLen / 2.5),
            completionTokens: Math.ceil(respLen / 2.5),
            totalTokens: usedTokens,
            promptText: `비동기 회의 분석: ${fileName}`,
            responseText: summary,
          });
        }
      }
    }
  } catch (aiErr: any) {
    writeDebugLog(`triggerMeetingAudioAnalysis error: ${aiErr.message}`);
  }
}
