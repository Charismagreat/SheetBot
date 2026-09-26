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
import fs from "fs";
import path from "path";
import os from "os";

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

    // 1. 유저 식별 (세션, 헤더, 폼데이터 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bodyEmail = formData.get("userEmail") as string | null;
    const ocrType = ((formData.get("ocrType") as string | null) || "GENERIC").toUpperCase().trim();
    const deviceId = (formData.get("deviceId") as string | null) || "SheetBot Agent";
    const rawFileName = (formData.get("fileName") as string | null) || (file?.name) || "업로드_파일";
    const customFolderName = formData.get("folderName") as string | null;
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

    // 6. AI OCR 분석 실행 (영수증 또는 명함인 경우 Gemini 3.8 Flash 파일 분석)
    let ocrResultData: any = null;
    if (ocrType === "RECEIPT" || ocrType === "BUSINESS_CARD") {
      try {
        const base64File = buffer.toString("base64");
        ocrResultData = await performAiOcr(base64File, targetFileName, mimeType, ocrType);
      } catch (ocrErr: any) {
        console.warn(`[FilesUpload] AI OCR analysis warning (${ocrType}):`, ocrErr.message);
      }
    }

    // 7. 구글 시트 대장 자동 생성 및 행 기록 (autoRecordSheet == true)
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      try {
        const sheetTitle = defaultSheetTitle;
        let targetSpreadsheetId: string | null = null;

        // 7-1. 해당 폴더 내 대장 시트 파일 검색
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
          // 7-2. 대장 시트 신규 생성
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

            // 헤더 및 테마 서식 기입
            if (ocrType === "RECEIPT") {
              // 영수증 헤더 (9열)
              const headers = [
                ["결제일시", "상호명 (가맹점)", "사업자등록번호", "결제금액 (원)", "부가세 (원)", "결제수단", "주요 품목 요약", "영수증 원본 링크", "등록 기기"]
              ];
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:I1",
                values: headers,
                preferOAuth: true,
              }).catch(() => {});

              await callSheetsTool("sheets_format_headers", {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#065f46", // 에메랄드 테마
                headerTextColor: "#ffffff",
                preferOAuth: true,
              }).catch(() => {});
            } else if (ocrType === "BUSINESS_CARD") {
              // 명함 헤더 (10열)
              const headers = [
                ["등록일시", "성함", "직함", "회사명 / 소속", "휴대전화", "이메일", "회사전화", "회사주소", "명함 원본 링크", "등록 기기"]
              ];
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:J1",
                values: headers,
                preferOAuth: true,
              }).catch(() => {});

              await callSheetsTool("sheets_format_headers", {
                spreadsheetId: targetSpreadsheetId,
                tabName: "시트1",
                headerBgColor: "#1e3a8a", // 네이비 블루 테마
                headerTextColor: "#ffffff",
                preferOAuth: true,
              }).catch(() => {});
            } else {
              // 일반 파일 헤더 (6열)
              const headers = [
                ["업로드 일시", "파일명", "파일 종류", "파일 크기", "출처 / 메모", "구글 드라이브 바로보기 링크"]
              ];
              await callSheetsTool("sheets_update_range", {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:F1",
                values: headers,
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
          }
        }

        // 7-3. 시트에 신규 기록 행 추가
        if (targetSpreadsheetId) {
          const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);

          if (ocrType === "RECEIPT") {
            const data = ocrResultData || {};
            const newRowValues = [
              [
                data.paidAt || nowStr,
                data.merchantName || "확인 불가",
                data.businessNumber || "미기재",
                data.amount || "0",
                data.vat || "0",
                data.paymentMethod || "신용카드",
                data.itemsSummary || targetFileName,
                webViewLink,
                deviceId
              ]
            ];
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "A:I",
              values: newRowValues,
              preferOAuth: true,
            }).catch((err: any) => console.warn("[FilesUpload] append_values (RECEIPT) warning:", err.message));
          } else if (ocrType === "BUSINESS_CARD") {
            const data = ocrResultData || {};
            const newRowValues = [
              [
                nowStr,
                data.name || "확인 불가",
                data.title || "미기재",
                data.company || "미기재",
                data.mobile || "미기재",
                data.email || "미기재",
                data.tel || "미기재",
                data.address || "미기재",
                webViewLink,
                deviceId
              ]
            ];
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "A:J",
              values: newRowValues,
              preferOAuth: true,
            }).catch((err: any) => console.warn("[FilesUpload] append_values (BUSINESS_CARD) warning:", err.message));
          } else {
            const newRowValues = [
              [nowStr, targetFileName, mimeType, fileSizeMb, memo, webViewLink]
            ];
            await callSheetsTool("sheets_append_values", {
              spreadsheetId: targetSpreadsheetId,
              range: "A:F",
              values: newRowValues,
              preferOAuth: true,
            }).catch((err: any) => console.warn("[FilesUpload] append_values (GENERIC) warning:", err.message));
          }
        }
      } catch (sheetErr: any) {
        console.warn("[FilesUpload] Sheet auto-record warning:", sheetErr.message);
      }
    }

    // 8. 감사 대장 DB 적재 (SQLite INTEGER id 규격 준수)
    const logId = Date.now();
    let ruleId = "FILE_UPLOAD";
    let ruleName = "📁 사진/파일 구글 드라이브 백업";
    let contentSummary = `[파일 업로드] ${targetFileName} (${fileSizeMb}) -> ${targetFolderName}`;

    if (ocrType === "RECEIPT") {
      ruleId = "RECEIPT_OCR";
      ruleName = "🧾 영수증 AI OCR 장부화";
      const mName = ocrResultData?.merchantName || "영수증";
      const amt = ocrResultData?.amount ? `${Number(ocrResultData.amount).toLocaleString()}원` : "";
      contentSummary = `[영수증 OCR] ${mName} ${amt} -> ${defaultSheetTitle}`;
    } else if (ocrType === "BUSINESS_CARD") {
      ruleId = "BUSINESS_CARD_OCR";
      ruleName = "🪪 명함 AI OCR 인맥 대장화";
      const cName = ocrResultData?.name || "명함";
      const comp = ocrResultData?.company ? `(${ocrResultData.company})` : "";
      contentSummary = `[명함 OCR] ${cName} ${comp} -> ${defaultSheetTitle}`;
    }

    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: ruleId,
        rule_name: ruleName,
        device_id: deviceId,
        recipient: "Google Drive / Sheet",
        content: contentSummary,
        status: "SUCCESS",
        error_message: null,
        created_at: new Date().toISOString(),
      },
    ]).catch((err) => console.warn("[FilesUpload] DB log insert warning:", err.message));

    return NextResponse.json({
      success: true,
      message: ocrType === "RECEIPT"
        ? `영수증 AI 분석이 완료되어 구글 스프레드시트 '${defaultSheetTitle}'에 자동 장부화되었습니다.`
        : ocrType === "BUSINESS_CARD"
        ? `명함 AI 분석이 완료되어 구글 스프레드시트 '${defaultSheetTitle}'에 인맥으로 등록되었습니다.`
        : `파일이 구글 드라이브 '${targetFolderName}' 폴더로 안전하게 업로드되었습니다.`,
      ocrType,
      ocrData: ocrResultData,
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

/**
 * Gemini 3.8 Flash 기반 고정밀 AI OCR 분석 헬퍼 (영수증 및 명함)
 */
async function performAiOcr(
  base64File: string,
  fileName: string,
  mimeType: string,
  ocrType: "RECEIPT" | "BUSINESS_CARD"
): Promise<any> {
  const prompt = ocrType === "RECEIPT"
    ? `당신은 대한민국 영수증 및 결제 전표 분석 전문 AI 회계사입니다.
첨부된 영수증/전표 이미지("${fileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 기타 설명 없이 순수 JSON만 반환하세요:
{
  "paidAt": "YYYY-MM-DD HH:mm (확인 불가 시 결제일자 YYYY-MM-DD 또는 오늘일자)",
  "merchantName": "상호명 / 가맹점명",
  "businessNumber": "사업자등록번호 (예: 123-45-67890, 미기재 시 '미기재')",
  "amount": "결제금액 (숫자만, 예: 15000)",
  "vat": "부가가치세 (숫자만, 예: 1500, 불명확 시 0 또는 결제금액의 10% 역산)",
  "paymentMethod": "결제수단 (신용카드, 체크카드, 현금, 간편결제 등)",
  "itemsSummary": "구매 품목 및 수량 요약 (예: 아메리카노 2잔, 샌드위치 1개)"
}`
    : `당신은 비즈니스 명함 분석 및 인맥 관리 전문 AI입니다.
첨부된 명함 이미지("${fileName}")를 정밀 분석하여 다음 JSON 포맷으로만 답변하세요. 마크다운 따옴표나 기타 설명 없이 순수 JSON만 반환하세요:
{
  "name": "성함",
  "title": "직함 및 직책, 부서 (예: 대표이사, 팀장 등)",
  "company": "회사명 또는 소속 기관명",
  "mobile": "휴대전화번호 (예: 010-1234-5678)",
  "email": "이메일 주소",
  "tel": "회사 대표전화 또는 유선번호",
  "address": "회사 주소 또는 사업장 소재지"
}`;

  const aiRes = await callAiCaller(prompt, {
    model: "gemini-3.8-flash",
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
