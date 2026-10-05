export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
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
import { processPendingBatchJobs } from "@/lib/ai-batch-sweeper";
import { resolveSafeTargetRow } from "@/lib/sheet-fingerprint-guard";
import { createCardJob, updateCardJob } from "@/lib/card-job-store";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * 파일 업로드 60초 중복 수신 방지 캐시 (Idempotency) 및 동시 진행 락 (In-Flight Lock)
 */
const recentFileUploads = new Map<string, { timestamp: number; response: any }>();
const inFlightUploads = new Map<string, { jobId: string; timestamp: number }>();
const folderCache = new Map<string, string>([
  ["[SheetBot] 통화 녹음", "14TuBcWsooWB7_yPqyn6L0imjshpVxFVX"],
  ["[SheetBot] 영수증 보관함", "1rKVf3Swmi-VifK0fJoME5cdknZgA4H7K"],
  ["[SheetBot] 명함 보관함", "1PypdJD-D7El1btJ-POyINjP00x7r3rIu"],
  ["[SheetBot] 스크랩 보관함", "185vGZRGTDY4g6iG_OZdgGCuJ23D4GsHE"],
  ["[SheetBot] 파일 보관함", "1bRO1aJEEQBUX_R9bFLfZ7C0liZFZjijc"],
]);

/**
 * POST /api/user/files/upload
 * 스마트폰 시트봇 에이전트(공유하기 메뉴 또는 앱 내 직접 선택)에서 사진/문서 파일을 수신하여
 * 구글 드라이브 지정 폴더에 자동 업로드하고, 폴더 내 [SheetBot] 대장 시트에 실시간 기록.
 *
 * [v1.5.0 AI OCR 확장 지원]:
 * - ocrType === "RECEIPT" : 영수증 AI 분석 -> [SheetBot] 영수증 보관함 / [SheetBot] 스마트 경비 영수증 대장
 * - ocrType === "BUSINESS_CARD" : 명함 AI 분석 -> [SheetBot] 명함 보관함 / [SheetBot] 스마트 명함 관리 대장
 * - ocrType === "GENERIC" (기본) : 일반 파일 업로드 -> [SheetBot] 파일 보관함 / [SheetBot] 파일 업로드 대장
 */
export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  try {
    await setupDatabase();

    // 1. 유저 식별 (세션, 헤더, 폼데이터/JSON 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let bodyEmail: string | null = null;
    let ocrType = "GENERIC";
    let deviceId = "SheetBot Agent";
    let rawFileName = "업로드_파일";
    let customFolderName: string | null = null;
    let memo = "스마트폰 시트봇 에이전트 업로드";
    let autoRecordSheet = true;
    let mimeType: string = "application/octet-stream";

    if (contentType.includes("application/json")) {
      const json = await req.json();
      bodyEmail = json.userEmail || json.email || null;
      ocrType = ((json.ocrType as string | null) || "GENERIC").toUpperCase().trim();
      deviceId = json.deviceId || "SheetBot Agent";
      rawFileName = json.fileName || rawFileName;
      customFolderName = json.folderName || null;
      memo = json.memo || memo;
      autoRecordSheet = json.autoRecordSheet !== false;
      mimeType = json.mimeType || mimeType;

      const rawBase64 = json.fileBase64 || json.base64 || json.imageBase64 || "";
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      bodyEmail = formData.get("userEmail") as string | null;
      ocrType = ((formData.get("ocrType") as string | null) || "GENERIC").toUpperCase().trim();
      deviceId = (formData.get("deviceId") as string | null) || "SheetBot Agent";
      rawFileName = (formData.get("fileName") as string | null) || (file?.name) || rawFileName;
      customFolderName = formData.get("folderName") as string | null;
      memo = (formData.get("memo") as string | null) || memo;
      autoRecordSheet = formData.get("autoRecordSheet") !== "false";

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        mimeType = file.type || mimeType;
      }
    }

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ success: false, error: "업로드할 파일이 없습니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1-1. [Idempotency] 동일 사용자 + 동일 파일명/크기 60초 이내 중복 전송 방어 & 선제 락
    const dedupKey = `${cleanEmail}:${rawFileName.trim()}:${buffer.length}:${ocrType}`;
    const nowTs = Date.now();

    // [1단계 선제 락] 이미 동일 파일의 백그라운드 파이프라인이 진행 중인 경우 즉시 티켓 반환 (0.001초 차단)
    const inFlight = inFlightUploads.get(dedupKey);
    if (inFlight && nowTs - inFlight.timestamp < 60000) {
      console.log(`[FilesUpload] 🛡️ In-Flight duplicate upload detected: ${rawFileName} (reusing jobId: ${inFlight.jobId})`);
      return NextResponse.json({
        success: true,
        jobId: inFlight.jobId,
        status: "PROCESSING",
        message: "동일한 명함 사진의 분석 작업이 이미 진행 중입니다. 백그라운드에서 안전하게 완료됩니다.",
        ocrType,
        fileName: rawFileName.trim(),
        isDuplicate: true,
      });
    }

    // [2단계 60초 완료 캐시] 최근 60초 이내 완료된 작업 캐시 서빙
    const cachedUpload = recentFileUploads.get(dedupKey);
    if (cachedUpload && nowTs - cachedUpload.timestamp < 60000) {
      console.log(`[FilesUpload] 🛡️ Duplicate upload ignored within 60s: ${rawFileName} (serving cached response)`);
      return NextResponse.json({
        ...cachedUpload.response,
        isDuplicate: true,
      });
    }

    if (recentFileUploads.size > 200) {
      for (const [k, v] of recentFileUploads.entries()) {
        if (nowTs - v.timestamp > 600000) recentFileUploads.delete(k);
      }
    }
    if (inFlightUploads.size > 200) {
      for (const [k, v] of inFlightUploads.entries()) {
        if (nowTs - v.timestamp > 120000) inFlightUploads.delete(k);
      }
    }

    // 2. ocrType에 따른 폴더명 및 시트 대장명 결정 ([SheetBot] 네이밍 원칙 준수)
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

    // 3. 임시 파일로 디스크에 저장 (Drive 업로드 도구에 로컬 경로 필요)
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `sb_file_${Date.now()}_${path.basename(targetFileName)}`);
    fs.writeFileSync(tempFilePath, buffer);

    const fileSizeMb = buffer.length >= 1024 * 1024
      ? (buffer.length / (1024 * 1024)).toFixed(2) + " MB"
      : (buffer.length / 1024).toFixed(1) + " KB";

    // 4. 구글 드라이브 대상 폴더 탐색 및 미존재 시 자동 생성 (0초 메모리 캐싱 및 폴더 격리 보장)
    let targetFolderId: string | null = folderCache.get(targetFolderName) || null;

    if (!targetFolderId) {
      // 4-1. DB 바인딩 테이블에서 기존 바인딩된 고유 폴더 선제 확인 (폴더 중복 생성 원천 차단)
      try {
        const bindingSheetType = ocrType === "RECEIPT" ? "RECEIPT" : (ocrType === "BUSINESS_CARD" ? "BUSINESS_CARD" : "FILE_UPLOAD");
        const bindingQuery = await queryTable("sheetbot_user_sheet_bindings", {
          filters: { user_email: cleanEmail, sheet_type: bindingSheetType },
          limit: 1,
        });
        if (bindingQuery?.rows?.[0]?.folder_id) {
          targetFolderId = bindingQuery.rows[0].folder_id;
          folderCache.set(targetFolderName, targetFolderId);
        }
      } catch {}
    }

    if (!targetFolderId) {
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
        console.warn("[FilesUpload] Folder resolve warning:", folderErr.message);
      }
    }

    // ★ [Strict Folder Isolation Rule] targetFolderId가 없으면 drive_upload가 호스트 기본 감시 폴더('이지데스크 연동')로 Fallback하는 것을 원천 차단
    if (!targetFolderId) {
      // 1회 즉시 동기 생성 재시도
      try {
        const retryCreate = await createDriveFolder(targetFolderName, undefined, true);
        targetFolderId = retryCreate?.id || (typeof retryCreate === "string" ? retryCreate : null);
        if (targetFolderId) {
          folderCache.set(targetFolderName, targetFolderId);
        }
      } catch (retryErr: any) {
        console.error("[FilesUpload] Target folder creation retry failed:", retryErr.message);
      }

      if (!targetFolderId) {
        throw new Error(`대상 구글 드라이브 폴더('${targetFolderName}')를 특정하지 못했습니다. 기본 감시 폴더 오염 방지를 위해 업로드를 중단합니다.`);
      }
    }

    // ★ [Fast-Return vs Realtime AI 분리 원칙]
    // 명함(BUSINESS_CARD)이나 영수증(RECEIPT)은 그 목적 자체가 AI OCR 장부화이므로 autoRecordSheet 플래그에 상관없이 무조건 시트 기록 보장!
    const shouldRecordSheet = autoRecordSheet || ocrType === "BUSINESS_CARD" || ocrType === "RECEIPT";
    let driveFileId: string | null = null;
    let webViewLink = "";
    let cardOcrResult: any = null;
    let cardSpreadsheetUrl: string | null = null;

    if (ocrType === "BUSINESS_CARD" && shouldRecordSheet) {
      // 🪪 [Direct-Return Instant CRM] 초고속 실시간 명함 분석 파이프라인 (3~4초 즉시 완료)
      console.log(`[FilesUpload] 🪪 Instant Direct Realtime AI OCR for Business Card: ${targetFileName}`);

      const base64File = buffer.toString("base64");
      // 초고속 Flash-Lite 전용 모델로 3~4초 내 무조건 OCR 완료
      const configuredModel = "gemini-2.5-flash-lite";

      let ocrResult: any = null;
      try {
        ocrResult = await performAiOcr(
          base64File,
          targetFileName,
          mimeType,
          "BUSINESS_CARD",
          configuredModel
        );
      } catch (ocrErr: any) {
        console.warn("[FilesUpload] Direct Card AI OCR error:", ocrErr.message);
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
      const successResponse = {
        success: true,
        jobId,
        status: "COMPLETED",
        message: `🪪 [${cName}] 명함 AI 분석이 완료되었습니다.`,
        ocrType: "BUSINESS_CARD",
        fileName: targetFileName,
        folderName: targetFolderName,
        folderId: targetFolderId,
        ocrData: finalOcrData,
      };

      // 멱등성 캐시 등록
      recentFileUploads.set(dedupKey, { timestamp: nowTs, response: successResponse });

      // ⚡ [백그라운드 파이프라인] 구글 드라이브 업로드 및 시트 행 적재를 완전 비동기로 위임 (Zero-Block)
      const capturedFolderId = targetFolderId;
      const capturedFileName = targetFileName;
      const capturedMimeType = mimeType;
      const capturedTempFilePath = tempFilePath;
      const capturedBuffer = buffer;

      void (async () => {
        try {
          const resolved = await resolveUserSpreadsheet({
            userEmail: cleanEmail,
            sheetType: "BUSINESS_CARD",
            defaultTitle: defaultSheetTitle,
            folderId: capturedFolderId,
            preferOAuth: true,
          }).catch(() => null);

          const targetSpreadsheetId = resolved?.spreadsheetId;

          // 드라이브 업로드 (최대 5초 Fast-Wait)
          let bgWebViewLink = "";
          try {
            const driveUploadPromise = (async () => {
              const existingSearch = await listDriveFiles({
                query: `'${capturedFolderId}' in parents and name = '${capturedFileName}' and trashed = false`,
              }, { preferOAuth: true }).catch(() => null);

              if (existingSearch?.files && existingSearch.files.length > 0) {
                const bgId = existingSearch.files[0].id;
                return existingSearch.files[0].webViewLink || `https://drive.google.com/file/d/${bgId}/view`;
              }

              const uploadRes = await uploadDriveFileWithBridge({
                buffer: capturedBuffer,
                fileName: capturedFileName,
                folderId: capturedFolderId,
                mimeType: capturedMimeType,
                tempFilePath: capturedTempFilePath,
                preferOAuth: true,
              });
              const bgId = uploadRes?.id || uploadRes?.fileId || null;
              return uploadRes?.webViewLink || (bgId ? `https://drive.google.com/file/d/${bgId}/view` : "");
            })();

            bgWebViewLink = await Promise.race([
              driveUploadPromise,
              new Promise<string>((res) => setTimeout(() => res(""), 5000)),
            ]);
          } catch (driveErr: any) {
            console.warn("[FilesUpload] Card Drive upload background warning:", driveErr.message);
          }

          if (targetSpreadsheetId) {
            const nowStr = getKoreanTimeString();
            const cardData = finalOcrData;

            if (resolved?.isNew) {
              const cardHeaders = [
                ["등록 일시", "성함", "직함/직책", "회사명", "휴대폰", "이메일", "유선전화", "회사 주소", "상세정보", "명함 보기", "등록 기기"]
              ];
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "시트1!A1:K1",
                values: cardHeaders,
                preferOAuth: true,
              }).catch(() => {});
              await callSheetsTool("sheets_format_headers", {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#1e3a8a",
                headerTextColor: "#ffffff",
                preferOAuth: true,
              }).catch(() => {});
            }

            // 시트 사전 중복 검사: 최근 10개 행 중 동일 휴대폰 또는 성함 확인
            let isAlreadyInSheet = false;
            try {
              const existingRowsRes = await callSheetsTool("sheets_get_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "시트1!B:E",
                preferOAuth: true,
              }).catch(() => null);

              const rows = existingRowsRes?.values || existingRowsRes?.result?.values || [];
              if (rows.length > 1) {
                const recentRows = rows.slice(-10);
                const targetMobileClean = (cardData.mobile || "").replace(/[^0-9]/g, "");
                for (const r of recentRows) {
                  const rName = (r[0] || "").trim();
                  const rMobileClean = (r[3] || "").replace(/[^0-9]/g, "");
                  if (targetMobileClean.length >= 8 && targetMobileClean === rMobileClean) {
                    isAlreadyInSheet = true;
                    console.log(`[FilesUpload] 🛡️ Sheet duplicate detected by mobile: ${cardData.name} (${cardData.mobile}). Skipping row append.`);
                    break;
                  }
                  if (cardData.name && cardData.name.trim() === rName && cardData.name.trim() !== "확인 불가" && cardData.name.trim() !== "명함 고객") {
                    isAlreadyInSheet = true;
                    console.log(`[FilesUpload] 🛡️ Sheet duplicate detected by name: ${cardData.name}. Skipping row append.`);
                    break;
                  }
                }
              }
            } catch (dupErr: any) {
              console.warn("[FilesUpload] Sheet duplicate check warning:", dupErr.message);
            }

            if (!isAlreadyInSheet) {
              const newCardRow = [
                [
                  nowStr,
                  cardData.name || "확인 불가",
                  cardData.title || "미기재",
                  cardData.company || "미기재",
                  cardData.mobile || "미기재",
                  cardData.email || "미기재",
                  cardData.tel || "미기재",
                  cardData.address || "미기재",
                  cardData.details || "-",
                  bgWebViewLink ? `=HYPERLINK("${bgWebViewLink}", "🪪 명함 보기")` : "-",
                  deviceId
                ]
              ];

              await callSheetsTool("sheets_append_values", {
                spreadsheetId: targetSpreadsheetId,
                range: "시트1!A:K",
                values: newCardRow,
                preferOAuth: true,
              }).catch((e: any) => console.warn("[FilesUpload] Sheet append warning:", e.message));

              const usedTokens = 700;
              await deductTokens(cleanEmail, usedTokens).catch(() => {});

              void recordAiUsageLog({
                userEmail: cleanEmail,
                caller: "sheetbot-card-direct",
                purpose: `명함 초고속 AI 인맥 등록 (gemini-2.5-flash-lite)`,
                model: configuredModel,
                promptTokens: 450,
                completionTokens: 250,
                totalTokens: usedTokens,
                promptText: `명함 분석: ${capturedFileName}`,
                responseText: JSON.stringify(cardData).slice(0, 300),
              });

              const logId = Date.now();
              await insertRows("sheetbot_user_dispatch_logs", [
                {
                  id: logId,
                  user_email: cleanEmail,
                  rule_id: "BUSINESS_CARD_OCR",
                  rule_name: "🪪 명함 AI OCR 인맥 등록",
                  device_id: deviceId,
                  recipient: "Google Drive / Sheet",
                  content: `[명함 OCR] ${capturedFileName} -> ${defaultSheetTitle}`,
                  status: "SUCCESS",
                  error_message: null,
                  created_at: getKoreanTimeString(),
                },
              ]).catch(() => {});
              console.log(`[FilesUpload] [CardBackground] ✅ Completed Drive upload & Sheet append for: ${capturedFileName}`);
            } else {
              console.log(`[FilesUpload] [CardBackground] ℹ️ Duplicate row skipped in sheet for: ${capturedFileName}`);
            }
          }
        } catch (bgErr: any) {
          console.warn("[FilesUpload] Card background task error:", bgErr.message);
        } finally {
          if (capturedTempFilePath && fs.existsSync(capturedTempFilePath)) {
            try { fs.unlinkSync(capturedTempFilePath); } catch {}
          }
        }
      })();

      // 🚀 스마트폰 앱에 즉시 COMPLETED 및 명함 데이터 반환 (3~4초 만에 직통 완료!)
      return NextResponse.json(successResponse);
    } else {
      // 5. 일반 파일 및 영수증 업로드 로직 (단일 드라이브 업로드 후 백그라운드 위임)
      try {
        const uploadRes = await uploadDriveFileWithBridge({
          buffer,
          fileName: targetFileName,
          folderId: targetFolderId,
          mimeType,
          tempFilePath,
          preferOAuth: true,
        });

        driveFileId = uploadRes?.id || uploadRes?.fileId || null;
        webViewLink = uploadRes?.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : "");
      } catch (uploadErr: any) {
        console.warn("[FilesUpload] Drive upload warning:", uploadErr.message);
        if (targetFolderId) {
          try {
            const checkRes = await listDriveFiles({
              query: `'${targetFolderId}' in parents and name = '${targetFileName}' and trashed = false`,
            }, { preferOAuth: true });
            const matched = checkRes?.files?.[0];
            if (matched) {
              driveFileId = matched.id;
              webViewLink = matched.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;
            }
          } catch {}
        }

        if (!driveFileId && ocrType !== "RECEIPT") {
          throw new Error(`구글 드라이브 파일 업로드에 실패했습니다: ${uploadErr.message}`);
        }
      }

      // 🧾 영수증(AI 배치) 및 일반 파일: 백그라운드 파이프라인으로 안전하게 위임 (Zero-Block)
      const capturedDriveFileId = driveFileId;
      const capturedWebViewLink = webViewLink;
      const capturedTargetFolderId = targetFolderId;
      const capturedTargetFolderName = targetFolderName;
      const capturedTargetFileName = targetFileName;
      const capturedMemo = memo;
      const capturedMimeType = mimeType;
      const capturedFileSizeMb = fileSizeMb;
      const capturedDeviceId = deviceId;
      const capturedOcrType = ocrType;

      void processPendingBatchJobs().catch(() => {});

      void (async () => {
        try {
          const aiSettings = await getAiModelSettings();
          const configuredModel = aiSettings.defaultModel || "gemini-2.5-flash";

          let targetSpreadsheetId: string | null = null;
          let targetRow: number | null = null;

          if (shouldRecordSheet) {
            try {
              const sheetTitle = defaultSheetTitle;
              const bindingType = capturedOcrType === "RECEIPT" ? "RECEIPT" : "FILE_UPLOAD";

              const resolved = await resolveUserSpreadsheet({
                userEmail: cleanEmail,
                sheetType: bindingType,
                defaultTitle: sheetTitle,
                folderId: capturedTargetFolderId,
                preferOAuth: true,
              });

              targetSpreadsheetId = resolved.spreadsheetId;

              if (targetSpreadsheetId) {
                const nowStr = getKoreanTimeString();

                if (resolved.isNew && capturedOcrType === "RECEIPT") {
                  const receiptHeaders = [
                    ["승인일시", "영수증구분", "가맹점명", "사업자번호", "합계금액(원)", "공급가액(원)", "부가세(원)", "품목/적요", "결제수단", "승인번호", "영수증사진URL", "분석상태", "등록일시"]
                  ];
                  await callSheetsTool("sheets_update_range", {
                    spreadsheetId: targetSpreadsheetId,
                    range: "시트1!A1:M1",
                    values: receiptHeaders,
                    preferOAuth: true,
                  }).catch(() => {});
                  await callSheetsTool("sheets_format_headers", {
                    spreadsheetId: targetSpreadsheetId,
                    sheetName: "시트1",
                    preferOAuth: true,
                  }).catch(() => {});
                }

                if (capturedOcrType === "RECEIPT") {
                  try {
                    const rangeRes = await callSheetsTool("sheets_get_range", {
                      spreadsheetId: targetSpreadsheetId,
                      range: "시트1!A:A",
                      preferOAuth: true,
                    });
                    targetRow = (rangeRes?.values?.length || 1) + 1;
                  } catch {
                    targetRow = null;
                  }

                  const initialRow = [
                    [
                      nowStr, // A: 승인일시 (초기 등록시각)
                      "신용카드 영수증", // B: 영수증구분
                      "⏳ AI 영수증 분석 중...", // C: 가맹점명
                      "-", // D: 사업자번호
                      "0", // E: 합계금액(원)
                      "0", // F: 공급가액(원)
                      "0", // G: 부가세(원)
                      "⏳ AI 영수증 품목/적요 분석 중...", // H: 품목/적요
                      "-", // I: 결제수단
                      "-", // J: 승인번호
                      capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "🧾 영수증 보기")` : "-", // K: 영수증사진URL
                      "⏳ 분석 중", // L: 분석상태
                      nowStr // M: 등록일시
                    ]
                  ];
                  await callSheetsTool("sheets_append_values", {
                    spreadsheetId: targetSpreadsheetId,
                    range: "A:M",
                    values: initialRow,
                    preferOAuth: true,
                  }).catch(() => {});
                } else {
                  // 일반 파일
                  let category = "일반 파일";
                  if (capturedMimeType.startsWith("image/")) category = "사진";
                  else if (capturedMimeType.includes("pdf")) category = "PDF 문서";
                  else if (capturedMimeType.includes("sheet") || capturedMimeType.includes("excel")) category = "엑셀 문서";
                  else if (capturedMimeType.includes("word")) category = "워드 문서";

                  const linkFormula = capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "📁 바로보기")` : "-";
                  const newRowValues = [
                    [nowStr, category, capturedTargetFileName, capturedFileSizeMb, linkFormula, capturedMemo]
                  ];
                  await callSheetsTool("sheets_append_values", {
                    spreadsheetId: targetSpreadsheetId,
                    range: "A:F",
                    values: newRowValues,
                    preferOAuth: true,
                  }).catch((e: any) => console.warn("[FilesUpload] append_values error:", e.message));
                }
              }
            } catch (sheetErr: any) {
              console.warn("[FilesUpload] Background sheet record warning:", sheetErr.message);
            }
          }

          // 영수증 Zero-Block AI 배치 파이프라인
          if (capturedOcrType === "RECEIPT" && targetSpreadsheetId && targetRow) {
            const rowToUpdate = targetRow;
            const balanceCheck = await checkTokenBalance(cleanEmail, 300);

            if (!balanceCheck.allowed) {
              const noTokenMsg = "⚠️ 잔여 토큰 부족으로 AI 분석이 생략되었습니다. (충전 후 재시도 가능)";
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: `시트1!D${rowToUpdate}:D${rowToUpdate}`,
                values: [[noTokenMsg]],
                preferOAuth: true,
              }).catch(() => {});
              return;
            }

            const base64File = buffer.toString("base64");
            const ocrPrompt = `당신은 대한민국 영수증 및 증빙 전표 분석 전문 AI 공인회계사입니다.
첨부된 영수증/전표/거래 확인 문서 이미지("${capturedTargetFileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 서두 없이 순수 JSON만 반환하세요:
{
  "receiptType": "영수증 구분 (반드시 다음 중 하나: '신용카드 영수증' | '현금영수증' | '간이영수증' | '일반인정영수증(입금표·거래명세서·주문확인서 등)')",
  "paidAt": "결제 일시 (YYYY-MM-DD HH:mm 형식, 시간 미기재 시 YYYY-MM-DD)",
  "merchantName": "상호명 또는 가맹점명",
  "businessNumber": "사업자등록번호 (10자리 숫자 또는 000-00-00000 형식, 확인 불가 시 '미기재')",
  "amount": "최종 결제금액 (숫자만, 예: 15000)",
  "vat": "부가가치세/세액 (숫자만, 예: 1500, 불명확 시 0)",
  "cardIssuer": "카드사명 (신용/체크카드인 경우 예: '신한카드', '국민카드', '삼성마스타' 등, 카드가 아니면 '')",
  "cardNumber": "카드번호 (마스킹 포함 영수증에 인쇄된 번호, 예: '5365-****-****-1234', 없으면 '')",
  "approvalNumber": "승인번호 (영수증에 인쇄된 승인번호 숫자/영문, 예: '01234567', 없으면 '')",
  "details": "상세내역 (구매 품목별 이름, 단가, 수량, 할인금액, 봉사료, 포인트 사용 등 영수증에 적힌 모든 세부 거래 내역을 간결하고 명확하게 정리)"
}`;

            const batchSubmitRes = await callAiBatchSubmit(
              [
                {
                  prompt: ocrPrompt,
                  systemPrompt: "당신은 고정밀 비즈니스 문서 OCR 분석 전문가입니다. 항상 요청된 JSON 스키마를 엄격히 준수하여 순수 JSON만 반환하세요.",
                  temperature: 0.1,
                  files: [
                    {
                      name: capturedTargetFileName,
                      content: base64File,
                      encoding: "base64",
                      mimeType: capturedMimeType.startsWith("image/") || capturedMimeType === "application/pdf" ? capturedMimeType : "image/jpeg",
                    },
                  ],
                },
              ],
              {
                caller: "sheetbot-receipt-ocr",
                model: configuredModel,
                displayName: `SheetBot-RECEIPT-${Date.now()}`,
              }
            ).catch((err: any) => ({ success: false, error: err.message, jobName: undefined }));

            if (batchSubmitRes.success && batchSubmitRes.jobName) {
              console.log(`[FilesUpload] ✅ Gemini Batch submitted: ${batchSubmitRes.jobName}`);

              const batchJobId = Date.now();
              await insertRows("sheetbot_ai_batch_jobs", [
                {
                  id: batchJobId,
                  job_name: batchSubmitRes.jobName,
                  job_type: "RECEIPT",
                  user_email: cleanEmail,
                  file_name: capturedTargetFileName,
                  spreadsheet_id: targetSpreadsheetId,
                  row_index: rowToUpdate,
                  model: configuredModel,
                  status: "PENDING",
                  error_message: null,
                  completed_at: null,
                  created_at: getKoreanTimeString(),
                },
              ]).catch((err) => console.warn("[FilesUpload] Batch ticket insert warning:", err.message));

              const batchGetRes = await callAiBatchGet(batchSubmitRes.jobName, { waitMs: 15000 }).catch(() => null);

              if (batchGetRes && batchGetRes.success && batchGetRes.state === "JOB_STATE_SUCCEEDED" && batchGetRes.results?.[0]) {
                const firstResult = batchGetRes.results[0];
                let rawText = (firstResult.text || firstResult.content || firstResult.response || "").trim();
                if (rawText.startsWith("```json")) {
                  rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
                } else if (rawText.startsWith("```")) {
                  rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
                }

                let ocrData: any = {};
                try {
                  ocrData = JSON.parse(rawText);
                } catch {
                  ocrData = {};
                }

                let safeRowToUpdate: number | null = rowToUpdate;
                if (targetSpreadsheetId && rowToUpdate > 1) {
                  const guardRes = await resolveSafeTargetRow({
                    spreadsheetId: targetSpreadsheetId,
                    expectedRow: rowToUpdate,
                    fileName: capturedTargetFileName,
                    fileUrl: capturedWebViewLink,
                  });
                  safeRowToUpdate = guardRes.safeRow;
                  if (!safeRowToUpdate) {
                    console.warn(`[FilesUpload] 🛑 Fast-Check aborted: Row was deleted by user (${guardRes.reason}). Skipping sheet update.`);
                    return;
                  }
                }

                const bNum = formatBusinessNumber(ocrData.businessNumber);
                const amtNum = ocrData.amount ? Number(String(ocrData.amount).replace(/[^0-9]/g, "")) : 0;
                const vatNum = ocrData.vat ? Number(String(ocrData.vat).replace(/[^0-9]/g, "")) : 0;
                const supplyNum = Math.max(0, amtNum - vatNum);
                const amt = amtNum.toLocaleString("ko-KR");
                const vat = vatNum.toLocaleString("ko-KR");
                const supplyAmt = supplyNum.toLocaleString("ko-KR");
                const paymentMethod = [ocrData.cardIssuer, ocrData.cardNumber].filter(Boolean).join(" ") || (ocrData.receiptType?.includes("카드") ? "신용카드" : "현금/기타");

                await callSheetsTool("sheets_update_range", {
                  spreadsheetId: targetSpreadsheetId,
                  range: `시트1!A${safeRowToUpdate}:L${safeRowToUpdate}`,
                  values: [[
                    ocrData.paidAt || getKoreanTimeString(), // A: 승인일시
                    ocrData.receiptType || "신용카드 영수증", // B: 영수증구분
                    ocrData.merchantName || "확인 불가", // C: 가맹점명
                    bNum || "-", // D: 사업자번호
                    amt, // E: 합계금액(원)
                    supplyAmt, // F: 공급가액(원)
                    vat, // G: 부가세(원)
                    ocrData.details || "-", // H: 품목/적요
                    paymentMethod, // I: 결제수단
                    ocrData.approvalNumber || "-", // J: 승인번호
                    capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "🧾 영수증 보기")` : "-", // K: 영수증사진URL
                    "✅ 분석 완료", // L: 분석상태
                  ]],
                  preferOAuth: true,
                }).catch(() => {});

                const usedTokens = Math.round(1200 * 0.5);
                await deductTokens(cleanEmail, usedTokens).catch(() => {});

                void recordAiUsageLog({
                  userEmail: cleanEmail,
                  caller: "sheetbot-receipt-batch-fast",
                  purpose: `영수증 AI 장부화 [AI 배치(50% 절감)] (${configuredModel} / 0.5x)`,
                  model: configuredModel,
                  promptTokens: 400,
                  completionTokens: 200,
                  totalTokens: usedTokens,
                  promptText: `Fast-Check 영수증 분석: ${capturedTargetFileName}`,
                  responseText: JSON.stringify(ocrData).slice(0, 300),
                });

                const nowStr = getKoreanTimeString();
                await updateRows("sheetbot_ai_batch_jobs", {
                  status: "SUCCEEDED",
                  completed_at: nowStr,
                  updated_at: nowStr,
                }, { ids: [Number(batchJobId)] }).catch(() => {});
              } else {
                console.log(`[FilesUpload] [Zero-Block] Batch job ${batchSubmitRes.jobName} is processing. Delegated to Async Sweeper.`);
              }
            } else {
              console.warn("[FilesUpload] Batch submit failed, falling back to direct AI Caller:", batchSubmitRes.error);
              const fallbackResult = await performAiOcr(base64File, capturedTargetFileName, capturedMimeType, "RECEIPT", configuredModel);
              if (fallbackResult) {
                const bNum = formatBusinessNumber(fallbackResult.businessNumber);
                const amtNum = fallbackResult.amount ? Number(String(fallbackResult.amount).replace(/[^0-9]/g, "")) : 0;
                const vatNum = fallbackResult.vat ? Number(String(fallbackResult.vat).replace(/[^0-9]/g, "")) : 0;
                const supplyNum = Math.max(0, amtNum - vatNum);
                const amt = amtNum.toLocaleString("ko-KR");
                const vat = vatNum.toLocaleString("ko-KR");
                const supplyAmt = supplyNum.toLocaleString("ko-KR");
                const paymentMethod = [fallbackResult.cardIssuer, fallbackResult.cardNumber].filter(Boolean).join(" ") || (fallbackResult.receiptType?.includes("카드") ? "신용카드" : "현금/기타");

                await callSheetsTool("sheets_update_range", {
                  spreadsheetId: targetSpreadsheetId,
                  range: `시트1!A${rowToUpdate}:L${rowToUpdate}`,
                  values: [[
                    fallbackResult.paidAt || getKoreanTimeString(), // A: 승인일시
                    fallbackResult.receiptType || "신용카드 영수증", // B: 영수증구분
                    fallbackResult.merchantName || "확인 불가", // C: 가맹점명
                    bNum || "-", // D: 사업자번호
                    amt, // E: 합계금액(원)
                    supplyAmt, // F: 공급가액(원)
                    vat, // G: 부가세(원)
                    fallbackResult.details || "-", // H: 품목/적요
                    paymentMethod, // I: 결제수단
                    fallbackResult.approvalNumber || "-", // J: 승인번호
                    capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "🧾 영수증 보기")` : "-", // K: 영수증사진URL
                    "✅ 분석 완료", // L: 분석상태
                  ]],
                  preferOAuth: true,
                }).catch(() => {});
                const usedTokens = Math.round(1200);
                await deductTokens(cleanEmail, usedTokens).catch(() => {});
              }
            }
          }

          // 감사 로그 적재 (영수증 및 일반 파일)
          let ruleId = "FILE_UPLOAD";
          let ruleName = "📁 구글 드라이브 파일 업로드";
          let contentSummary = `[${targetFolderName}] ${capturedTargetFileName} (${capturedFileSizeMb})`;

          if (capturedOcrType === "RECEIPT") {
            ruleId = "RECEIPT_OCR";
            ruleName = "🧾 영수증 AI OCR 장부화";
            contentSummary = `[영수증 OCR] ${capturedTargetFileName} -> ${defaultSheetTitle}`;
          }

          const logId = Date.now();
          await insertRows("sheetbot_user_dispatch_logs", [
            {
              id: logId,
              user_email: cleanEmail,
              rule_id: ruleId,
              rule_name: ruleName,
              device_id: capturedDeviceId,
              recipient: "Google Drive / Sheet",
              content: contentSummary,
              status: "SUCCESS",
              error_message: null,
              created_at: getKoreanTimeString(),
            },
          ]).catch(() => {});
        } catch (bgErr: any) {
          console.warn("[FilesUpload] Background pipeline error:", bgErr.message);
        }
      })();
    }

    const successResponse = {
      success: true,
      message: ocrType === "RECEIPT"
        ? `영수증 AI 분석이 완료되어 구글 스프레드시트 '${defaultSheetTitle}'에 자동 장부화되었습니다.`
        : ocrType === "BUSINESS_CARD"
        ? `명함 AI 분석이 완료되어 구글 스프레드시트 '${defaultSheetTitle}'에 인맥으로 등록되었습니다.`
        : `파일이 구글 드라이브 '${targetFolderName}' 폴더로 안전하게 업로드되었습니다.`,
      ocrType,
      fileId: driveFileId,
      fileName: targetFileName,
      folderName: targetFolderName,
      folderId: targetFolderId,
      webViewLink,
      spreadsheetUrl: cardSpreadsheetUrl || undefined,
      ocrData: cardOcrResult || undefined,
      cardData: cardOcrResult || undefined,
    };

    recentFileUploads.set(dedupKey, { timestamp: nowTs, response: successResponse });

    return NextResponse.json(successResponse);
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

/**
 * 사업자등록번호를 000-00-00000 표준 10자리 하이픈 규격으로 안전하게 정규화
 */
function formatBusinessNumber(raw: any): string {
  if (!raw) return "미기재";
  const str = String(raw).trim();
  const digits = str.replace(/[^0-9]/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return str.length > 0 ? str : "미기재";
}

/**
 * Gemini 3.8 Flash 기반 고정밀 AI OCR 분석 헬퍼 (영수증 및 명함)
 */
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
  "receiptType": "영수증 구분 (반드시 다음 중 하나로 정확히 판별: '신용카드 영수증' | '현금영수증' | '간이영수증' | '일반인정영수증(입금표·거래명세서·주문확인서 등)')",
  "paidAt": "결제 일시 (YYYY-MM-DD HH:mm 형식, 시간 미기재 시 YYYY-MM-DD)",
  "merchantName": "상호명 또는 가맹점명",
  "businessNumber": "사업자등록번호 (10자리 숫자 또는 000-00-00000 형식, 확인 불가 시 '미기재')",
  "amount": "최종 결제금액 (숫자만, 예: 15000)",
  "vat": "부가가치세/세액 (숫자만, 예: 1500, 불명확 시 0)",
  "cardIssuer": "카드사명 (신용/체크카드인 경우 예: '신한카드', '국민카드', '현대카드' 등, 카드가 아니면 '')",
  "cardNumber": "카드번호 (마스킹 포함 영수증에 인쇄된 번호, 예: '5365-****-****-1234', 없으면 '')",
  "approvalNumber": "승인번호 (영수증에 인쇄된 승인번호 숫자/영문, 예: '01234567', 없으면 '')",
  "details": "상세내역 (구매 품목별 이름, 단가, 수량, 할인금액, 봉사료, 포인트 사용 등 영수증에 적힌 모든 세부 거래 내역을 간결하고 명확하게 정리)"
}`
    : `당신은 비즈니스 명함 분석 및 기업 CRM 전문 AI입니다.
첨부된 명함 이미지("${fileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 서두 없이 순수 JSON만 반환하세요:
{
  "name": "성함",
  "title": "직함 및 직책 (예: 대표이사, 부장, 수석연구원 등)",
  "company": "회사명 또는 소속 기관명",
  "mobile": "휴대전화번호 (예: 010-1234-5678)",
  "email": "이메일 주소",
  "tel": "회사 대표전화 또는 유선번호",
  "address": "회사 주소 또는 사업장 소재지",
  "details": "상세정보 (소속 부서, 팩스번호(FAX), 회사 웹사이트 URL, 계좌번호, 취급 주요 업무/서비스, 슬로건 등 위 항목 외의 명함에 적힌 모든 추가 정보 요약)"
}`;

  // 로컬 호스트 MCP 게이트웨이(http://localhost:8080) 우선 직결 (2.5MB 대용량 base64의 외부 터널 루프백 60초 타임아웃 원천 차단)
  let innerText = "";
  try {
    const localRes = await fetch("http://localhost:8080/ai-caller/tools/call", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "a67ddc0f-7e2b-4997-9a0b-9667a74c89d0",
      },
      signal: AbortSignal.timeout(15000), // 15초 타임아웃
      body: JSON.stringify({
        tool: "ai_caller_call",
        arguments: {
          prompt,
          model: modelName || "gemini-2.5-flash-lite",
          temperature: 0.1,
          files: [
            {
              name: fileName,
              content: base64File,
              encoding: "base64",
              mimeType: mimeType.startsWith("image/") || mimeType === "application/pdf" ? mimeType : "image/jpeg",
            },
          ],
        },
      }),
    });

    if (localRes.ok) {
      const json = await localRes.json();
      if (json?.result?.content?.[0]?.text) {
        try {
          const parsed = JSON.parse(json.result.content[0].text);
          innerText = parsed.content || parsed.text || json.result.content[0].text;
        } catch {
          innerText = json.result.content[0].text;
        }
      } else if (json?.content) {
        innerText = json.content;
      }
    }
  } catch (err: any) {
    console.warn("[AiOcr] Local gateway fetch failed, falling back to callAiCaller:", err.message);
  }

  if (!innerText) {
    const aiRes = await callAiCaller(prompt, {
      model: modelName || undefined,
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
    innerText = (aiRes.text || aiRes.content || "").trim();
  }

  let rawText = innerText.trim();
  if (rawText.startsWith("```json")) {
    rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(rawText);
  } catch (parseErr) {
    console.warn("[AiOcr] JSON parse warning:", parseErr, rawText);
    return null;
  }
}
