import {
  callDriveTool,
  callSheetsTool,
  callAiCaller,
  callAiBatchSubmit,
  callAiBatchGet,
  listDriveFiles,
  createDriveFolder,
  uploadDriveFile,
  moveDriveFile,
  insertRows,
  updateRows,
  queryTable,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getAiModelSettings } from "@/lib/ai-settings";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";
import { resolveSafeTargetRow } from "@/lib/sheet-fingerprint-guard";
import fs from "fs";
import path from "path";
import os from "os";

// 드라이브 폴더 0초 메모리 캐시
const folderCache = new Map<string, string>([
  ["[SheetBot] 통화 녹음", "14TuBcWsooWB7_yPqyn6L0imjshpVxFVX"],
  ["[SheetBot] 영수증 보관함", "1rKVf3Swmi-VifK0fJoME5cdknZgA4H7K"],
  ["[SheetBot] 명함 보관함", "1PypdJD-D7El1btJ-POyINjP00x7r3rIu"],
  ["[SheetBot] 스크랩 보관함", "185vGZRGTDY4g6iG_OZdgGCuJ23D4GsHE"],
  ["[SheetBot] 파일 보관함", "1bRO1aJEEQBUX_R9bFLfZ7C0liZFZjijc"],
]);

// 멱등성 및 진행 락 캐시
const recentFileUploads = new Map<string, { timestamp: number; response: any }>();
const inFlightUploads = new Map<string, { jobId: string; timestamp: number }>();

// 백그라운드 구글 드라이브 업로드 및 시트 적재의 순차 처리를 위한 직렬화 큐
let cardBackgroundQueue: Promise<any> = Promise.resolve();

export interface ProcessGenericFileInput {
  userEmail: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  folderName?: string | null;
  memo?: string;
  autoRecordSheet?: boolean;
  deviceId?: string;
  ocrType?: string;
}

export interface ProcessGenericFileOutput {
  success: boolean;
  message?: string;
  error?: string;
  ocrType?: string;
  fileId?: string | null;
  fileName?: string;
  folderName?: string;
  folderId?: string | null;
  webViewLink?: string;
  spreadsheetUrl?: string;
  ocrData?: any;
  cardData?: any;
  jobId?: string;
  status?: string;
  isDuplicate?: boolean;
}

/**
 * 일반 파일, 영수증(RECEIPT), 명함(BUSINESS_CARD) 통합 처리 파이프라인
 */
export async function processGenericFile(input: ProcessGenericFileInput): Promise<ProcessGenericFileOutput> {
  await setupDatabase();

  const cleanEmail = input.userEmail.toLowerCase().trim();
  if (!cleanEmail) {
    return { success: false, error: "사용자 이메일 정보가 누락되었습니다." };
  }

  const rawFileName = input.fileName || "업로드_파일";
  const ocrType = (input.ocrType || "GENERIC").toUpperCase().trim();
  const deviceId = input.deviceId || "SheetBot Agent";
  const customFolderName = input.folderName || null;
  const memo = input.memo || "스마트폰 시트봇 에이전트 업로드";
  const autoRecordSheet = input.autoRecordSheet !== false;
  const mimeType = input.mimeType || "application/octet-stream";

  if (!fs.existsSync(input.filePath)) {
    return { success: false, error: `파일을 찾을 수 없습니다: ${input.filePath}` };
  }

  const fileStats = fs.statSync(input.filePath);
  const buffer = fs.readFileSync(input.filePath);

  // 1-1. [Idempotency] 동일 사용자 + 동일 파일명/크기 60초 이내 중복 전송 방어 & 선제 락
  const dedupKey = `${cleanEmail}:${rawFileName.trim()}:${fileStats.size}:${ocrType}`;
  const nowTs = Date.now();

  const inFlight = inFlightUploads.get(dedupKey);
  if (inFlight && nowTs - inFlight.timestamp < 60000) {
    console.log(`[UploadProcessor] 🛡️ In-Flight duplicate upload detected: ${rawFileName} (reusing jobId: ${inFlight.jobId})`);
    return {
      success: true,
      jobId: inFlight.jobId,
      status: "PROCESSING",
      message: "동일한 명함 사진의 분석 작업이 이미 진행 중입니다. 백그라운드에서 안전하게 완료됩니다.",
      ocrType,
      fileName: rawFileName.trim(),
      isDuplicate: true,
    };
  }

  const cachedUpload = recentFileUploads.get(dedupKey);
  if (cachedUpload && nowTs - cachedUpload.timestamp < 60000) {
    console.log(`[UploadProcessor] 🛡️ Duplicate upload ignored within 60s: ${rawFileName} (serving cached response)`);
    return {
      ...cachedUpload.response,
      isDuplicate: true,
    };
  }

  // 2. ocrType에 따른 폴더명 및 시트 대장명 결정
  let defaultFolderName = "[SheetBot] 파일 보관함";
  let defaultSheetTitle = "[SheetBot] 파일 업로드 대장";

  if (ocrType === "RECEIPT") {
    defaultFolderName = "[SheetBot] 영수증 보관함";
    defaultSheetTitle = "[SheetBot] 스마트 경비 영수증 대장";
  } else if (ocrType === "BUSINESS_CARD") {
    defaultFolderName = "[SheetBot] 명함 보관함";
    defaultSheetTitle = "[SheetBot] 스마트 명함 관리 대장";
  }

  let targetFolderName = (customFolderName && customFolderName.trim()) ? customFolderName.trim() : defaultFolderName;
  if (!targetFolderName.startsWith("[SheetBot]")) {
    targetFolderName = `[SheetBot] ${targetFolderName}`;
  }

  let targetFileName = rawFileName.trim();
  if (!targetFileName.startsWith("[SheetBot]")) {
    targetFileName = `[SheetBot] ${targetFileName}`;
  }

  const fileSizeMb = buffer.length >= 1024 * 1024
    ? (buffer.length / (1024 * 1024)).toFixed(2) + " MB"
    : (buffer.length / 1024).toFixed(1) + " KB";

  // 3. 구글 드라이브 대상 폴더 탐색 및 미존재 시 자동 생성
  let targetFolderId: string | null = folderCache.get(targetFolderName) || null;

  if (!targetFolderId) {
    try {
      const bindingSheetType = ocrType === "RECEIPT" ? "RECEIPT" : (ocrType === "BUSINESS_CARD" ? "BUSINESS_CARD" : "FILE_UPLOAD");
      const bindingQuery = await queryTable("sheetbot_user_sheet_bindings", {
        filters: { user_email: cleanEmail, sheet_type: bindingSheetType },
        limit: 1,
      });
      if (bindingQuery?.rows?.[0]?.folder_id) {
        targetFolderId = String(bindingQuery.rows[0].folder_id);
        folderCache.set(targetFolderName, targetFolderId);
      }
    } catch {}
  }

  if (!targetFolderId && ocrType !== "BUSINESS_CARD") {
    try {
      const folderSearch = await listDriveFiles({
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${targetFolderName}' and trashed = false`,
      }, { preferOAuth: true });

      const existingFolders = folderSearch?.files || [];
      if (existingFolders.length > 0) {
        targetFolderId = existingFolders[0].id;
      } else {
        const newFolderRes = await createDriveFolder(targetFolderName, undefined, true);
        targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
      }

      if (targetFolderId) {
        folderCache.set(targetFolderName, targetFolderId);
      }
    } catch (folderErr: any) {
      console.warn("[UploadProcessor] Folder resolve warning:", folderErr.message);
    }
  }

  if (!targetFolderId && ocrType !== "BUSINESS_CARD") {
    try {
      const retryCreate = await createDriveFolder(targetFolderName, undefined, true);
      targetFolderId = retryCreate?.id || (typeof retryCreate === "string" ? retryCreate : null);
      if (targetFolderId) folderCache.set(targetFolderName, targetFolderId);
    } catch {}
    if (!targetFolderId) {
      throw new Error(`대상 구글 드라이브 폴더('${targetFolderName}')를 특정하지 못했습니다.`);
    }
  }

  const shouldRecordSheet = autoRecordSheet || ocrType === "BUSINESS_CARD" || ocrType === "RECEIPT";
  let driveFileId: string | null = null;
  let webViewLink = "";
  let cardOcrResult: any = null;
  let cardSpreadsheetUrl: string | null = null;

  if (ocrType === "BUSINESS_CARD" && shouldRecordSheet) {
    // 🪪 [Direct-Return Instant CRM] 초고속 실시간 명함 분석 파이프라인
    console.log(`[UploadProcessor] 🪪 Instant Direct Realtime AI OCR for Business Card: ${targetFileName}`);

    const base64File = buffer.toString("base64");
    let ocrResult: any = null;
    try {
      ocrResult = await performAiOcr(base64File, targetFileName, mimeType, "BUSINESS_CARD");
    } catch (ocrErr: any) {
      console.warn("[UploadProcessor] Direct Card AI OCR error:", ocrErr.message);
    }

    const cName = ocrResult?.name || "명함 고객";
    const finalOcrData = ocrResult || {
      name: cName,
      title: "",
      company: "",
      mobile: "",
      email: "",
      tel: "",
      address: "",
      details: "",
    };

    const jobId = `card_job_${Date.now()}`;
    const successResponse: ProcessGenericFileOutput = {
      success: true,
      jobId,
      status: "COMPLETED",
      message: `🪪 [${cName}] 명함 AI 분석이 완료되었습니다.`,
      ocrType: "BUSINESS_CARD",
      fileName: targetFileName,
      folderName: targetFolderName,
      folderId: targetFolderId,
      ocrData: finalOcrData,
      cardData: finalOcrData,
    };

    recentFileUploads.set(dedupKey, { timestamp: nowTs, response: successResponse });

    // 백그라운드 구글 드라이브 업로드 및 시트 행 적재
    const capturedFolderId = targetFolderId;
    const capturedFileName = targetFileName;
    const capturedMimeType = mimeType;
    const capturedBuffer = buffer;

    setTimeout(() => {
      cardBackgroundQueue = cardBackgroundQueue.then(async () => {
        try {
          let actualFolderId = capturedFolderId;
          if (!actualFolderId) {
            actualFolderId = folderCache.get(targetFolderName) || null;
            if (!actualFolderId) {
              const newFolderRes = await createDriveFolder(targetFolderName, undefined, true).catch(() => null);
              actualFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
              if (actualFolderId) folderCache.set(targetFolderName, actualFolderId);
            }
          }

          const resolved = await resolveUserSpreadsheet({
            userEmail: cleanEmail,
            sheetType: "BUSINESS_CARD",
            defaultTitle: defaultSheetTitle,
            folderId: actualFolderId || undefined,
            preferOAuth: true,
          }).catch(() => null);

          const targetSpreadsheetId = resolved?.spreadsheetId;

          let bgWebViewLink = "";
          try {
            if (actualFolderId) {
              const existingSearch = await listDriveFiles({
                query: `'${actualFolderId}' in parents and name = '${capturedFileName}' and trashed = false`,
              }, { preferOAuth: true }).catch(() => null);

              if (existingSearch?.files && existingSearch.files.length > 0) {
                const bgId = existingSearch.files[0].id;
                bgWebViewLink = existingSearch.files[0].webViewLink || `https://drive.google.com/file/d/${bgId}/view`;
              }
            }

            if (!bgWebViewLink && actualFolderId) {
              const uploadRes = await uploadDriveFileWithBridge({
                buffer: capturedBuffer,
                fileName: capturedFileName,
                folderId: actualFolderId,
                mimeType: capturedMimeType,
                userEmail: cleanEmail,
              }).catch(() => null);

              if (uploadRes?.id) {
                bgWebViewLink = uploadRes.webViewLink || `https://drive.google.com/file/d/${uploadRes.id}/view`;
              }
            }
          } catch {}

          if (targetSpreadsheetId) {
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "시트1!A:K",
              values: [[
                getKoreanTimeString(),
                finalOcrData.name || "-",
                finalOcrData.title || "-",
                finalOcrData.company || "-",
                finalOcrData.mobile || "-",
                finalOcrData.email || "-",
                finalOcrData.tel || "-",
                finalOcrData.address || "-",
                finalOcrData.details || "-",
                bgWebViewLink ? `=HYPERLINK("${bgWebViewLink}", "🪪 명함 원본 보기")` : "-",
                "✅ 분석 완료",
              ]],
              preferOAuth: true,
            }).catch(() => {});
          }
        } catch (bgErr: any) {
          console.warn("[UploadProcessor] Card background pipeline error:", bgErr.message);
        }
      });
    }, 150);

    return successResponse;
  }

  // 4. 일반 파일 및 영수증 드라이브 업로드
  let uploadResult: any = null;
  try {
    uploadResult = await uploadDriveFileWithBridge({
      buffer,
      fileName: targetFileName,
      folderId: targetFolderId!,
      mimeType,
      userEmail: cleanEmail,
    });
  } catch (upErr: any) {
    console.error("[UploadProcessor] Drive upload error:", upErr);
    throw upErr;
  }

  driveFileId = uploadResult?.id || null;
  webViewLink = uploadResult?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");

  // 5. 구글 시트 대장 적재
  if (shouldRecordSheet) {
    const defaultTitle = defaultSheetTitle;
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: ocrType === "RECEIPT" ? "RECEIPT" : "FILE_UPLOAD",
      defaultTitle,
      folderId: targetFolderId || undefined,
      preferOAuth: true,
    });

    const targetSpreadsheetId = resolved.spreadsheetId;
    cardSpreadsheetUrl = resolved.spreadsheetUrl;

    if (ocrType === "RECEIPT") {
      // 영수증 시트 등록
      const appendResult = await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "시트1!A:L",
        values: [[
          getKoreanTimeString(),
          "신용카드 영수증",
          "분석 대기중...",
          "-",
          "-",
          "-",
          "-",
          memo,
          "카드/현금",
          "-",
          webViewLink ? `=HYPERLINK("${webViewLink}", "🧾 영수증 보기")` : "-",
          "⏳ AI 영수증 분석중...",
        ]],
        preferOAuth: true,
      });

      const updatedRange = appendResult?.updates?.updatedRange || "";
      const rowMatch = updatedRange.match(/!A(\d+):/);
      const rowToUpdate = rowMatch ? parseInt(rowMatch[1], 10) : 2;

      // 비동기 AI 분석 파이프라인 (AI Caller)
      (async () => {
        try {
          const base64File = buffer.toString("base64");
          const ocrResult = await performAiOcr(base64File, targetFileName, mimeType, "RECEIPT");
          if (ocrResult && targetSpreadsheetId) {
            const bNum = formatBusinessNumber(ocrResult.businessNumber);
            const amtNum = ocrResult.amount ? Number(String(ocrResult.amount).replace(/[^0-9]/g, "")) : 0;
            const vatNum = ocrResult.vat ? Number(String(ocrResult.vat).replace(/[^0-9]/g, "")) : 0;
            const supplyNum = Math.max(0, amtNum - vatNum);
            const amt = amtNum.toLocaleString("ko-KR");
            const vat = vatNum.toLocaleString("ko-KR");
            const supplyAmt = supplyNum.toLocaleString("ko-KR");
            const paymentMethod = [ocrResult.cardIssuer, ocrResult.cardNumber].filter(Boolean).join(" ") || (ocrResult.receiptType?.includes("카드") ? "신용카드" : "현금/기타");

            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!A${rowToUpdate}:L${rowToUpdate}`,
              values: [[
                ocrResult.paidAt || getKoreanTimeString(),
                ocrResult.receiptType || "신용카드 영수증",
                ocrResult.merchantName || "확인 불가",
                bNum || "-",
                amt,
                supplyAmt,
                vat,
                ocrResult.details || "-",
                paymentMethod,
                ocrResult.approvalNumber || "-",
                webViewLink ? `=HYPERLINK("${webViewLink}", "🧾 영수증 보기")` : "-",
                "✅ 분석 완료",
              ]],
              preferOAuth: true,
            }).catch(() => {});
          }
        } catch (err: any) {
          console.warn("[UploadProcessor] Async receipt OCR warning:", err.message);
        }
      })();
    } else {
      // 일반 파일 시트 등록
      await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "시트1!A:H",
        values: [[
          getKoreanTimeString(),
          targetFileName,
          fileSizeMb,
          mimeType,
          targetFolderName,
          memo,
          webViewLink ? `=HYPERLINK("${webViewLink}", "📁 파일 열기")` : "-",
          deviceId,
        ]],
        preferOAuth: true,
      }).catch(() => {});
    }
  }

  const successResponse: ProcessGenericFileOutput = {
    success: true,
    message: ocrType === "RECEIPT"
      ? `영수증 AI 분석이 등록되어 구글 스프레드시트 '${defaultSheetTitle}'에 자동 장부화됩니다.`
      : `파일이 구글 드라이브 '${targetFolderName}' 폴더로 안전하게 업로드되었습니다.`,
    ocrType,
    fileId: driveFileId,
    fileName: targetFileName,
    folderName: targetFolderName,
    folderId: targetFolderId,
    webViewLink,
    spreadsheetUrl: cardSpreadsheetUrl || undefined,
  };

  recentFileUploads.set(dedupKey, { timestamp: nowTs, response: successResponse });
  return successResponse;
}

export interface ProcessCallRecordingInput {
  userEmail: string;
  filePath: string;
  fileName: string;
  contactName?: string | null;
  callTime?: string | null;
  folderName?: string | null;
  autoRecordSheet?: boolean;
}

export interface ProcessCallRecordingOutput {
  success: boolean;
  message?: string;
  error?: string;
  fileId?: string | null;
  fileName?: string;
  folderName?: string;
  webViewLink?: string;
  spreadsheetUrl?: string;
}

/**
 * 통화 녹음 파일 구글 드라이브 업로드 및 AI 배치 전사 파이프라인
 */
export async function processCallRecordingFile(input: ProcessCallRecordingInput): Promise<ProcessCallRecordingOutput> {
  await setupDatabase();

  const cleanEmail = input.userEmail.toLowerCase().trim();
  if (!cleanEmail) {
    return { success: false, error: "사용자 이메일 정보가 누락되었습니다." };
  }

  if (!fs.existsSync(input.filePath)) {
    return { success: false, error: `통화 녹음 파일을 찾을 수 없습니다: ${input.filePath}` };
  }

  const buffer = fs.readFileSync(input.filePath);
  const rawFileName = input.fileName || "통화녹음_파일";
  const contactName = input.contactName || "미지정 연락처";
  const callTime = input.callTime || getKoreanTimeString();
  const targetFolderName = input.folderName || "[SheetBot] 통화 녹음";
  const autoRecordSheet = input.autoRecordSheet !== false;

  let targetFolderId = folderCache.get(targetFolderName) || null;
  if (!targetFolderId) {
    const newFolderRes = await createDriveFolder(targetFolderName, undefined, true).catch(() => null);
    targetFolderId = newFolderRes?.id || (typeof newFolderRes === "string" ? newFolderRes : null);
    if (targetFolderId) folderCache.set(targetFolderName, targetFolderId);
  }

  // 구글 드라이브 업로드
  const uploadResult = await uploadDriveFileWithBridge({
    buffer,
    fileName: rawFileName,
    folderId: targetFolderId!,
    mimeType: "audio/m4a",
    userEmail: cleanEmail,
  });

  const fileId = uploadResult?.id || null;
  const webViewLink = uploadResult?.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : "");

  let spreadsheetUrl: string | undefined;

  // 구글 스프레드시트 [SheetBot] 통화 녹음 대장 적재
  if (autoRecordSheet) {
    const resolved = await resolveUserSpreadsheet({
      userEmail: cleanEmail,
      sheetType: "CALL_RECORDING",
      defaultTitle: "[SheetBot] 스마트폰 통화 녹음 대장",
      folderId: targetFolderId || undefined,
      preferOAuth: true,
    });

    spreadsheetUrl = resolved.spreadsheetUrl;
    const targetSpreadsheetId = resolved.spreadsheetId;

    if (targetSpreadsheetId) {
      await callSheetsTool("sheets_append_values", {
        spreadsheetId: targetSpreadsheetId,
        range: "시트1!A:K",
        values: [[
          callTime,
          contactName,
          rawFileName,
          buffer.length >= 1024 * 1024 ? (buffer.length / (1024 * 1024)).toFixed(1) + " MB" : (buffer.length / 1024).toFixed(0) + " KB",
          webViewLink ? `=HYPERLINK("${webViewLink}", "🎙️ 녹음 듣기")` : "-",
          "⏳ AI 배치 전사 대기중...",
          "-",
          "-",
          "-",
          "대기",
          getKoreanTimeString(),
        ]],
        preferOAuth: true,
      }).catch(() => {});
    }
  }

  return {
    success: true,
    message: `통화 녹음이 구글 드라이브 '${targetFolderName}'에 안전하게 보관되었습니다.`,
    fileId,
    fileName: rawFileName,
    folderName: targetFolderName,
    webViewLink,
    spreadsheetUrl,
  };
}

function formatBusinessNumber(raw: any): string {
  if (!raw) return "미기재";
  const str = String(raw).trim();
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return str.length > 0 ? str : "미기재";
}

async function performAiOcr(
  base64File: string,
  fileName: string,
  mimeType: string,
  ocrType: "RECEIPT" | "BUSINESS_CARD",
  modelName?: string
): Promise<any> {
  const prompt = ocrType === "RECEIPT"
    ? `당신은 대한민국 영수증 및 증빙 전표 분석 전문 AI 공인회계사입니다.
첨부된 영수증/전표/거래 확인 문서 이미지("${fileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 서두 없이 순수 JSON만 반환하세요:
{
  "receiptType": "영수증 구분 ('신용카드 영수증' | '현금영수증' | '간이영수증' | '일반인정영수증')",
  "paidAt": "결제 일시 (YYYY-MM-DD HH:mm 형식)",
  "merchantName": "상호명 또는 가맹점명",
  "businessNumber": "사업자등록번호 (10자리 숫자 또는 000-00-00000 형식)",
  "amount": "최종 결제금액 (숫자만)",
  "vat": "부가가치세/세액 (숫자만)",
  "cardIssuer": "카드사명",
  "cardNumber": "카드번호",
  "approvalNumber": "승인번호",
  "details": "상세 거래 품목 내역"
}`
    : `당신은 비즈니스 명함 분석 및 기업 CRM 전문 AI입니다.
첨부된 명함 이미지("${fileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 서두 없이 순수 JSON만 반환하세요:
{
  "name": "성함",
  "title": "직함 및 직책",
  "company": "회사명 또는 소속 기관명",
  "mobile": "휴대전화번호",
  "email": "이메일 주소",
  "tel": "회사 대표전화",
  "address": "회사 주소",
  "details": "상세정보 요약"
}`;

  let innerText = "";
  try {
    const aiCallerPromise = callAiCaller(prompt, {
      ...(modelName ? { model: modelName } : {}),
      temperature: 0.1,
      files: [
        {
          name: fileName,
          content: base64File,
          encoding: "base64",
          mimeType: mimeType.startsWith("image/") || mimeType === "application/pdf" ? mimeType : "image/jpeg",
        },
      ],
    });

    const aiRes = await Promise.race([
      aiCallerPromise,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("AI Caller timeout (12s)")), 12000)),
    ]);

    if (aiRes) {
      const rawRes = (aiRes as any).raw || aiRes;
      if (rawRes?.result?.content?.[0]?.text) {
        try {
          const parsed = JSON.parse(rawRes.result.content[0].text);
          innerText = parsed.content || parsed.text || rawRes.result.content[0].text;
        } catch {
          innerText = rawRes.result.content[0].text;
        }
      } else {
        innerText = (aiRes as any).text || (aiRes as any).content || "";
      }
    }
  } catch (err: any) {
    console.warn("[AiOcr] AI Caller execution warning:", err.message);
  }

  let rawText = innerText.trim();
  if (rawText.startsWith("```json")) {
    rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}
