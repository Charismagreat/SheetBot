export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callSheetsTool,
  callDriveTool,
  listDriveFiles,
  insertRows,
  queryTable,
} from "@/lib/egdesk-helpers";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { maskPhoneNumber, formatZeroRetentionContent } from "@/lib/privacy";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { parseBankDepositSms } from "@/lib/bank-sms-parser";
import { recordPaymentToGoogleSheet } from "@/lib/payment-sheet-sync";
import { findMatchingSmartOrder, generateReceiptSmsText } from "@/lib/smart-order-match";
import { getKoreanTimeString } from "@/lib/date-utils";
import { extractAndCreateTasksFromMessage } from "@/lib/task-hub-helper";
import {
  analyzeMediaWithAi,
  formatKakaoMediaMessage,
  getKakaoMediaUserSettings,
  inferKakaoMediaTypeLabel,
  inspectMediaForQuickSummary,
  type QuickAnalysisResult,
} from "@/lib/kakao-media-analyzer";

// 15초 이내 동일 SMS 송수신 중복 기록 방어 캐시 (키: userEmail:direction:phoneNumber:message, 값: timestamp)
const recentSmsDedupeCache = new Map<string, number>();
// 동일 본문 기준 2차 중복 방어 캐시 (단말기 이중 감시로 인한 번호 왜곡 중복 방지)
const recentSmsBodyCache = new Map<string, { time: number; phone: string }>();
// 사용자별 문자 첨부파일 구글 드라이브 폴더 ID 캐시
const smsAttachmentFolderCache = new Map<string, string>();

interface IncomingSmsAttachment {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

const SMS_ATTACHMENT_FOLDER_NAME = "[SheetBot] 문자 첨부파일";

async function resolveSmsAttachmentFolderId(
  cleanEmail: string,
  callOptions: any
): Promise<string | null> {
  const cacheKey = `${callOptions?.visitorSessionId || cleanEmail}:${SMS_ATTACHMENT_FOLDER_NAME}`;
  const cached = smsAttachmentFolderCache.get(cacheKey);
  if (cached) return cached;

  // 1. DB 바인딩 테이블 선제 조회 (0초 타겟팅)
  try {
    const bindingQuery = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: "SMS_ATTACHMENT" },
      limit: 1,
    });
    const foundFolderId = bindingQuery?.rows?.[0]?.folder_id;
    if (foundFolderId && typeof foundFolderId === "string") {
      smsAttachmentFolderCache.set(cacheKey, foundFolderId);
      return foundFolderId;
    }
  } catch {}

  let targetFolderId: string | null = null;
  try {
    const folderSearch = await listDriveFiles(
      {
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${SMS_ATTACHMENT_FOLDER_NAME}' and trashed = false`,
      },
      { preferOAuth: true, ...callOptions }
    ).catch(() => null);

    const existing = folderSearch?.files?.[0]?.id;
    if (existing) {
      targetFolderId = String(existing);
    }

    if (!targetFolderId) {
      const created: any = await callDriveTool(
        "drive_create_folder",
        { name: SMS_ATTACHMENT_FOLDER_NAME, preferOAuth: true },
        callOptions
      ).catch(() => null);

      if (created && typeof created === "object") {
        targetFolderId =
          created.id ||
          created.folderId ||
          (() => {
            const rawText = created?.result?.content?.[0]?.text || created?.content?.[0]?.text;
            if (rawText) {
              try {
                const parsed = JSON.parse(rawText);
                return parsed?.id || parsed?.folderId || null;
              } catch {}
            }
            return null;
          })();
      } else if (typeof created === "string" && created.trim()) {
        try {
          const parsed = JSON.parse(created);
          targetFolderId = parsed?.id || parsed?.folderId || null;
        } catch {
          targetFolderId = created.trim();
        }
      }
    }

    if (targetFolderId) {
      smsAttachmentFolderCache.set(cacheKey, targetFolderId);
      try {
        await insertRows("sheetbot_user_sheet_bindings", [
          {
            user_email: cleanEmail,
            sheet_type: "SMS_ATTACHMENT",
            sheet_title: SMS_ATTACHMENT_FOLDER_NAME,
            spreadsheet_id: "",
            spreadsheet_url: "",
            folder_id: targetFolderId,
            folder_name: SMS_ATTACHMENT_FOLDER_NAME,
            created_at: getKoreanTimeString(),
            updated_at: getKoreanTimeString(),
          },
        ]);
      } catch {}
      return targetFolderId;
    }
  } catch (err: any) {
    console.warn("[SmsSync] Attachment folder resolve warning:", err?.message);
  }
  return null;
}

interface AnalyzedSmsAttachment {
  att: IncomingSmsAttachment;
  safeFileName: string;
  ext: string;
  fileHash: string;
  mediaTypeLabel: string;
  mediaIndex: number;
  mediaTotal: number;
  quickAnalysis: QuickAnalysisResult;
  initialLine: string;
  webViewLink: string;
}

/** 안드로이드 앱 등에서 본문이 비어있을 때 자동 채우는 기본 안내 문구인지 판별 */
function isPlaceholderAttachmentMessage(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return true;
  return /^\[첨부파일:\s*[^\]]+\]$/.test(trimmed);
}

/** 실제 문자 본문을 보존하면서 아래 줄에 첨부파일 요약 라인을 덧붙임 */
function buildCombinedSmsMessage(baseText: string, attachmentLines: string[]): string {
  const cleanBase = baseText.trim();
  const cleanLines = attachmentLines.map((l) => l.trim()).filter(Boolean);
  if (cleanBase && cleanLines.length > 0) {
    return `${cleanBase}\n${cleanLines.join("\n")}`;
  }
  if (cleanLines.length > 0) {
    return cleanLines.join("\n");
  }
  return cleanBase;
}

/** KST 날짜 문자열(YYYY-MM-DD HH:MM:SS)을 밀리초 타임스탬프로 안전 파싱 */
function parseKoreanTimeMs(str: string): number | null {
  const m = String(str || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}+09:00`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * 요약된 문자 MMS 첨부파일 내용에서 업무 할 일(견적서/발주서/계약서/입금요청 등)을 자동 추출해 할 일 허브에 등록합니다.
 */
async function maybeExtractTaskFromSmsAttachmentSummary(params: {
  cleanEmail: string;
  displayName: string;
  phoneNumber: string;
  fileName: string;
  summary: string;
  webViewLink: string;
  timestamp: string;
  fileHash: string;
}) {
  try {
    if (!params.summary || params.summary.trim().length < 8) return;
    const messageForTask = [
      `[문자 첨부파일: ${params.fileName}]`,
      params.summary.trim(),
      params.webViewLink ? `(원본 파일: ${params.webViewLink})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    await extractAndCreateTasksFromMessage({
      userEmail: params.cleanEmail,
      sourceType: "SMS",
      contactName: params.displayName !== "미등록 연락처" ? params.displayName : undefined,
      contactPhone: params.phoneNumber !== "-" ? params.phoneNumber : undefined,
      message: messageForTask,
      timestamp: params.timestamp,
      sourceId: `sms_att_${params.fileHash.slice(0, 16)}`,
      deepLink: params.webViewLink || undefined,
    });
  } catch (err: any) {
    console.warn("[SmsSync] 첨부파일 할 일 허브 자동 연계 경고:", err?.message || err);
  }
}

/**
 * 2단계(비동기 백그라운드) AI 요약 완료 후, 핑거프린트 행 검증(G열 파일링크 / 분석 중 표식)을 거쳐
 * 구글 시트 '[SheetBot] 스마트폰 문자(SMS) 송수신 대장'의 E열(메시지 내용)만 안전하게 갱신합니다.
 * - 사용자가 해당 행을 이미 삭제한 경우 시트 쓰기를 중단(Abort)하여 다른 행 오염을 원천 차단합니다.
 */
async function updateSmsSheetRowMessageSummary(params: {
  cleanEmail: string;
  spreadsheetId: string;
  callOptions: any;
  targetLinks: string[];
  phoneNumber: string;
  initialMessage: string;
  finalMessage: string;
}): Promise<boolean> {
  try {
    const sheetData = await callSheetsTool(
      "sheets_get_range",
      {
        spreadsheetId: params.spreadsheetId,
        range: "A1:G5000",
        preferOAuth: true,
      },
      params.callOptions
    ).catch(() => null);

    const rows: string[][] = Array.isArray(sheetData?.values) ? sheetData.values : [];
    const linksToMatch = params.targetLinks.map((l) => l.trim()).filter(Boolean);

    let matchedRowIdx = -1;
    for (let i = rows.length - 1; i >= 1; i--) {
      const rowPhone = String(rows[i]?.[3] ?? "").trim();
      const rowContent = String(rows[i]?.[4] ?? "").trim();
      const rowLinks = String(rows[i]?.[6] ?? "").trim();

      if (linksToMatch.length > 0 && rowLinks) {
        if (linksToMatch.some((lnk) => rowLinks.includes(lnk))) {
          matchedRowIdx = i;
          break;
        }
      }
      // 드라이브 링크가 없는 예외 케이스는 전화번호 + "(내용 분석 중...)" 핑거프린트로 역추적
      if (
        linksToMatch.length === 0 &&
        rowPhone === params.phoneNumber &&
        rowContent.includes("(내용 분석 중...)")
      ) {
        matchedRowIdx = i;
        break;
      }
    }

    // 핑거프린트 불일치(사용자 행 삭제 등) 시 안전 폐기 (다른 정상 행 오염 100% 차단)
    if (matchedRowIdx === -1) return false;

    const sheetRowNumber = matchedRowIdx + 1;
    await callSheetsTool(
      "sheets_update_range",
      {
        spreadsheetId: params.spreadsheetId,
        range: `E${sheetRowNumber}`,
        values: [[params.finalMessage]],
        preferOAuth: true,
      },
      params.callOptions
    );

    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: "sms_mms_ai_summary_updated",
        tableName: "sheetbot_user_dispatch_logs",
        action: "UPDATE",
        userEmail: params.cleanEmail,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return true;
  } catch (err: any) {
    console.warn("[SmsSync] updateSmsSheetRowMessageSummary warning:", err?.message || err);
    return false;
  }
}

/**
 * 국가코드(82) 제거 및 한국 표준 전화번호 형식(010-XXXX-XXXX, 1599-XXXX 등)으로 정규화
 */
function normalizePhoneNumber(phone: string): string {
  if (!phone) return "-";
  const trimmed = phone.trim();

  // "알림:" 접두어가 붙어있거나 일반 텍스트인 경우 원본 유지
  if (trimmed.startsWith("알림:") || /[가-힣a-zA-Z]/.test(trimmed)) {
    return trimmed;
  }

  let clean = trimmed.replace(/[^0-9+]/g, "").trim();

  // 7자리 미만의 짧은 숫자는 유효한 한국 전화번호가 아니므로 0 접두어를 억지로 붙이지 않고 원본 반환
  if (clean.length < 7) {
    return trimmed;
  }

  if (clean.startsWith("+82")) {
    clean = clean.slice(3);
  } else if (clean.startsWith("82") && clean.length >= 10) {
    clean = clean.slice(2);
  }

  // 대표번호 (15xx, 16xx, 18xx) 8자리
  if (clean.length === 8 && /^(15|16|18)/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }

  if (!clean.startsWith("0")) {
    clean = `0${clean}`;
  }

  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  } else if (clean.length === 10) {
    if (clean.startsWith("02")) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
    }
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  } else if (clean.length === 9 && clean.startsWith("02")) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return clean;
}

/**
 * POST /api/user/messages/sms
 * 스마트폰 시트봇 에이전트(SmsReceiver 및 SmsSentObserver)에서 수신/발신된 문자를 수신하여
 * 구글 드라이브 [SheetBot] 스마트폰 문자(SMS) 송수신 대장 시트에 실시간 자동 기록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const contentType = req.headers.get("content-type") || "";
    let bodyEmail = "";
    let direction = "INBOUND";
    let rawPhoneNumber = "";
    let contactName = "";
    let rawMessage = "";
    let timestamp = "";
    let deviceId = "SheetBot Agent";
    let rawSheetTitle = "[SheetBot] 스마트폰 문자(SMS) 송수신 대장";
    let autoRecordSheet = true;
    const incomingAttachments: IncomingSmsAttachment[] = [];
    const externalFileLinks: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      bodyEmail = String(formData.get("userEmail") || "").trim();
      direction = String(formData.get("direction") || "INBOUND").trim();
      rawPhoneNumber = String(formData.get("phoneNumber") || "").trim();
      contactName = String(formData.get("contactName") || "").trim();
      rawMessage = String(formData.get("message") || "").trim();
      timestamp = String(formData.get("timestamp") || "").trim();
      deviceId = String(formData.get("deviceId") || "SheetBot Agent").trim();
      rawSheetTitle = String(
        formData.get("sheetTitle") || "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"
      ).trim();
      const autoRecStr = String(formData.get("autoRecordSheet") ?? "true").toLowerCase();
      autoRecordSheet = autoRecStr !== "false" && autoRecStr !== "0";

      const extLinksStr = String(formData.get("fileLinks") || "").trim();
      if (extLinksStr) {
        extLinksStr
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => externalFileLinks.push(s));
      }

      const rawFiles = [
        ...formData.getAll("file"),
        ...formData.getAll("files"),
      ].filter(
        (item): item is File =>
          typeof item === "object" && item !== null && "arrayBuffer" in item && item.size > 0
      );

      for (let i = 0; i < rawFiles.length; i++) {
        const f = rawFiles[i];
        const buf = Buffer.from(await f.arrayBuffer());
        if (buf.length > 0 && buf.length <= 15 * 1024 * 1024) {
          incomingAttachments.push({
            fileName: f.name || `mms_attachment_${Date.now()}_${i + 1}.bin`,
            mimeType: f.type || "application/octet-stream",
            buffer: buf,
          });
        }
      }
    } else {
      const body = await req.json().catch(() => ({}));
      bodyEmail = String(body.userEmail || "").trim();
      direction = String(body.direction || "INBOUND").trim();
      rawPhoneNumber = String(body.phoneNumber || "").trim();
      contactName = String(body.contactName || "").trim();
      rawMessage = String(body.message || "").trim();
      timestamp = String(body.timestamp || "").trim();
      deviceId = String(body.deviceId || "SheetBot Agent").trim();
      rawSheetTitle = String(
        body.sheetTitle || "[SheetBot] 스마트폰 문자(SMS) 송수신 대장"
      ).trim();
      autoRecordSheet = body.autoRecordSheet !== false;

      if (Array.isArray(body.fileLinks)) {
        body.fileLinks
          .map((s: any) => String(s || "").trim())
          .filter(Boolean)
          .forEach((s: string) => externalFileLinks.push(s));
      }
      if (Array.isArray(body.attachments)) {
        for (let i = 0; i < body.attachments.length; i++) {
          const att = body.attachments[i];
          if (!att?.fileBase64) continue;
          const cleanB64 = String(att.fileBase64).replace(/^data:[^;]+;base64,/, "");
          const buf = Buffer.from(cleanB64, "base64");
          if (buf.length > 0 && buf.length <= 15 * 1024 * 1024) {
            incomingAttachments.push({
              fileName: String(att.fileName || `mms_attachment_${Date.now()}_${i + 1}.bin`),
              mimeType: String(att.mimeType || "application/octet-stream"),
              buffer: buf,
            });
          }
        }
      }
    }

    const effectiveRawText = isPlaceholderAttachmentMessage(rawMessage) ? "" : rawMessage.trim();
    const message =
      effectiveRawText ||
      (incomingAttachments.length > 0
        ? `[첨부파일: ${incomingAttachments.map((a) => a.fileName).join(", ")}]`
        : "");

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!rawPhoneNumber || (!message && incomingAttachments.length === 0)) {
      return NextResponse.json({ success: false, error: "전화번호와 메시지 내용(또는 첨부파일)은 필수입니다." }, { status: 400 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const isOutbound = direction.toUpperCase() === "OUTBOUND";
    const directionLabel = isOutbound ? "발신" : "수신";
    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);
    const displayName = contactName && contactName.trim().length > 0 ? contactName.trim() : "미등록 연락처";
    const nowStr = timestamp || getKoreanTimeString();
    const attachmentSignature =
      incomingAttachments.length > 0
        ? `|att:${incomingAttachments.map((a) => `${a.fileName}:${a.buffer.length}`).join(",")}`
        : "";

    // 0. 15초 이내 동일 송수신 중복 요청 방어 (Idempotency Guard — 첨부파일 시그니처 포함)
    const dedupeKey = `${cleanEmail}:${directionLabel}:${phoneNumber}:${message.trim()}${attachmentSignature}`;
    const now = Date.now();
    const lastSeen = recentSmsDedupeCache.get(dedupeKey) || 0;
    if (now - lastSeen < 15_000) {
      return NextResponse.json({
        success: true,
        message: `중복된 문자(${directionLabel}) 요청이 15초 이내에 감지되어 시트 중복 기록을 안전하게 방어했습니다.`,
        isDuplicate: true,
      });
    }
    recentSmsDedupeCache.set(dedupeKey, now);

    // 0-1. 본문 기준 2차 지능형 중복 방어 (첨부파일이 없는 텍스트 중복만 스킵, MMS 첨부파일은 보존)
    const bodyKey = `${cleanEmail}:${directionLabel}:${message.trim()}`;
    const lastBodyRecord = recentSmsBodyCache.get(bodyKey);
    const currentDigits = phoneNumber.replace(/[^0-9]/g, "");

    if (incomingAttachments.length === 0 && lastBodyRecord && (now - lastBodyRecord.time < 15_000)) {
      const prevDigits = lastBodyRecord.phone.replace(/[^0-9]/g, "");
      // 동일 본문이 15초 내에 이미 들어왔는데, 현재 번호가 7자리 미만의 비정상이거나 알림 접두어인 경우 중복 스킵
      if (currentDigits.length < 7 || phoneNumber.startsWith("알림:") || (prevDigits.length >= 9 && currentDigits.length < prevDigits.length)) {
        console.warn(`[SMS API] 단말기 이중 인입 중복 차단: 이전번호=${lastBodyRecord.phone}, 현재번호=${phoneNumber}, 본문=${message.trim()}`);
        return NextResponse.json({
          success: true,
          message: `동일 메시지가 15초 이내에 이미 정상 기록되어 2차 중복 요청을 안전하게 건너뛰었습니다.`,
          isDuplicate: true,
        });
      }
    }
    recentSmsBodyCache.set(bodyKey, { time: now, phone: phoneNumber });

    // 오래된 캐시 정리 (최대 200개 유지)
    if (recentSmsDedupeCache.size > 200) {
      const threshold = now - 60_000;
      for (const [k, v] of recentSmsDedupeCache.entries()) {
        if (v < threshold) recentSmsDedupeCache.delete(k);
      }
      for (const [k, v] of recentSmsBodyCache.entries()) {
        if (v.time < threshold) recentSmsBodyCache.delete(k);
      }
    }

    // [SheetBot] 표준 네이밍 원칙 준수
    let sheetTitle = rawSheetTitle.trim();
    if (!sheetTitle.startsWith("[SheetBot]")) {
      sheetTitle = `[SheetBot] ${sheetTitle}`;
    }

    // 1. 구글 드라이브 첨부파일 업로드 + 2단계 하이브리드 AI 요약 + 구글 스프레드시트 대장 기록 (비동기 처리로 응답 지연 원천 차단)
    let spreadsheetUrl = "";
    if (autoRecordSheet) {
      (async () => {
        try {
          const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);

          // 1-A. MMS 첨부파일 1단계 동기 무료 즉시 요약(<50ms) + 구글 드라이브 전용 폴더 격리 업로드
          const uploadedLinks: string[] = [...externalFileLinks];
          const analyzedAttachments: AnalyzedSmsAttachment[] = [];
          const userSettings =
            incomingAttachments.length > 0
              ? await getKakaoMediaUserSettings(cleanEmail)
              : null;

          if (incomingAttachments.length > 0) {
            const folderId = await resolveSmsAttachmentFolderId(cleanEmail, callOptions);
            if (!folderId) {
              console.warn(
                `[SmsSync] 전용 폴더('${SMS_ATTACHMENT_FOLDER_NAME}') ID 미확정 — 기본 감시 폴더 오염 방지를 위해 드라이브 업로드를 건너뜁니다.`
              );
            }

            const totalAtt = incomingAttachments.length;
            for (let i = 0; i < totalAtt; i++) {
              const att = incomingAttachments[i];
              const safeFileName =
                att.fileName.replace(/[/\\?%*:|"<>]/g, "_") || `mms_attachment_${i + 1}.bin`;
              const ext = safeFileName.split(".").pop()?.toLowerCase() || "bin";
              const fileHash = crypto.createHash("sha256").update(att.buffer).digest("hex");
              const mediaTypeLabel = inferKakaoMediaTypeLabel(ext, att.mimeType);

              // 1단계: 엑셀/CSV/EML/텍스트 무료 즉시 요약, .gif 및 15KB 미만 이미지 자동 제외
              const quickAnalysis = inspectMediaForQuickSummary({
                buffer: att.buffer,
                fileName: safeFileName,
                ext,
                fileHash,
                aiSummaryEnabled: userSettings ? userSettings.aiSummaryEnabled : true,
              });

              const initialLine = formatKakaoMediaMessage({
                messageType: mediaTypeLabel,
                fileName: safeFileName,
                mediaIndex: i + 1,
                mediaTotal: totalAtt,
                summary: quickAnalysis.immediateSummary,
                analyzing: quickAnalysis.needsAsyncAi,
              });

              let webViewLink = "";
              if (folderId) {
                try {
                  const upRes = await uploadDriveFileWithBridge({
                    buffer: att.buffer,
                    fileName: safeFileName,
                    folderId,
                    mimeType: att.mimeType,
                    preferOAuth: true,
                    userEmail: cleanEmail,
                    callOptions,
                  });
                  if (upRes?.webViewLink) {
                    webViewLink = upRes.webViewLink;
                    if (!uploadedLinks.includes(upRes.webViewLink)) {
                      uploadedLinks.push(upRes.webViewLink);
                    }
                  }
                } catch (upErr: any) {
                  console.warn("[SmsSync] Attachment Drive upload warning:", upErr?.message);
                }
              }

              analyzedAttachments.push({
                att,
                safeFileName,
                ext,
                fileHash,
                mediaTypeLabel,
                mediaIndex: i + 1,
                mediaTotal: totalAtt,
                quickAnalysis,
                initialLine,
                webViewLink,
              });
            }
          }

          const joinedFileLinks = uploadedLinks.join("\n");
          const initialAttachmentLines = analyzedAttachments.map((a) => a.initialLine);
          let baseTextForSheet = effectiveRawText;
          let initialSheetMessage =
            analyzedAttachments.length > 0
              ? buildCombinedSmsMessage(baseTextForSheet, initialAttachmentLines)
              : message;

          const resolved = await resolveUserSpreadsheet({
            userEmail: cleanEmail,
            sheetType: "SMS",
            defaultTitle: "[SheetBot] 스마트폰 문자(SMS) 송수신 대장",
            requestedTitle: sheetTitle,
            preferOAuth: true,
            callOptions,
          });

          const targetSpreadsheetId = resolved.spreadsheetId;

          // 시트에 신규 문자 기록 행 추가 또는 직전 SMS 텍스트 행 병합 (자가 치유: 1행 A1:G1 헤더 보장)
          if (targetSpreadsheetId) {
            const headerValues = [
              ["일시", "구분", "상대방 이름", "상대방 전화번호", "메시지 내용", "기기명", "파일링크"]
            ];

            // 1행 A1:G1 확인하여 비어있으면 헤더 선제 주입, 기존 6열 시트면 G1에 '파일링크' 보강
            const firstRowCheck = await callSheetsTool(
              "sheets_get_range",
              {
                spreadsheetId: targetSpreadsheetId,
                range: "A1:G1",
                preferOAuth: true,
              },
              callOptions
            ).catch(() => null);

            const firstRow = firstRowCheck?.values?.[0] || [];
            const hasHeaderOrData = firstRow.length > 0 && Boolean(firstRow[0]);
            const hasFileLinkHeader = Boolean(firstRow[6]);

            if (!hasHeaderOrData) {
              await callSheetsTool(
                "sheets_update_range",
                {
                  spreadsheetId: targetSpreadsheetId,
                  range: "A1:G1",
                  values: headerValues,
                  preferOAuth: true,
                },
                callOptions
              ).catch(() => {});

              await callSheetsTool(
                "sheets_format_headers",
                {
                  spreadsheetId: targetSpreadsheetId,
                  tabName: "시트1",
                  headerBgColor: "#1e293b",
                  headerTextColor: "#ffffff",
                  preferOAuth: true,
                },
                callOptions
              ).catch(() => {});
            } else if (!hasFileLinkHeader && joinedFileLinks) {
              await callSheetsTool(
                "sheets_update_range",
                {
                  spreadsheetId: targetSpreadsheetId,
                  range: "G1:G1",
                  values: [["파일링크"]],
                  preferOAuth: true,
                },
                callOptions
              ).catch(() => {});
            }

            // 기존 SMS 텍스트 행에 MMS 첨부파일이 직후(3분 이내) 뒤따라 유입된 경우 원본 본문 보존 병합
            let mergedIntoExistingRow = false;
            if (analyzedAttachments.length > 0) {
              const recentSheetData = await callSheetsTool(
                "sheets_get_range",
                {
                  spreadsheetId: targetSpreadsheetId,
                  range: "A1:G5000",
                  preferOAuth: true,
                },
                callOptions
              ).catch(() => null);

              const existingRows: string[][] = Array.isArray(recentSheetData?.values)
                ? recentSheetData.values
                : [];
              const nowMs = parseKoreanTimeMs(nowStr) ?? Date.now();
              const scanStart = Math.max(1, existingRows.length - 25);

              for (let rIdx = existingRows.length - 1; rIdx >= scanStart; rIdx--) {
                const row = existingRows[rIdx] || [];
                const rowTimeStr = String(row[0] ?? "").trim();
                const rowDir = String(row[1] ?? "").trim();
                const rowPhone = String(row[3] ?? "").trim();
                const rowContent = String(row[4] ?? "").trim();
                const rowLinks = String(row[6] ?? "").trim();

                if (rowDir !== directionLabel || rowPhone !== phoneNumber) continue;
                if (rowLinks) continue; // 이미 파일링크가 연결된 행은 건드리지 않음
                if (!rowContent || isPlaceholderAttachmentMessage(rowContent)) continue;

                const rowMs = parseKoreanTimeMs(rowTimeStr);
                if (rowMs !== null && Math.abs(nowMs - rowMs) > 3 * 60 * 1000) continue;

                // 동일 본문이거나 이번 MMS에 본문이 비어있으면 직전 SMS 텍스트 행에 병합
                if (!baseTextForSheet || rowContent === baseTextForSheet) {
                  baseTextForSheet = rowContent;
                  initialSheetMessage = buildCombinedSmsMessage(
                    baseTextForSheet,
                    initialAttachmentLines
                  );
                  const targetRowNum = rIdx + 1;
                  await callSheetsTool(
                    "sheets_update_range",
                    {
                      spreadsheetId: targetSpreadsheetId,
                      range: `E${targetRowNum}:G${targetRowNum}`,
                      values: [[initialSheetMessage, String(row[5] ?? deviceId), joinedFileLinks]],
                      preferOAuth: true,
                    },
                    callOptions
                  ).catch((err: any) =>
                    console.warn("[SmsSync] existing row merge warning:", err?.message)
                  );
                  mergedIntoExistingRow = true;
                  break;
                }
              }
            }

            if (!mergedIntoExistingRow) {
              const newRowValues = [
                [
                  nowStr,
                  directionLabel,
                  displayName,
                  phoneNumber,
                  initialSheetMessage,
                  deviceId,
                  joinedFileLinks,
                ],
              ];
              await callSheetsTool(
                "sheets_append_values",
                {
                  spreadsheetId: targetSpreadsheetId,
                  range: "A:G",
                  values: newRowValues,
                  preferOAuth: true,
                },
                callOptions
              ).catch((err: any) => console.warn("[SmsSync] append_values warning:", err.message));
            }

            // 1-B. 1단계 무료 즉시 요약(엑셀/EML/텍스트 등)으로 확정된 수신 첨부 -> 할 일 허브 자동 연계
            if (!isOutbound && userSettings?.autoTaskFromAttachment) {
              for (const item of analyzedAttachments) {
                if (
                  !item.quickAnalysis.needsAsyncAi &&
                  !item.quickAnalysis.skippedAsMeme &&
                  item.quickAnalysis.immediateSummary
                ) {
                  void maybeExtractTaskFromSmsAttachmentSummary({
                    cleanEmail,
                    displayName,
                    phoneNumber,
                    fileName: item.safeFileName,
                    summary: item.quickAnalysis.immediateSummary,
                    webViewLink: item.webViewLink,
                    timestamp: nowStr,
                    fileHash: item.fileHash,
                  });
                }
              }
            }

            // 1-C. 2단계(비동기 백그라운드): 사진·PDF·음성 경량 멀티모달 AI 1줄 요약 -> 시트 E열 안전 갱신 + 할 일 허브 자동 연계
            const asyncTargets = analyzedAttachments.filter((a) => a.quickAnalysis.needsAsyncAi);
            if (asyncTargets.length > 0) {
              void (async () => {
                try {
                  const finalLines = [...initialAttachmentLines];

                  for (let i = 0; i < analyzedAttachments.length; i++) {
                    const item = analyzedAttachments[i];
                    if (!item.quickAnalysis.needsAsyncAi) continue;

                    const aiRes = await analyzeMediaWithAi({
                      base64Data: item.att.buffer.toString("base64"),
                      ext: item.ext,
                      mimeType: item.att.mimeType,
                      fileName: item.safeFileName,
                      fileHash: item.fileHash,
                      channel: "sms",
                    });

                    finalLines[i] = formatKakaoMediaMessage({
                      messageType: item.mediaTypeLabel,
                      fileName: item.safeFileName,
                      mediaIndex: item.mediaIndex,
                      mediaTotal: item.mediaTotal,
                      summary: aiRes.skippedAsMeme ? undefined : aiRes.summary,
                      analyzing: false,
                    });

                    // 수신 문자의 업무 문서 첨부 시 할 일 허브 자동 등록
                    if (
                      !isOutbound &&
                      userSettings?.autoTaskFromAttachment &&
                      !aiRes.skippedAsMeme &&
                      aiRes.summary
                    ) {
                      await maybeExtractTaskFromSmsAttachmentSummary({
                        cleanEmail,
                        displayName,
                        phoneNumber,
                        fileName: item.safeFileName,
                        summary: aiRes.summary,
                        webViewLink: item.webViewLink,
                        timestamp: nowStr,
                        fileHash: item.fileHash,
                      });
                    }
                  }

                  const finalSheetMessage = buildCombinedSmsMessage(baseTextForSheet, finalLines);
                  await updateSmsSheetRowMessageSummary({
                    cleanEmail,
                    spreadsheetId: targetSpreadsheetId,
                    callOptions,
                    targetLinks: uploadedLinks,
                    phoneNumber,
                    initialMessage: initialSheetMessage,
                    finalMessage: finalSheetMessage,
                  });
                } catch (bgErr: any) {
                  console.warn(
                    "[SmsSync] MMS 백그라운드 AI 요약/시트 갱신 경고:",
                    bgErr?.message || bgErr
                  );
                }
              })();
            }
          }
        } catch (sheetErr: any) {
          console.warn("[SmsSync] Sheet auto-record warning:", sheetErr.message);
        }
      })();
    }

    // 1-1. 수신 문자(INBOUND)가 은행 입금 또는 결제 승인 문자일 경우 스마트 간편 주문 즉시 매칭 (Fast-Path)
    let replySms: { recipientPhone: string; message: string } | null = null;
    let matchedOrder: any = null;
    let orderTtsText: string | null = null;

    let parsedBank: any = null;
    let cleanAmount = 0;
    let custName = displayName;
    let isExpense = false;

    if (!isOutbound) {
      try {
        parsedBank = parseBankDepositSms(message);
        if (parsedBank.amountKrw && parsedBank.amountKrw > 0) {
          isExpense = (parsedBank.transactionType || "").includes("지출");
          custName = parsedBank.depositorName || displayName || (isExpense ? "가맹점/출금처" : "고객");
          cleanAmount = parsedBank.amountKrw;

          // 🎯 매출(입금) 건인 경우, [SheetBot] 스마트 간편 주문 및 품목 대장 매칭을 즉각 선제 실행!
          if (!isExpense && custName && custName !== "고객" && cleanAmount > 0) {
            matchedOrder = await findMatchingSmartOrder({
              userEmail: cleanEmail,
              depositorName: custName,
              amount: cleanAmount,
            });

            if (matchedOrder && matchedOrder.customerPhone) {
              console.log(`[SmsSync] 🎉 스마트 간편 주문 매칭 성공! 영수증 SMS 발송 연동: ${matchedOrder.customerName} (${matchedOrder.customerPhone})`);
              const replyMsg = generateReceiptSmsText(matchedOrder.customerName, cleanAmount, matchedOrder.itemsSummary);
              replySms = {
                recipientPhone: matchedOrder.customerPhone,
                message: replyMsg,
              };
              orderTtsText = `${matchedOrder.customerName}님의 주문 결제 ${cleanAmount.toLocaleString()}원이 확인되어 영수증 문자가 발송되었습니다.`;
            }
          }
        }
      } catch (bankErr: any) {
        console.warn("[SmsSync] Bank deposit parse warning:", bankErr?.message);
      }
    }

    // 1-2. 매출 대장 시트 동기화 (비동기 병렬 백그라운드 위임으로 클라이언트 타임아웃 100% 방지)
    if (!isOutbound && parsedBank && parsedBank.amountKrw > 0) {
      recordPaymentToGoogleSheet({
        userEmail: cleanEmail,
        paymentTime: nowStr,
        transactionType: parsedBank.transactionType || "매출(계좌)",
        channelOrBank: parsedBank.bankName || "카드/은행 결제",
        accountOrCardNumber: parsedBank.accountOrCardNumber || "-",
        customerName: custName,
        amount: cleanAmount,
        memoOrRawText: message.slice(0, 200),
        deviceId: deviceId || "SheetBot Agent",
      }).catch((err) => console.warn("[SmsSync] Payment sheet sync background error:", err));
    }

    // 1-3. 수신 문자(INBOUND) 실제 텍스트 본문에서 비즈니스 할 일(Action Item) 실시간 자동 추출 및 할 일 허브 등록 (Zero-Block 백그라운드)
    if (!isOutbound && effectiveRawText && (!parsedBank || !parsedBank.amountKrw)) {
      void extractAndCreateTasksFromMessage({
        userEmail: cleanEmail,
        sourceType: "SMS",
        message: effectiveRawText,
        contactName: displayName !== "미등록 연락처" ? displayName : undefined,
        contactPhone: phoneNumber !== "-" ? phoneNumber : undefined,
        timestamp: nowStr,
      }).catch((err) => console.warn("[SmsSync] Task extraction warning:", err?.message));
    }

    // 2. 발송/수신 감사 대장 DB 적재 (Zero-Retention: 고객 전화번호 마스킹 및 본문 서버 미보관 정책 준수)
    const logId = Date.now();
    await insertRows("sheetbot_user_dispatch_logs", [
      {
        id: logId,
        user_email: cleanEmail,
        rule_id: isOutbound ? "OUTBOUND_SMS" : "INBOUND_SMS",
        rule_name: isOutbound ? "📱 스마트폰 고객 문자 직접 발신" : "📱 스마트폰 고객 문자 수신",
        device_id: deviceId,
        recipient: `${displayName} (${maskPhoneNumber(phoneNumber)})`,
        content: formatZeroRetentionContent(`문자(${directionLabel})`, message.length),
        status: isOutbound ? "SUCCESS" : "INBOUND",
        error_message: null,
        created_at: getKoreanTimeString(),
      },
    ]).catch((err) => console.warn("[SmsSync] DB log insert warning:", err.message));

    // 3. 실시간 SSE 브로드캐스트
    try {
      realtimeHub.broadcast("sms", {
        type: "DATA_CHANGED",
        source: isOutbound ? "agent2_outbound_sms" : "agent2_inbound_sms",
        tableName: "sheetbot_user_dispatch_logs",
        action: "INSERT",
        userEmail: cleanEmail,
        logId,
        timestamp: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `문자(${directionLabel}) 내역이 구글 시트에 안전하게 기록되었습니다.`,
      spreadsheetUrl,
      logId,
      replySms,
      matchedOrder: matchedOrder ? true : false,
      depositorName: matchedOrder?.customerName || null,
      amountKrw: matchedOrder?.amount || 0,
      ttsText: orderTtsText,
    });
  } catch (err: any) {
    console.error("[SmsSync] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
