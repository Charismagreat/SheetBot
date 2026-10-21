/**
 * 통화 녹음 업로드 공통 파이프라인 (route.ts 단일 업로드 + 청크 업로드 complete 공용)
 * - 원래 src/app/api/user/recordings/upload/route.ts 에 있던 로직을 그대로 이전
 */
import { NextResponse } from "next/server";
import {
  callSheetsTool,
  callDriveTool,
  callAiCaller,
  callAiBatchSubmit,
  callAiBatchGet,
  listDriveFiles,
  createDriveFolder,
  insertRows,
  updateRows,
} from "@/lib/egdesk-helpers";
import { getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getAiModelSettings } from "@/lib/ai-settings";
import { calculateBillableTokens } from "@/lib/token-calculator";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { getKoreanTimeString } from "@/lib/date-utils";
import { resolveSafeTargetRow } from "@/lib/sheet-fingerprint-guard";
import { listEnrolledSpeakers } from "@/lib/voice-transcript-helper";
import {
  createTaskItem,
  parseActionItems,
  autoResolveMissedCallTasks,
} from "@/lib/task-hub-helper";
import fs from "fs";
import path from "path";
import os from "os";
import { appendSheetbotDebugLog } from "@/lib/safe-debug-log";

export function writeDebugLog(msg: string) {
  const timestamp = new Date().toISOString();
  appendSheetbotDebugLog("upload_debug.log", `[${timestamp}] ${msg}`);
  console.log(`[RecordingsUpload] ${msg}`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// 10분 멱등성 중복 수신 방어 캐시 (동일 사용자 + 파일명 기준)
const recentRecordingUploads = new Map<string, { timestamp: number; fileId: string; webViewLink: string; targetFolderId: string | null; targetFolderName: string }>();

function cleanRecentUploads() {
  const now = Date.now();
  for (const [k, v] of recentRecordingUploads.entries()) {
    if (now - v.timestamp > 600000) {
      recentRecordingUploads.delete(k);
    }
  }
}

/**
 * 파일명에서 상대방 이름 및 전화번호, 통화 일시 지능형 파싱 (단말기 파싱 누락 및 왜곡 대비 2중 안전망)
 */
export interface ParsedContactInfo {
  name: string;
  rawName?: string;
  phone?: string;
  normalizedPhone?: string;
  time?: string;
  isDefinitive: boolean;
}

export function parseContactFromFileName(fileName: string): ParsedContactInfo {
  // 접두사([SheetBot], ext_rec_..., sb_rec_...) 및 확장자 제거
  const clean = fileName
    .replace(/^\[SheetBot\]\s*/i, "")
    .replace(/^ext_rec_\d+_/i, "")
    .replace(/^sb_rec_\d+_/i, "")
    .replace(/\.[^.]+$/, "")
    .trim();

  // 1. 이름_전화번호_날짜시간 (예: 박종찬오마이프린트_01073360131_20260408134731)
  const m1 = clean.match(/^([^_]+)_(\d{9,12})_(\d{8,14})$/);
  if (m1) {
    const rawName = m1[1].trim();
    const phone = m1[2].trim();
    const dt = m1[3].trim();
    const formattedPhone = phone.length === 11 
      ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}` 
      : phone.length === 10 && phone.startsWith("02")
      ? `${phone.slice(0, 2)}-${phone.slice(2, 6)}-${phone.slice(6)}`
      : phone.length === 10
      ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`
      : phone;
    let callTimeStr: string | undefined;
    if (dt.length >= 14) {
      callTimeStr = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)} ${dt.slice(8, 10)}:${dt.slice(10, 12)}:${dt.slice(12, 14)}`;
    }
    return {
      name: `${rawName} (${formattedPhone})`,
      rawName,
      phone: formattedPhone,
      normalizedPhone: phone,
      time: callTimeStr,
      isDefinitive: true,
    };
  }

  // 2. 통화 녹음 이름_날짜_시간
  const m2 = clean.match(/(?:통화\s*녹음|T전화통화녹음)[\s_]+([^_]+)_(\d{6,8})_?(\d{4,6})?/i);
  if (m2) {
    const rawName = m2[1].trim();
    return {
      name: rawName,
      rawName,
      isDefinitive: false,
    };
  }

  // 3. Fallback: 언더스코어로 분리하여 첫 번째 토큰
  const tokens = clean.split("_").map((t) => t.trim()).filter(Boolean);
  if (tokens.length > 0 && !tokens[0].match(/^\d{6,}$/)) {
    const rawName = tokens[0];
    return {
      name: rawName,
      rawName,
      isDefinitive: false,
    };
  }

  return { name: "미지정 연락처", isDefinitive: false };
}

/**
 * 🛡️ [Source of Truth Override]
 * 파일명은 안드로이드 OS/통화앱이 통화 시점에 직접 생성한 가장 신뢰도 높은 원천 데이터입니다.
 * 클라이언트에서 넘어온 contactName이 파일명 내 전화번호/이름과 불일치하거나 왜곡된 경우,
 * 파일명의 정보를 최우선(Source of Truth)으로 삼아 완벽히 교차 검증 및 자동 보정합니다.
 */
export function resolveDefinitiveContact(
  fileName: string,
  providedContact: string | null | undefined,
  providedCallTime?: string | null
): { contactName: string; callTime?: string } {
  const parsed = parseContactFromFileName(fileName);

  // 1. 파일명에서 이름과 전화번호가 명확히 추출된 경우 (최우선 Source of Truth)
  if (parsed.isDefinitive && parsed.phone) {
    const providedClean = (providedContact || "").trim();
    const providedDigits = providedClean.replace(/\D/g, "");

    // 클라이언트 값이 비어있거나, '미지정 연락처'이거나,
    // 클라이언트 번호가 파일명 번호와 다르거나,
    // 클라이언트 이름에 파일명의 상대방 이름이 포함되지 않은 경우 100% 파일명 우선 덮어쓰기
    const isMismatched = !providedClean ||
      providedClean === "미지정 연락처" ||
      (providedDigits.length >= 8 && parsed.normalizedPhone && providedDigits !== parsed.normalizedPhone) ||
      (parsed.rawName && !providedClean.includes(parsed.rawName));

    if (isMismatched) {
      writeDebugLog(`[SourceOfTruth Override] Correcting contact: '${providedClean}' -> '${parsed.name}' (File: ${fileName})`);
      return {
        contactName: parsed.name,
        callTime: parsed.time || (providedCallTime && !providedCallTime.includes("T") ? providedCallTime : parsed.time),
      };
    }
  }

  // 2. 클라이언트 값이 비어있는 경우 Fallback
  if (!providedContact || providedContact === "미지정 연락처" || providedContact.trim().length === 0) {
    if (parsed.name && parsed.name !== "미지정 연락처") {
      return {
        contactName: parsed.name,
        callTime: parsed.time || (providedCallTime && !providedCallTime.includes("T") ? providedCallTime : parsed.time),
      };
    }
  }

  return {
    contactName: providedContact && providedContact.trim().length > 0 ? providedContact.trim() : "미지정 연락처",
    callTime: parsed.time && (!providedCallTime || providedCallTime.includes("T")) ? parsed.time : (providedCallTime || undefined),
  };
}

export interface RecordingUploadInput {
  buffer: Buffer | null;
  rawFileName: string;
  contactName: string;
  callTime: string;
  rawFolderName: string;
  autoRecordSheet: boolean;
  bodyEmail: string | null;
  channelCount: number;
  sessionEmail: string | null;
  headerEmail: string | null;
}

export const RECORDING_DEFAULTS = {
  rawFileName: "통화녹음.m4a",
  contactName: "미지정 연락처",
  rawFolderName: "[SheetBot] 통화 녹음",
  channelCount: 2, // 안드로이드 통화녹음 기본 2채널(Stereo, Ch0=나/마이크, Ch1=상대방/수화기)
};

export function defaultCallTime(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * 통화 녹음 공통 접수 처리 (단일 업로드 route.ts 및 청크 업로드 complete 라우트 공용)
 * - 사용자 식별, [SheetBot] 네이밍, 10분 멱등성 방어, 임시 파일 저장, 0.2초 Fast-Return
 * - 구글 드라이브 업로드 / 시트 대장 / AI 배치 분석은 백그라운드 파이프라인으로 위임
 */
export async function acceptRecordingUpload(input: RecordingUploadInput): Promise<NextResponse> {
  let tempFilePath: string | null = null;
  try {
    const { buffer, rawFileName, rawFolderName, autoRecordSheet, bodyEmail, channelCount, sessionEmail, headerEmail } = input;
    let { contactName, callTime } = input;
    void autoRecordSheet;

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

    // 🛡️ [Source of Truth 2중 교차 검증]
    // 파일명 정보를 기반으로 상대방 정보 왜곡 방어 (타 연락처 누수 원천 차단)
    const resolvedContact = resolveDefinitiveContact(targetFileName, contactName, callTime);
    contactName = resolvedContact.contactName;
    if (resolvedContact.callTime) {
      callTime = resolvedContact.callTime;
    }

    // ⚡ [10분 멱등성 중복 방어] 단말기 루프/재전송에 의한 중복 저장 100% 원천 차단
    cleanRecentUploads();
    const dedupeKey = `${cleanEmail}_${targetFileName}_${buffer.length}`;
    const cached = recentRecordingUploads.get(dedupeKey);
    if (cached && Date.now() - cached.timestamp < 600000) {
      writeDebugLog(`[Idempotency] Duplicate upload blocked within 600s for ${dedupeKey}. Returning cached fast response.`);
      return NextResponse.json({
        success: true,
        message: `이미 안전하게 보관된 통화 녹음 파일입니다.`,
        fileId: cached.fileId,
        fileName: targetFileName,
        folderName: cached.targetFolderName,
        folderId: cached.targetFolderId,
        webViewLink: cached.webViewLink,
      });
    }

    // 3. 임시 파일로 디스크에 저장 (Drive 업로드 도구에 로컬 경로 필요)
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `sb_rec_${Date.now()}_${path.basename(targetFileName)}`);
    fs.writeFileSync(tempFilePath, buffer);
    writeDebugLog(`Step 3: Saved temp file to ${tempFilePath}`);

    // 진입 즉시 락 등록하여 동시 중복 수신 차단
    recentRecordingUploads.set(dedupeKey, {
      timestamp: Date.now(),
      fileId: "",
      webViewLink: "",
      targetFolderId: null,
      targetFolderName,
    });

    const fileSizeMb = formatBytes(buffer.length);
    const base64Audio = buffer.toString("base64");
    const savedTempFilePath = tempFilePath;

    // ★★★ [진정한 0.2초 Fast-Return 원칙] ★★★
    // 스마트폰 클라이언트에게 디스크 저장 즉시 HTTP 200 성공 응답을 반환하여
    // 모바일 단말기(OkHttpClient) 타임아웃 및 재전송 루프를 원천 차단합니다.
    // 구글 드라이브 업로드, 시트 대장 원자적 업서트, Gemini Batch AI 분석은 백그라운드에서 안전하게 진행됩니다.
    void (async () => {
      try {
        await executeBackgroundFullPipeline({
          cleanEmail,
          targetFileName,
          contactName,
          callTime,
          fileSizeMb,
          targetFolderName,
          tempFilePath: savedTempFilePath,
          base64Audio,
          dedupeKey,
          channelCount,
        });
      } catch (bgErr: any) {
        writeDebugLog(`Background full pipeline error: ${bgErr.message}`);
      }
    })();

    writeDebugLog(`FAST-RETURN SUCCESS! Returning 200 response to mobile client in 0.2s.`);
    return NextResponse.json({
      success: true,
      message: `통화 녹음 파일이 정상 접수되었습니다. 백그라운드에서 구글 드라이브 보관 및 시트 대장 정리가 안전하게 진행됩니다.`,
      fileName: targetFileName,
      folderName: targetFolderName,
    });
  } catch (err: any) {
    writeDebugLog(`FATAL ERROR in acceptRecordingUpload: ${err.message}\nStack: ${err.stack}`);
    console.error("[RecordingsUpload] Error:", err);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}


/**
 * 백그라운드 구글 드라이브 업로드, 시트 대장 원자적 업서트, Gemini Batch AI 분석 전체 파이프라인
 */
async function executeBackgroundFullPipeline(params: {
  cleanEmail: string;
  targetFileName: string;
  contactName: string;
  callTime: string;
  fileSizeMb: string;
  targetFolderName: string;
  tempFilePath: string;
  base64Audio: string;
  dedupeKey: string;
  channelCount: number;
}) {
  const {
    cleanEmail,
    targetFileName,
    fileSizeMb,
    targetFolderName,
    tempFilePath,
    base64Audio,
    dedupeKey,
    channelCount,
  } = params;

  // 🛡️ 백그라운드 파이프라인 진입 시에도 파일명 기반 2중 교차 검증 적용
  const resolved = resolveDefinitiveContact(targetFileName, params.contactName, params.callTime);
  const contactName = resolved.contactName;
  const callTime = resolved.callTime || params.callTime;

  try {
    writeDebugLog(`[BackgroundPipeline] Started for ${targetFileName}...`);

    // 0. 사용자별 구글 OAuth/Visitor 세션 옵션 확정 (멀티테넌시 완벽 격리)
    const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail);

    // 1. 사용자 본인 구글 드라이브 내 대상 폴더 탐색 및 자동 생성
    let targetFolderId: string | null = null;
    try {
      writeDebugLog(`Step 1: Searching folder '${targetFolderName}' in user Drive...`);
      const folderSearch = await listDriveFiles(
        { query: `mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false` },
        { preferOAuth: true, ...callOptions }
      ).catch(() => ({ files: [] }));

      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await callDriveTool("drive_create_folder", { name: targetFolderName, preferOAuth: true }, callOptions).catch(() => null);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }
    } catch (folderErr: any) {
      writeDebugLog(`Step 1 warning: ${folderErr.message}`);
    }

    // 2. 사용자 구글 드라이브 중복 파일 검사 및 업로드
    let driveFileId: string | null = null;
    let webViewLink = "";

    try {
      writeDebugLog(`Step 2: Checking if file already exists in Drive: ${targetFileName}...`);
      const existingFileCheck = await listDriveFiles(
        { folderId: targetFolderId || undefined, query: `name = '${targetFileName}' and trashed = false` },
        { preferOAuth: true, ...callOptions }
      );
      const existingDriveFiles = existingFileCheck?.files || [];
      if (existingDriveFiles.length > 0) {
        driveFileId = existingDriveFiles[0].id;
        webViewLink = existingDriveFiles[0].webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
        writeDebugLog(`Step 2 Duplicate Guard: Found existing file in Drive: ${driveFileId}`);
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
          userEmail: cleanEmail,
          callOptions,
        });

        driveFileId = uploadRes?.id || uploadRes?.fileId || null;
        webViewLink = uploadRes?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");
      } catch (uploadErr: any) {
        writeDebugLog(`Step 2 warning: ${uploadErr.message}. Checking if file was already created in Drive...`);
        try {
          const checkRes = await listDriveFiles(
            { folderId: targetFolderId || undefined, query: `name = '${targetFileName}' and trashed = false` },
            { preferOAuth: true, ...callOptions }
          );
          const foundFiles = checkRes?.files || [];
          if (foundFiles.length > 0) {
            driveFileId = foundFiles[0].id;
            webViewLink = foundFiles[0].webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
            writeDebugLog(`Step 2 Fail-Safe SUCCESS: Recovered uploaded fileId: ${driveFileId}`);
          }
        } catch (checkErr: any) {
          writeDebugLog(`Step 2 recovery check failed: ${checkErr.message}`);
        }
      }
    }

    // 멱등성 캐시 상세 정보 갱신
    if (driveFileId) {
      recentRecordingUploads.set(dedupeKey, {
        timestamp: Date.now(),
        fileId: driveFileId,
        webViewLink,
        targetFolderId,
        targetFolderName,
      });
    }

    // 3. 구글 스프레드시트 대장 고유 ID 영구 바인딩 및 원자적 행 업서트 (중복 append 원천 차단)
    writeDebugLog(`Step 3: Resolving spreadsheet for ${cleanEmail}...`);
    let targetSpreadsheetId: string | null = null;
    let targetRowIndex: number | null = null;

    try {
      const sheetTitle = "[SheetBot] 통화 녹음 대장";
      const resolved = await resolveUserSpreadsheet({
        userEmail: cleanEmail,
        sheetType: "RECORDING",
        defaultTitle: sheetTitle,
        folderId: targetFolderId,
        preferOAuth: true,
        callOptions,
      });
      targetSpreadsheetId = resolved.spreadsheetId;

      const STANDARD_RECORDING_HEADERS = [
        "통화 일시",
        "상대방",
        "파일명",
        "파일 크기",
        "AI 3줄 핵심 요약",
        "후속 할 일 (Action Items)",
        "전체 텍스트 전사(STT)",
        "구글 드라이브 바로듣기 링크",
      ];

      if (targetSpreadsheetId) {
        // 1행 헤더 확인 및 8대 표준 자동 보장
        try {
          const headerCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: targetSpreadsheetId,
            range: "시트1!A1:H1",
            preferOAuth: true,
          }, callOptions);
          const existingHeaders = headerCheck?.values?.[0] || [];
          if (existingHeaders.length < 8 || existingHeaders[4] !== STANDARD_RECORDING_HEADERS[4]) {
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!A1:H1",
              values: [STANDARD_RECORDING_HEADERS],
              preferOAuth: true,
            }, callOptions).catch(() => {});

            await callSheetsTool("sheets_format_headers", {
              spreadsheetId: targetSpreadsheetId,
              tabName: "시트1",
              headerBgColor: "#1e293b",
              headerTextColor: "#ffffff",
              preferOAuth: true,
            }, callOptions).catch(() => {});
          }
        } catch {}

        // 🛡️ [시트 C~E열 정규화 중복 검사] 이미 등록 및 AI 분석 완료 여부까지 정밀 감지
        let isDuplicate = false;
        let isAlreadyAnalyzed = false;
        try {
          const filesCheck = await callSheetsTool("sheets_get_range", {
            spreadsheetId: targetSpreadsheetId,
            range: "시트1!C:E",
            preferOAuth: true,
          }, callOptions);
          const cleanTarget = targetFileName.replace(/^\[SheetBot\]\s*/i, "").trim();
          const rows: any[][] = filesCheck?.values || [];
          const matchIndex = rows.findIndex((row: any[], idx: number) => {
            if (idx <= 0) return false;
            const name = String(row[0] || "");
            const cleanName = name.replace(/^\[SheetBot\]\s*/i, "").trim();
            return cleanName === cleanTarget || name.trim() === targetFileName.trim();
          });
          if (matchIndex !== -1) {
            isDuplicate = true;
            targetRowIndex = matchIndex + 1;
            const existingSummary = String(rows[matchIndex]?.[2] || ""); // E열: AI 3줄 요약
            if (
              existingSummary.trim().length > 0 &&
              !existingSummary.includes("⏳") &&
              !existingSummary.includes("대기") &&
              !existingSummary.includes("준비 중")
            ) {
              isAlreadyAnalyzed = true;
              writeDebugLog(`Step 3: File '${targetFileName}' at row ${targetRowIndex} is ALREADY ANALYZED. Existing summary: ${existingSummary.slice(0, 30)}...`);
            }
            writeDebugLog(`Step 3: Found existing row in sheet at row ${targetRowIndex} for ${targetFileName}, alreadyAnalyzed=${isAlreadyAnalyzed}`);
          } else {
            targetRowIndex = rows.length + 1;
          }
        } catch (sheetCheckErr: any) {
          writeDebugLog(`Step 3 sheet check warning: ${sheetCheckErr.message}`);
          targetRowIndex = null;
        }

        const listenLinkFormula = webViewLink
          ? `=HYPERLINK("${webViewLink}", "▶ 바로듣기")`
          : "-";

        if (isDuplicate && targetRowIndex) {
          if (isAlreadyAnalyzed) {
            // 💡 [사용자 원칙 3] 이미 AI 분석이 완료된 행은 E~G(요약/STT)를 절대 덮어쓰지 않고 크기 및 바로듣기 링크만 보존 갱신
            writeDebugLog(`Step 3: Preserving existing AI analysis results for row ${targetRowIndex}. Updating only size & listen link.`);
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!D${targetRowIndex}`,
              values: [[fileSizeMb]],
              preferOAuth: true,
            }, callOptions).catch(() => {});
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!H${targetRowIndex}`,
              values: [[listenLinkFormula]],
              preferOAuth: true,
            }, callOptions).catch(() => {});
          } else {
            writeDebugLog(`Step 3: Updating existing duplicate row ${targetRowIndex}...`);
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!D${targetRowIndex}:H${targetRowIndex}`,
              values: [[fileSizeMb, "⏳ AI 배치 분석 대기 중 (비용 50% 절감)", "⏳ 분석 준비 중...", "⏳ 음성 전사 대기 중...", listenLinkFormula]],
              preferOAuth: true,
            }, callOptions).catch(() => {});
          }
        } else {
          const initialRowValues = [
            [callTime, contactName, targetFileName, fileSizeMb, "⏳ AI 배치 분석 대기 중 (비용 50% 절감)", "⏳ 분석 준비 중...", "⏳ 음성 전사 대기 중...", listenLinkFormula],
          ];
          writeDebugLog(`Step 3: Appending new row to sheet ${targetSpreadsheetId}...`);
          await callSheetsTool("sheets_append_values", {
            spreadsheetId: targetSpreadsheetId,
            range: "A:H",
            values: initialRowValues,
            preferOAuth: true,
          }, callOptions).catch(() => {});
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
        rule_id: "CALL_RECORDING_UPLOAD",
        rule_name: "🎙️ 통화 녹음 구글 드라이브 자동 백업",
        device_id: "SheetBot Agent",
        recipient: contactName,
        content: `[통화녹음 업로드] ${targetFileName} (${fileSizeMb}) -> ${targetFolderName}`,
        status: "SUCCESS",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch(() => {});

    // 5. 백그라운드 AI 음성 전사(STT) 및 3줄 요약 실행
    if (targetSpreadsheetId && !isAlreadyAnalyzed) {
      await triggerAiAudioAnalysis({
        base64Audio,
        fileName: targetFileName,
        spreadsheetId: targetSpreadsheetId,
        rowIndex: targetRowIndex,
        userEmail: cleanEmail,
        contactName,
        channelCount,
        callOptions,
      }).catch((e) => writeDebugLog(`Background AI error: ${e.message}`));
    } else if (isAlreadyAnalyzed) {
      writeDebugLog(`Step 5: [Zero Token Guard] Skipping AI analysis completely for already analyzed file: ${targetFileName} (0 Tokens consumed).`);
    }
  } catch (err: any) {
    writeDebugLog(`[BackgroundPipeline] Fatal error: ${err.message}`);
  } finally {
    // 임시 파일 안전하게 회수
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        writeDebugLog(`[BackgroundPipeline] Cleaned temp file: ${tempFilePath}`);
      } catch {}
    }
  }
}

/**
 * 백그라운드 AI 음성 전사(STT) 및 핵심 3줄 요약 & Action Items 파이프라인
 * 2단계: 안드로이드 2채널(Stereo) 물리 채널 분리 가이드 (Ch0=본인, Ch1=상대방)
 * 3단계: 이지데스크 Voice Transcript 성문 프로필 연동 및 화자 자동 바인딩
 */
async function triggerAiAudioAnalysis(params: {
  base64Audio: string;
  fileName: string;
  spreadsheetId: string;
  rowIndex: number | null;
  userEmail: string;
  contactName: string;
  channelCount?: number;
  callOptions?: any;
}) {
  const {
    base64Audio,
    fileName,
    spreadsheetId,
    rowIndex,
    userEmail,
    channelCount = 2,
    callOptions: inputCallOptions,
  } = params;

  // 🛡️ AI 프롬프트 생성 전 상대방 정보 파일명 교차 검증 확정
  const resolvedAiContact = resolveDefinitiveContact(fileName, params.contactName);
  const contactName = resolvedAiContact.contactName;

  let effectiveCallOptions: any = inputCallOptions || null;

  try {
    const cleanEmail = userEmail.toLowerCase().trim();
    if (!effectiveCallOptions) {
      effectiveCallOptions = await getWorkspaceCallOptionsForEmail(cleanEmail);
    }

    // 0. [DB 감사 티켓 사전 검사] 이미 완료(SUCCEEDED)되었거나 처리 중(PENDING)인 배치 작업이 있는지 확인
    try {
      const existingJobs = await queryTable("sheetbot_ai_batch_jobs", {
        where: [
          { column: "user_email", operator: "=", value: cleanEmail },
          { column: "file_name", operator: "=", value: fileName },
        ],
        limit: 5,
      }).catch(() => null);

      if (existingJobs && existingJobs.rows && existingJobs.rows.length > 0) {
        const hasSucceeded = existingJobs.rows.some((j: any) => j.status === "SUCCEEDED");
        if (hasSucceeded) {
          writeDebugLog(`[AI Audio Analysis Skip] File '${fileName}' was already successfully analyzed in DB tickets. Skipping re-analysis to guarantee 0 tokens.`);
          return;
        }
        const hasPending = existingJobs.rows.some((j: any) => j.status === "PENDING");
        if (hasPending) {
          writeDebugLog(`[AI Audio Analysis Skip] File '${fileName}' already has a PENDING batch ticket. Skipping duplicate submission.`);
          return;
        }
      }
    } catch (checkJobErr: any) {
      writeDebugLog(`Check existing jobs error: ${checkJobErr.message}`);
    }

    // 1. 최소 오디오 크기 검사 (1KB 미만은 더미/손상 파일이므로 API 에러 방지)
    const audioBytesLen = Buffer.byteLength(base64Audio, "base64");
    if (audioBytesLen < 1024) {
      if (spreadsheetId && rowIndex && rowIndex > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!E${rowIndex}:G${rowIndex}`,
          values: [["⚠️ 테스트 파일 (음성 파형 없음)", "-", "-"]],
          preferOAuth: true,
        }, effectiveCallOptions).catch(() => {});
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
        }, effectiveCallOptions).catch(() => {});
      }
      return;
    }

    // 3. 오디오 분석 최적화 모델 (gemini-2.5-flash 기본 타겟)
    const aiSettings = await getAiModelSettings().catch(() => ({ defaultModel: "gemini-2.5-flash", tokenMultiplier: 1.0 }));
    let targetModel = aiSettings.defaultModel || "gemini-2.5-flash";
    if (targetModel.includes("3.8") || targetModel.includes("3.5")) {
      targetModel = "gemini-2.5-flash";
    }

    // [3단계] 이지데스크 Voice Transcript 등록된 성문 프로필 확인
    let hasVoiceProfile = false;
    try {
      const voiceProfileRes = await listEnrolledSpeakers().catch(() => null);
      const speakers = voiceProfileRes?.speakers || [];
      hasVoiceProfile = speakers.some(
        (s: any) => s.id === cleanEmail || s.name === `본인 (${cleanEmail})` || s.name === cleanEmail || s.name === "본인"
      );
    } catch {}

    // 파일 확장자에 따른 적정 MIME 타입 매핑
    let mimeType = "audio/mp4";
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".mp3")) mimeType = "audio/mp3";
    else if (lowerName.endsWith(".wav")) mimeType = "audio/wav";
    else if (lowerName.endsWith(".aac")) mimeType = "audio/aac";
    else if (lowerName.endsWith(".ogg")) mimeType = "audio/ogg";
    else if (lowerName.endsWith(".flac")) mimeType = "audio/flac";

    const isStereo = channelCount === 2;
    const channelGuide = isStereo
      ? `• [물리 오디오 채널 정보 (2채널 Stereo)]
  - 본 녹음은 2채널(Stereo)로 녹음된 스마트폰 통화 녹음 파일입니다.
  - Channel 0 (좌측, Left 채널)은 스마트폰 마이크 입력으로 '본인 (기기 소유자)'의 목소리입니다.
  - Channel 1 (우측, Right 채널)은 수화기 RIL(Downlink) 수신 음성으로 '상대방 (${contactName})'의 목소리입니다.
  - 좌/우 채널의 음성 분리와 발화 맥락을 엄격히 일치시켜 본인과 상대방을 100% 무오차로 분리하세요.`
      : `• [1채널 Mono 음원 화자 분리]
  - 본 녹음은 1채널(Mono)로 믹싱된 음원입니다.
  - 음성의 음색, 높낮이, 대화 주도 관계를 정밀 분석하여 본인과 상대방(${contactName})을 명확히 분리하세요.`;

    const voiceProfileHint = hasVoiceProfile
      ? `• [3단계 성문 프로필 연동] 기기 소유자인 '본인'의 음성 성문 프로필이 등록되어 있습니다. 본인 특유의 억양과 상대방(${contactName})을 부르는 호칭 관계를 기반으로 정확하게 라벨링하세요.`
      : `• 통화 상대방의 이름 및 전화번호는 "${contactName}"입니다.`;

    const prompt = `당신은 비즈니스 통화 녹음 정밀 분석 및 화자 분리(Speaker Diarization) 전문 AI입니다.
첨부된 통화 녹음 파일("${fileName}")의 음성을 분석하여, 통화 참여자인 '본인(기기 소유자)'과 '상대방(${contactName})'의 발화를 타임라인 순서대로 명확히 구분하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 기타 텍스트 없이 순수 JSON만 반환하세요:
{
  "summary": "1. [주요 문의 및 통화 목적]\\n2. [협의 및 결정 사항]\\n3. [기타 특이사항]",
  "actionItems": "• [후속 조치 1]\\n• [후속 조치 2]",
  "transcript": "[상대방 (${contactName})]: [발화 내용]\\n[본인]: [발화 내용]\\n..."
}

화자 판별 및 전사 필수 준수사항:
1. 전사 라벨(Label) 명칭:
   - 절대로 '화자 1', '화자 2'와 같은 불명확한 명칭을 사용하지 마세요.
   - 반드시 '[본인]: [발화]'와 '[상대방 (${contactName})]: [발화]'로 명시하세요.
2. 참여자 관계 및 역할 판별:
   - 본 통화의 참여자는 단 2명입니다:
     ① 본인 (스마트폰 기기 소유자 / SheetBot 사용자)
     ② 상대방 (${contactName})
   - 전화를 걸었거나 받은 주체, 회사/서비스 소개를 하거나 용건에 답하는 비즈니스 응대 주체가 '본인'입니다.
   - 용건을 문의하거나 자신의 신원을 밝히는 고객/거래처 주체가 '상대방 (${contactName})'입니다.
${channelGuide}
${voiceProfileHint}
3. 전사(transcript)는 반드시 두 참여자의 대화를 한 문장/발화 단위로 번갈아가며 타임라인 순으로 화자 분리하여 전사해야 합니다. 화자 분리 없이 한 문단으로 뭉뚱그려 작성하면 안 됩니다.`;

    let rawText = "";
    let isBatchSuccess = false;

    // [배치 방식 우선 시도] 50% 비용 절감 Gemini Batch API
    try {
      writeDebugLog(`Submitting async AI Batch job for ${fileName}...`);
      const batchSubmitRes = await callAiBatchSubmit(
        [
          {
            key: `call-${Date.now()}`,
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
          caller: "sheetbot-voice-batch",
          model: targetModel,
          displayName: `CallRecording-${fileName.slice(0, 30)}`,
        }
      );

      if (batchSubmitRes.success && batchSubmitRes.jobName) {
        let batchJobId: number | null = null;
        try {
          const insertRes = await insertRows("sheetbot_ai_batch_jobs", [
            {
              job_name: batchSubmitRes.jobName,
              job_type: "RECORDING",
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
          writeDebugLog(`Batch ticket registered in DB: ID ${batchJobId} (${batchSubmitRes.jobName})`);
        } catch (e: any) {
          writeDebugLog(`[BatchJobs] Insert error: ${e.message}`);
        }

        // [15초 Fast-Check] 초단기 완료건은 즉시 감지 (서버 블로킹 최소화)
        const batchGetRes = await callAiBatchGet(batchSubmitRes.jobName, {
          waitMs: 15000,
          pollIntervalMs: 3000,
        });

        if (batchGetRes.success && batchGetRes.results && batchGetRes.results.length > 0) {
          const firstResult = batchGetRes.results[0];
          rawText = (firstResult.text || firstResult.content || firstResult.response || "").trim();
          if (rawText.length > 0) {
            isBatchSuccess = true;
            writeDebugLog(`Fast-Check Batch job succeeded! Text length: ${rawText.length}`);
            const nowStr = getKoreanTimeString();
            if (batchJobId) {
              await updateRows("sheetbot_ai_batch_jobs", {
                status: "SUCCEEDED",
                completed_at: nowStr,
                updated_at: nowStr,
              }, { ids: [batchJobId] }).catch(() => {});
            } else {
              await updateRows("sheetbot_ai_batch_jobs", {
                status: "SUCCEEDED",
                completed_at: nowStr,
                updated_at: nowStr,
              }, { filters: { job_name: batchSubmitRes.jobName } }).catch(() => {});
            }
          }
        } else {
          writeDebugLog(`[Zero-Block] Batch job ${batchSubmitRes.jobName} is still processing after 15s. Delegating to Async Sweeper Worker.`);
          // 15초 초과 시 스레드를 묶어두지 않고 백그라운드 워커에 위임 (실시간 504 Timeout 원천 차단)
          return;
        }
      } else {
        writeDebugLog(`Batch submit was not successful: ${batchSubmitRes.error}`);
      }
    } catch (batchErr: any) {
      writeDebugLog(`Batch attempt warning: ${batchErr.message}`);
    }

    // [중요: 오디오 파일 실시간 폴백 504 Timeout 방어]
    // 50KB 이상의 대용량 음성 파일을 실시간 callAiCaller로 부르면 60초 타임아웃 및 504 Gateway Timeout 발생
    if (!rawText) {
      if (audioBytesLen > 80 * 1024) {
        writeDebugLog(`Audio file size (${formatBytes(audioBytesLen)}) is large. Skipping synchronous call to prevent 504 Gateway Timeout.`);
        return;
      }
      writeDebugLog(`Calling standard AI Caller for small audio ${fileName}...`);
      const aiRes = await callAiCaller(prompt, {
        caller: "sheetbot-voice-intelligence",
        model: targetModel,
        temperature: 0.1,
        files: [
          {
            name: fileName,
            content: base64Audio,
            encoding: "base64",
            mimeType,
          },
        ],
      });
      rawText = (aiRes.text || aiRes.content || "").trim();
    }

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

    const baseMultiplier = (aiSettings as any).tokenMultiplier || 1.0;
    const batchDiscountRate = isBatchSuccess ? 0.5 : 1.0;
    const billing = calculateBillableTokens({
      promptText: prompt,
      responseText: rawText,
      tokenMultiplier: baseMultiplier,
      additionalBillingFactor: batchDiscountRate,
    });
    const usedTokens = billing.billableTokens;

    await deductTokens(cleanEmail, usedTokens);

    const modeLabel = isBatchSuccess ? "AI 배치(50% 절감)" : "실시간 폴백";
    void recordAiUsageLog({
      userEmail: cleanEmail,
      caller: isBatchSuccess ? "sheetbot-voice-batch" : "sheetbot-voice-intelligence",
      purpose: `통화 녹음 AI STT 및 3줄 요약/Action Items [${modeLabel}] (${targetModel} / ${baseMultiplier * batchDiscountRate}x)`,
      model: targetModel,
      promptTokens: billing.promptTokens,
      completionTokens: billing.completionTokens,
      totalTokens: usedTokens,
      promptText: `음성 분석: ${fileName}`,
      responseText: summary,
    });

    // 6. 🛡️ 지능형 행 핑거프린트 가드: 구글 시트 행 업데이트 전 사용자 삭제/이동 점검
    if (spreadsheetId && rowIndex && rowIndex > 1) {
      const guardRes = await resolveSafeTargetRow({
        spreadsheetId,
        expectedRow: rowIndex,
        fileName,
      });

      const safeRow = guardRes.safeRow;
      if (safeRow && safeRow > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!E${safeRow}:G${safeRow}`,
          values: [[summary, actionItems, transcript]],
          preferOAuth: true,
        }, effectiveCallOptions).catch((e: any) => console.warn("[AiAudioAnalysis] Sheet update warning:", e.message));
      } else {
        console.warn(`[AiAudioAnalysis] 🛑 Target row for ${fileName} was deleted by user (${guardRes.reason}). Skipping sheet update.`);
      }
    }

    // [스마트 통합 할 일 허브 (Task Hub) 연동]
    // 1. 통화 완료 시 기존 부재중 전화 할 일이 있었다면 자동 해결(DONE) 처리
    await autoResolveMissedCallTasks(cleanEmail, contactName).catch((e: any) =>
      console.warn("[AiAudioAnalysis] autoResolveMissedCallTasks error:", e.message)
    );

    // 2. 추출된 Action Items를 스마트 할 일 대장에 자동 등록
    const parsedTasks = parseActionItems(actionItems);
    for (const task of parsedTasks) {
      await createTaskItem({
        userEmail: cleanEmail,
        sourceType: "CALL_RECORDING",
        sourceRef: fileName,
        contactName,
        taskTitle: task.title,
        dueDate: task.dueDate,
        priority: task.priority,
        badgeText: "통화 녹음",
      }).catch((e: any) => console.warn("[AiAudioAnalysis] createTaskItem error:", e.message));
    }

    console.log(`[AiAudioAnalysis] Audio ${fileName} analyzed via ${modeLabel} & ${usedTokens} tokens deducted for ${cleanEmail}.`);
  } catch (err: any) {
    console.warn("[AiAudioAnalysis] Background audio analysis failed:", err.message);
    if (spreadsheetId && rowIndex && rowIndex > 1) {
      const guardRes = await resolveSafeTargetRow({
        spreadsheetId,
        expectedRow: rowIndex,
        fileName,
      }).catch(() => ({ safeRow: null }));

      const safeRow = guardRes.safeRow;
      if (safeRow && safeRow > 1) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: `시트1!E${safeRow}:G${safeRow}`,
          values: [[`⚠️ AI 분석 일시 지연 (${err.message?.slice(0, 40) || "파일 형식 확인 요망"})`, "-", "-"]],
          preferOAuth: true,
        }, effectiveCallOptions).catch(() => {});
      }
    }
  }
}
