export const dynamic = "force-dynamic";

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
import fs from "fs";
import path from "path";
import os from "os";

/**
 * 파일 업로드 15초 중복 수신 방지 캐시 (Idempotency) 및 폴더 ID 0초 메모리 캐시
 */
const recentFileUploads = new Map<string, { timestamp: number; response: any }>();
const folderCache = new Map<string, string>([
  ["[SheetBot] 통화 녹음", "14TuBcWsooWB7_yPqyn6L0imjshpVxFVX"],
  ["[SheetBot] 영수증 보관함", "1nrRbqE5XEnCVV1MJZ03pNntoj76t_uLV"],
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

    // 1-1. [Idempotency] 동일 사용자 + 동일 파일명/크기 15초 이내 중복 전송 방어
    const dedupKey = `${cleanEmail}:${rawFileName.trim()}:${buffer.length}:${ocrType}`;
    const nowTs = Date.now();
    const cachedUpload = recentFileUploads.get(dedupKey);
    if (cachedUpload && nowTs - cachedUpload.timestamp < 15000) {
      console.log(`[FilesUpload] Duplicate upload ignored within 15s: ${rawFileName} (serving cached response)`);
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

    // 5. 구글 드라이브로 파일 업로드 (원격/로컬 무손실 브릿지 전송)
    let driveFileId: string | null = null;
    let webViewLink = "";
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
      console.error("[FilesUpload] Drive upload failed:", uploadErr);
      throw new Error(`구글 드라이브 파일 업로드에 실패했습니다: ${uploadErr.message}`);
    }

    // ★ [Fast-Return 원칙] 구글 드라이브 파일 업로드 완료 즉시 스마트폰에 200 반환 (타임아웃 및 중복 업로드 원천 차단)
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

    // ★ [Zero-Block AI Batch 파이프라인] 백그라운드 즉시 수거 워커 트리거
    void processPendingBatchJobs().catch(() => {});

    // 백그라운드 AI OCR 분석 및 구글 시트 대장 기록, DB 감사 로그 파이프라인
    void (async () => {
      try {
        const aiSettings = await getAiModelSettings();
        const configuredModel = aiSettings.defaultModel || "gemini-2.5-flash";

        let targetSpreadsheetId: string | null = null;
        let targetRow: number | null = null;

        // 1. 구글 시트 대상 시트 확인 및 선행 즉시 행 등록 (0.1초 체감 UX)
        if (autoRecordSheet) {
          try {
            const sheetTitle = defaultSheetTitle;
            const bindingType = capturedOcrType === "RECEIPT"
              ? "RECEIPT"
              : (capturedOcrType === "BUSINESS_CARD" ? "BUSINESS_CARD" : "FILE_UPLOAD");

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

              // 신규 시트인 경우 표준 헤더 서식 자동 주입
              if (resolved.isNew) {
                if (capturedOcrType === "RECEIPT") {
                  const receiptHeaders = [
                    ["등록 일시", "구분", "결제 일시", "상호명", "사업자번호", "결제금액", "부가세", "카드사", "카드번호", "승인번호", "상세내역", "영수증 보기", "등록 기기"]
                  ];
                  await callSheetsTool("sheets_update_range", {
                    spreadsheetId: targetSpreadsheetId,
                    range: "시트1!A1:M1",
                    values: receiptHeaders,
                    preferOAuth: true,
                  }).catch(() => {});
                  await callSheetsTool("sheets_format_headers", {
                    spreadsheetId: targetSpreadsheetId,
                    tabName: "시트1",
                    headerBgColor: "#047857",
                    headerTextColor: "#ffffff",
                    preferOAuth: true,
                  }).catch(() => {});
                } else if (capturedOcrType === "BUSINESS_CARD") {
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
              }

              // 행 번호 계산
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

              // 선행 즉시 행 등록
              if (capturedOcrType === "RECEIPT") {
                const initialRow = [
                  [
                    nowStr,
                    "신용카드 영수증",
                    nowStr,
                    "⏳ AI 영수증 분석 중...",
                    "-",
                    "0",
                    "0",
                    "-",
                    "-",
                    "-",
                    "⏳ AI 영수증 상세 분석 중...",
                    capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "🧾 영수증 보기")` : "-",
                    capturedDeviceId
                  ]
                ];
                await callSheetsTool("sheets_append_values", {
                  spreadsheetId: targetSpreadsheetId,
                  range: "A:M",
                  values: initialRow,
                  preferOAuth: true,
                }).catch(() => {});
              } else if (capturedOcrType === "BUSINESS_CARD") {
                const initialRow = [
                  [
                    nowStr,
                    "⏳ AI 명함 분석 중...",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "-",
                    "⏳ AI 명함 상세 정보 분석 중...",
                    capturedWebViewLink ? `=HYPERLINK("${capturedWebViewLink}", "🪪 명함 보기")` : "-",
                    capturedDeviceId
                  ]
                ];
                await callSheetsTool("sheets_append_values", {
                  spreadsheetId: targetSpreadsheetId,
                  range: "A:K",
                  values: initialRow,
                  preferOAuth: true,
                }).catch(() => {});
              } else {
                // 일반 파일: 즉시 기입
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

        // 2-1. [초고속 실시간 AI 파이프라인] 명함 OCR (Instant CRM - 현장 즉시성 보장 / 3~5초 체감 UX)
        if (capturedOcrType === "BUSINESS_CARD" && targetSpreadsheetId && targetRow) {
          const rowToUpdate = targetRow;
          const balanceCheck = await checkTokenBalance(cleanEmail, 300);

          if (!balanceCheck.allowed) {
            const noTokenMsg = "⚠️ 잔여 토큰 부족으로 AI 분석이 생략되었습니다. (충전 후 재시도 가능)";
            await callSheetsTool("sheets_update_range", {
              spreadsheetId: targetSpreadsheetId,
              range: `시트1!B${rowToUpdate}:B${rowToUpdate}`,
              values: [[noTokenMsg]],
              preferOAuth: true,
            }).catch(() => {});
          } else {
            const base64File = buffer.toString("base64");
            const ocrResult = await performAiOcr(
              base64File,
              capturedTargetFileName,
              capturedMimeType,
              "BUSINESS_CARD",
              configuredModel
            );

            if (ocrResult) {
              // 🛡️ 지능형 행 핑거프린트 가드 (사용자가 처리 중 행을 임의 삭제/이동한 경우 오염 차단)
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
                  console.warn(`[FilesUpload] 🛑 Business Card OCR aborted: Row deleted by user (${guardRes.reason}).`);
                  return;
                }
              }

              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: `시트1!B${safeRowToUpdate}:I${safeRowToUpdate}`,
                values: [[
                  ocrResult.name || "확인 불가",
                  ocrResult.title || "미기재",
                  ocrResult.company || "미기재",
                  ocrResult.mobile || "미기재",
                  ocrResult.email || "미기재",
                  ocrResult.tel || "미기재",
                  ocrResult.address || "미기재",
                  ocrResult.details || "-",
                ]],
                preferOAuth: true,
              }).catch(() => {});

              const usedTokens = 700;
              await deductTokens(cleanEmail, usedTokens).catch(() => {});

              void recordAiUsageLog({
                userEmail: cleanEmail,
                caller: "sheetbot-card-realtime",
                purpose: `명함 실시간 AI 인맥 등록 [초고속 실시간] (${configuredModel})`,
                model: configuredModel,
                promptTokens: 450,
                completionTokens: 250,
                totalTokens: usedTokens,
                promptText: `실시간 명함 분석: ${capturedTargetFileName}`,
                responseText: JSON.stringify(ocrResult).slice(0, 300),
              });
              console.log(`[FilesUpload] ✅ Realtime Business Card OCR completed for row ${safeRowToUpdate}`);
            }
          }
        }

        // 2-2. [Zero-Block AI Batch 파이프라인] 영수증 OCR (대량 결산 적재 - 50% 토큰 절감 + 15초 Fast-Check + Async Sweeper)
        else if (capturedOcrType === "RECEIPT" && targetSpreadsheetId && targetRow) {
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

          // Gemini Batch 제출 (50% 반값 절감)
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

            // 영구 PENDING 티켓 DB 적재
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

            // [15초 Fast-Check]: 초단기 완료건 즉시 셀 반영
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

              // 🛡️ 지능형 행 핑거프린트 가드 (사용자가 15초 내에 행을 삭제/이동한 경우 오염 차단)
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
              const amt = ocrData.amount ? Number(String(ocrData.amount).replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : "0";
              const vat = ocrData.vat ? Number(String(ocrData.vat).replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : "0";

              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: `시트1!B${safeRowToUpdate}:K${safeRowToUpdate}`,
                values: [[
                  ocrData.receiptType || "신용카드 영수증",
                  ocrData.paidAt || getKoreanTimeString(),
                  ocrData.merchantName || "확인 불가",
                  bNum,
                  amt,
                  vat,
                  ocrData.cardIssuer || "-",
                  ocrData.cardNumber || "-",
                  ocrData.approvalNumber || "-",
                  ocrData.details || "-",
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
            // Fallback: 배치 제출 실패 시 실시간 AI Caller 호출 안전망
            console.warn("[FilesUpload] Batch submit failed, falling back to direct AI Caller:", batchSubmitRes.error);
            const fallbackResult = await performAiOcr(base64File, capturedTargetFileName, capturedMimeType, "RECEIPT", configuredModel);
            if (fallbackResult) {
              const bNum = formatBusinessNumber(fallbackResult.businessNumber);
              const amt = fallbackResult.amount ? Number(String(fallbackResult.amount).replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : "0";
              const vat = fallbackResult.vat ? Number(String(fallbackResult.vat).replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : "0";
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: `시트1!B${rowToUpdate}:K${rowToUpdate}`,
                values: [[
                  fallbackResult.receiptType || "신용카드 영수증",
                  fallbackResult.paidAt || getKoreanTimeString(),
                  fallbackResult.merchantName || "확인 불가",
                  bNum,
                  amt,
                  vat,
                  fallbackResult.cardIssuer || "-",
                  fallbackResult.cardNumber || "-",
                  fallbackResult.approvalNumber || "-",
                  fallbackResult.details || "-",
                ]],
                preferOAuth: true,
              }).catch(() => {});
              const usedTokens = Math.round(1200);
              await deductTokens(cleanEmail, usedTokens).catch(() => {});
            }
          }
        }

        // 3. 감사 로그 적재
        let ruleId = "FILE_UPLOAD";
        let ruleName = "📁 구글 드라이브 파일 업로드";
        let contentSummary = `[${targetFolderName}] ${capturedTargetFileName} (${capturedFileSizeMb})`;

        if (capturedOcrType === "RECEIPT") {
          ruleId = "RECEIPT_OCR";
          ruleName = "🧾 영수증 AI OCR 장부화";
          contentSummary = `[영수증 OCR] ${capturedTargetFileName} -> ${defaultSheetTitle}`;
        } else if (capturedOcrType === "BUSINESS_CARD") {
          ruleId = "BUSINESS_CARD_OCR";
          ruleName = "🪪 명함 AI OCR 인맥 등록";
          contentSummary = `[명함 OCR] ${capturedTargetFileName} -> ${defaultSheetTitle}`;
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

  let rawText = (aiRes.text || aiRes.content || "").trim();
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
