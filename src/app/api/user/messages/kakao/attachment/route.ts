export const dynamic = "force-dynamic";
export const maxDuration = 60;

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
import {
  callDriveTool,
  insertRows,
  listDriveFiles,
  queryTable,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { resolveUserEmailFromAuth, recordPcAgentHeartbeat } from "@/lib/kakao-pc-relay-store";
import {
  attachDriveLinkToKakaoSheetRow,
  updateKakaoSheetRowMessageSummary,
} from "@/lib/ai-copilot-learning";
import {
  analyzeMediaWithAi,
  formatKakaoMediaMessage,
  getKakaoMediaUserSettings,
  inferKakaoMediaTypeLabel,
  inspectMediaForQuickSummary,
} from "@/lib/kakao-media-analyzer";
import { extractAndCreateTasksFromMessage } from "@/lib/task-hub-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

const KAKAO_ATTACHMENT_FOLDER_NAME = "[SheetBot] 카카오톡 첨부파일";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB 상한 (청크 업로드로 터널 413 원천 차단)
const CHUNK_SESSION_TTL_MS = 5 * 60 * 1000; // 청크 업로드 세션 5분 TTL

// 15초 중복 수신 방어 캐시 (Idempotency Guard)
const recentKakaoAttachmentUploads = new Map<string, { timestamp: number; response: any }>();
// 사용자별 카카오톡 첨부파일 전용 드라이브 폴더 ID 메모리 캐시 (0초 타겟팅)
const kakaoAttachmentFolderCache = new Map<string, string>();

interface KakaoAttachmentUploadSession {
  uploadId: string;
  createdAt: number;
  cleanEmail: string;
  phone: string;
  pcName: string;
  logId: string;
  roomName: string;
  senderName: string;
  sentAtStr: string;
  messageType: string;
  mediaIndex: number;
  mediaTotal: number;
  fileName: string;
  mimeType: string;
  source: string;
  skipFtsSync: boolean;
  chunks: Buffer[];
  totalBytes: number;
}

function getUploadSessionStore(): Map<string, KakaoAttachmentUploadSession> {
  const g = globalThis as unknown as {
    __sbKakaoAttachmentSessions?: Map<string, KakaoAttachmentUploadSession>;
  };
  if (!g.__sbKakaoAttachmentSessions) {
    g.__sbKakaoAttachmentSessions = new Map<string, KakaoAttachmentUploadSession>();
  }
  return g.__sbKakaoAttachmentSessions;
}

function pruneExpiredSessions(store: Map<string, KakaoAttachmentUploadSession>) {
  const now = Date.now();
  for (const [k, s] of store.entries()) {
    if (now - s.createdAt > CHUNK_SESSION_TTL_MS) {
      store.delete(k);
    }
  }
}

/**
 * 사용자별 '[SheetBot] 카카오톡 첨부파일' 전용 구글 드라이브 폴더 ID를 엄격하게 확보합니다.
 * - 폴더 ID를 확정하지 못하면 절대 기본 감시 폴더로 Fallback하지 않고 null을 반환합니다.
 */
async function resolveKakaoAttachmentFolderId(
  cleanEmail: string,
  callOptions: any
): Promise<string | null> {
  const cacheKey = `${cleanEmail}:${KAKAO_ATTACHMENT_FOLDER_NAME}`;
  const cached = kakaoAttachmentFolderCache.get(cacheKey);
  if (cached) return cached;

  // 1. DB 바인딩 테이블 선제 조회
  try {
    const bindingQuery = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: "KAKAO_ATTACHMENT" },
      limit: 1,
    });
    const foundFolderId = bindingQuery?.rows?.[0]?.folder_id;
    if (foundFolderId && typeof foundFolderId === "string") {
      kakaoAttachmentFolderCache.set(cacheKey, foundFolderId);
      return foundFolderId;
    }
  } catch {}

  // 2. 구글 드라이브 폴더 검색
  let targetFolderId: string | null = null;
  try {
    const folderSearch = await listDriveFiles(
      {
        query: `mimeType = 'application/vnd.google-apps.folder' and name = '${KAKAO_ATTACHMENT_FOLDER_NAME}' and trashed = false`,
      },
      { preferOAuth: true, ...callOptions }
    );
    const existingFolders = folderSearch?.files || [];
    if (existingFolders.length > 0 && existingFolders[0]?.id) {
      targetFolderId = String(existingFolders[0].id);
    }
  } catch (err: any) {
    console.warn("[KakaoAttachment] Drive folder search warning:", err?.message || err);
  }

  // 3. 없으면 즉시 동기 생성
  if (!targetFolderId) {
    try {
      const created = await callDriveTool(
        "drive_create_folder",
        { name: KAKAO_ATTACHMENT_FOLDER_NAME, preferOAuth: true },
        callOptions
      );
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
    } catch (err: any) {
      console.error("[KakaoAttachment] Drive folder creation failed:", err?.message || err);
    }
  }

  if (targetFolderId) {
    kakaoAttachmentFolderCache.set(cacheKey, targetFolderId);
    try {
      await insertRows("sheetbot_user_sheet_bindings", [
        {
          user_email: cleanEmail,
          sheet_type: "KAKAO_ATTACHMENT",
          sheet_title: KAKAO_ATTACHMENT_FOLDER_NAME,
          spreadsheet_id: "",
          spreadsheet_url: "",
          folder_id: targetFolderId,
          folder_name: KAKAO_ATTACHMENT_FOLDER_NAME,
          created_at: getKoreanTimeString(),
          updated_at: getKoreanTimeString(),
        },
      ]);
    } catch {}
  }

  return targetFolderId;
}

/**
 * 요약된 첨부파일 내용에서 업무 할 일(견적서/발주서/계약서/입금요청 등)을 자동 추출해 할 일 허브에 등록합니다.
 */
async function maybeExtractTaskFromAttachmentSummary(params: {
  cleanEmail: string;
  phone: string;
  roomName: string;
  senderName: string;
  fileName: string;
  summary: string;
  webViewLink: string;
  logId: string;
}) {
  try {
    if (!params.summary || params.summary.trim().length < 8) return;
    const messageForTask = [
      `[카카오톡 첨부파일: ${params.fileName}]`,
      params.summary.trim(),
      params.webViewLink ? `(원본 파일: ${params.webViewLink})` : "",
    ]
      .filter(Boolean)
      .join(" ");

    await extractAndCreateTasksFromMessage({
      userEmail: params.cleanEmail,
      userPhone: params.phone || undefined,
      sourceType: "KAKAO",
      contactName: params.senderName || params.roomName || "카카오톡",
      chatRoomName: params.roomName || undefined,
      message: messageForTask,
      sourceId: params.logId ? `kakao_att_${params.logId}` : undefined,
      deepLink: params.webViewLink || undefined,
    });
  } catch (err: any) {
    console.warn("[KakaoAttachment] 할 일 허브 자동 연계 경고:", err?.message || err);
  }
}

/**
 * 2단계(비동기 백그라운드): 경량 멀티모달 AI로 사진·PDF·음성 내용을 요약한 뒤
 * 1) 구글 시트 해당 행의 E열(메시지 내용)을 핑거프린트 검증 후 안전하게 갱신하고
 * 2) 업무 문서(견적서/발주서/계약서 등)인 경우 할 일 허브에 자동 등록합니다.
 */
async function enrichKakaoAttachmentInBackground(params: {
  cleanEmail: string;
  phone: string;
  spreadsheetId?: string;
  logId: string;
  webViewLink: string;
  roomName: string;
  senderName: string;
  fileName: string;
  fileHash: string;
  base64Data: string;
  ext: string;
  mimeType: string;
  messageType: string;
  mediaIndex: number;
  mediaTotal: number;
  autoTaskFromAttachment: boolean;
}) {
  try {
    const aiRes = await analyzeMediaWithAi({
      base64Data: params.base64Data,
      ext: params.ext,
      mimeType: params.mimeType,
      fileName: params.fileName,
      fileHash: params.fileHash,
    });

    const finalMessage = formatKakaoMediaMessage({
      messageType: params.messageType,
      fileName: params.fileName,
      mediaIndex: params.mediaIndex,
      mediaTotal: params.mediaTotal,
      summary: aiRes.skippedAsMeme ? undefined : aiRes.summary,
      analyzing: false,
    });

    await updateKakaoSheetRowMessageSummary({
      userEmail: params.cleanEmail,
      spreadsheetId: params.spreadsheetId,
      logId: params.logId,
      webViewLink: params.webViewLink,
      finalMessage,
    });

    if (params.autoTaskFromAttachment && !aiRes.skippedAsMeme && aiRes.summary) {
      await maybeExtractTaskFromAttachmentSummary({
        cleanEmail: params.cleanEmail,
        phone: params.phone,
        roomName: params.roomName,
        senderName: params.senderName,
        fileName: params.fileName,
        summary: aiRes.summary,
        webViewLink: params.webViewLink,
        logId: params.logId,
      });
    }
  } catch (err: any) {
    console.warn("[KakaoAttachment] 백그라운드 AI 요약/시트 갱신 경고:", err?.message || err);
  }
}

/**
 * POST /api/user/messages/kakao/attachment
 * - 소형 파일(<=700KB): multipart/form-data 단일 요청 (JSON+Base64 하위 호환 유지)
 * - 중대용량 파일(700KB~20MB): application/json 3단계 청크 업로드(init -> chunk -> commit)로 터널 413 원천 차단
 * 1) 구글 드라이브 '[SheetBot] 카카오톡 첨부파일' 전용 폴더에 영구 저장
 * 2) '[SheetBot] 카카오톡 메시지 대장' 시트 해당 행 E열(요약) + H열(메시지ID) + I열(파일링크) 자동 연결 (모바일 선기록 행 병합 지원)
 * 3) 백그라운드 비동기 하이브리드 AI 요약 + 할 일 허브 자동 연계
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let email = "";
    let phone = "";
    let code = "";
    let pcName = "내 PC";
    let logId = "";
    let roomName = "";
    let senderName = "";
    let sentAtStr = "";
    let messageType = "";
    let mediaIndex = 1;
    let mediaTotal = 1;
    let rawFileName = "kakao_attachment";
    let mimeType = "application/octet-stream";
    let source = "URL_DOWNLOAD";
    let skipFtsSync = false;
    let buffer: Buffer | null = null;

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const action = String(body?.action || "").trim().toLowerCase();
      email = String(body.email || body.userEmail || "").trim();
      phone = String(body.phone || body.phoneNumber || "").trim();
      code = String(body.code || body.pairingCode || "").trim();
      pcName = String(body.pcName || "내 PC").trim();

      const resolvedEmail =
        resolveUserEmailFromAuth(email || phone || sessionEmail || "", code, phone) ||
        (email.includes("@") ? email : "") ||
        (sessionEmail || "");
      const cleanEmailAuth = resolvedEmail.toLowerCase().trim();

      if (!cleanEmailAuth || !cleanEmailAuth.includes("@")) {
        return NextResponse.json(
          { ok: false, error: "인증된 계정 이메일을 확인할 수 없습니다." },
          { status: 401 }
        );
      }

      // 3단계 청크 업로드 세션 처리 (init -> chunk -> commit)
      if (action === "init" || action === "chunk" || action === "commit") {
        const store = getUploadSessionStore();
        pruneExpiredSessions(store);

        if (action === "init") {
          const totalSize = Number(body?.totalSize || 0);
          if (totalSize > MAX_ATTACHMENT_BYTES) {
            return NextResponse.json(
              { ok: false, error: "첨부 파일 크기가 20MB 제한을 초과했습니다." },
              { status: 413 }
            );
          }
          const uploadId = `sbka_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
          store.set(uploadId, {
            uploadId,
            createdAt: Date.now(),
            cleanEmail: cleanEmailAuth,
            phone,
            pcName,
            logId: body.logId !== undefined && body.logId !== null ? String(body.logId).trim() : "",
            roomName: String(body.roomName || body.room || "").trim(),
            senderName: String(body.senderName || body.sender || "").trim(),
            sentAtStr: String(body.sentAtStr || "").trim(),
            messageType: String(body.messageType || "").trim(),
            mediaIndex: Math.max(1, Number(body.mediaIndex || 1) || 1),
            mediaTotal: Math.max(1, Number(body.mediaTotal || 1) || 1),
            fileName: String(body.fileName || rawFileName).trim(),
            mimeType: String(body.mimeType || mimeType).trim(),
            source: String(body.source || source).trim(),
            skipFtsSync: Boolean(body.skipFtsSync),
            chunks: [],
            totalBytes: 0,
          });
          return NextResponse.json({ ok: true, success: true, uploadId });
        }

        if (action === "chunk") {
          const uploadId = String(body?.uploadId || "");
          const sess = store.get(uploadId);
          if (!sess || sess.cleanEmail !== cleanEmailAuth) {
            return NextResponse.json(
              { ok: false, error: "유효하지 않거나 만료된 업로드 세션입니다." },
              { status: 404 }
            );
          }
          const chunkBase64 = String(body?.chunkBase64 || "");
          if (!chunkBase64) {
            return NextResponse.json({ ok: false, error: "chunkBase64가 필요합니다." }, { status: 400 });
          }
          const chunkBuf = Buffer.from(chunkBase64, "base64");
          if (sess.totalBytes + chunkBuf.length > MAX_ATTACHMENT_BYTES) {
            store.delete(uploadId);
            return NextResponse.json(
              { ok: false, error: "첨부 파일 크기가 20MB 제한을 초과했습니다." },
              { status: 413 }
            );
          }
          sess.chunks.push(chunkBuf);
          sess.totalBytes += chunkBuf.length;
          return NextResponse.json({
            ok: true,
            success: true,
            uploadId,
            receivedBytes: sess.totalBytes,
          });
        }

        // action === "commit"
        const uploadId = String(body?.uploadId || "");
        const sess = store.get(uploadId);
        if (!sess || sess.cleanEmail !== cleanEmailAuth) {
          return NextResponse.json(
            { ok: false, error: "유효하지 않거나 만료된 업로드 세션입니다." },
            { status: 404 }
          );
        }
        store.delete(uploadId);
        buffer = Buffer.concat(sess.chunks);
        email = sess.cleanEmail;
        phone = sess.phone;
        pcName = sess.pcName;
        logId = sess.logId;
        roomName = sess.roomName;
        senderName = sess.senderName;
        sentAtStr = sess.sentAtStr;
        messageType = sess.messageType;
        mediaIndex = sess.mediaIndex;
        mediaTotal = sess.mediaTotal;
        rawFileName = sess.fileName;
        mimeType = sess.mimeType;
        source = sess.source;
        skipFtsSync = sess.skipFtsSync;
      } else {
        // 기존 단일 JSON + Base64 하위 호환 경로
        logId = body.logId !== undefined && body.logId !== null ? String(body.logId).trim() : "";
        roomName = String(body.roomName || body.room || "").trim();
        senderName = String(body.senderName || body.sender || "").trim();
        sentAtStr = String(body.sentAtStr || "").trim();
        messageType = String(body.messageType || "").trim();
        mediaIndex = Math.max(1, Number(body.mediaIndex || 1) || 1);
        mediaTotal = Math.max(1, Number(body.mediaTotal || 1) || 1);
        rawFileName = String(body.fileName || rawFileName).trim();
        mimeType = String(body.mimeType || mimeType).trim();
        source = String(body.source || source).trim();
        skipFtsSync = Boolean(body.skipFtsSync);

        const rawBase64 = String(body.fileBase64 || body.base64 || "");
        if (rawBase64) {
          const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
          buffer = Buffer.from(cleanBase64, "base64");
        }
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      email = String(formData.get("email") || formData.get("userEmail") || "").trim();
      phone = String(formData.get("phone") || formData.get("phoneNumber") || "").trim();
      code = String(formData.get("code") || formData.get("pairingCode") || "").trim();
      pcName = String(formData.get("pcName") || "내 PC").trim();
      logId = String(formData.get("logId") || "").trim();
      roomName = String(formData.get("roomName") || "").trim();
      senderName = String(formData.get("senderName") || "").trim();
      sentAtStr = String(formData.get("sentAtStr") || "").trim();
      messageType = String(formData.get("messageType") || "").trim();
      mediaIndex = Math.max(1, Number(formData.get("mediaIndex") || 1) || 1);
      mediaTotal = Math.max(1, Number(formData.get("mediaTotal") || 1) || 1);
      rawFileName = String(formData.get("fileName") || file?.name || rawFileName).trim();
      mimeType = String(formData.get("mimeType") || file?.type || mimeType).trim();
      source = String(formData.get("source") || source).trim();
      skipFtsSync = String(formData.get("skipFtsSync") || "").toLowerCase() === "true" ||
        String(formData.get("skipFtsSync") || "") === "1";

      if (file) {
        buffer = Buffer.from(await file.arrayBuffer());
      }
    }

    const resolvedEmail =
      resolveUserEmailFromAuth(email || phone || sessionEmail || "", code, phone) ||
      (email.includes("@") ? email : "") ||
      (sessionEmail || "");
    const cleanEmail = resolvedEmail.toLowerCase().trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "인증된 계정 이메일을 확인할 수 없습니다." },
        { status: 401 }
      );
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ ok: false, error: "첨부 파일 데이터가 비어 있습니다." }, { status: 400 });
    }

    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { ok: false, error: "첨부 파일 크기가 20MB 제한을 초과했습니다." },
        { status: 413 }
      );
    }

    recordPcAgentHeartbeat({
      userEmail: cleanEmail,
      phoneNumber: phone,
      pcName,
      kakaoReady: true,
    });

    // 15초 멱등성 방어 (동일 파일 중복 업로드 차단)
    const now = Date.now();
    const dedupeKey = `${cleanEmail}:${logId || roomName}:${rawFileName}:${buffer.length}`;
    const prev = recentKakaoAttachmentUploads.get(dedupeKey);
    if (prev && now - prev.timestamp < 15_000) {
      return NextResponse.json({ ...prev.response, deduplicated: true });
    }
    if (recentKakaoAttachmentUploads.size > 200) {
      for (const [k, v] of recentKakaoAttachmentUploads.entries()) {
        if (now - v.timestamp > 60_000) recentKakaoAttachmentUploads.delete(k);
      }
    }

    const isFtsOnlyAccount =
      cleanEmail.endsWith("@fts.local") || cleanEmail.endsWith("@filetosheet.cloud");
    const safeRoomPrefix = roomName
      ? `[${roomName.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 30)}] `
      : "";
    const safeFileName = rawFileName.replace(/[/\\?%*:|"<>]/g, "_") || "kakao_attachment";
    const destName = `${safeRoomPrefix}${safeFileName}`;
    const ext = safeFileName.split(".").pop()?.toLowerCase() || "bin";
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const resolvedTypeLabel = inferKakaoMediaTypeLabel(ext, mimeType, messageType);
    const base64ForFts = !skipFtsSync && buffer.length <= 4 * 1024 * 1024 ? buffer.toString("base64") : "";

    // 1. 사용자별 AI 요약/할 일 연계 설정 조회 및 1단계 동기 무료 요약(<50ms)
    const userSettings = await getKakaoMediaUserSettings(cleanEmail);
    const quickAnalysis = inspectMediaForQuickSummary({
      buffer,
      fileName: safeFileName,
      ext,
      fileHash,
      aiSummaryEnabled: userSettings.aiSummaryEnabled,
    });
    const initialMediaMessage = formatKakaoMediaMessage({
      messageType: resolvedTypeLabel,
      fileName: safeFileName,
      mediaIndex,
      mediaTotal,
      summary: quickAnalysis.immediateSummary,
      analyzing: quickAnalysis.needsAsyncAi,
    });

    let uploadedFileId: string | null = null;
    let uploadedName = destName;
    let webViewLink = "";

    // 2. 구글 계정 연동 회원: 구글 드라이브 전용 폴더('[SheetBot] 카카오톡 첨부파일') 업로드
    if (!isFtsOnlyAccount) {
      const callOptions = await getWorkspaceCallOptionsForEmail(cleanEmail, req);

      // 엄격한 전용 폴더 격리 (targetFolderId 미확정 시 업로드 중단)
      const targetFolderId = await resolveKakaoAttachmentFolderId(cleanEmail, callOptions);
      if (!targetFolderId) {
        return NextResponse.json(
          {
            ok: false,
            error: `대상 구글 드라이브 폴더('${KAKAO_ATTACHMENT_FOLDER_NAME}')를 특정하지 못해 업로드를 중단했습니다.`,
          },
          { status: 500 }
        );
      }

      const uploaded = await uploadDriveFileWithBridge({
        buffer,
        fileName: destName,
        folderId: targetFolderId,
        mimeType,
        preferOAuth: true,
        userEmail: cleanEmail,
        callOptions,
      });

      if (!uploaded.webViewLink) {
        return NextResponse.json(
          { ok: false, error: "구글 드라이브 업로드 링크를 받지 못했습니다." },
          { status: 500 }
        );
      }
      uploadedFileId = uploaded.fileId || null;
      uploadedName = uploaded.name || destName;
      webViewLink = uploaded.webViewLink;
    }

    // 3. 구글 시트(E/H/I열) 및 파투 시트 동시 연결 (모바일 알림 선기록 행 병합 포함)
    const sheetRes = await attachDriveLinkToKakaoSheetRow({
      userEmail: cleanEmail,
      phoneNumber: phone,
      logId,
      roomName,
      senderName,
      fileName: safeFileName,
      mimeType,
      fileBase64: base64ForFts,
      webViewLink,
      pcName,
      sentAtStr,
      messageContent: initialMediaMessage,
      mediaIndex,
      skipFtsSync,
      req,
    });

    const finalLink = webViewLink || sheetRes.ftsFileUrl || "";

    // 4. 2단계(비동기 백그라운드): 사진·PDF·음성은 응답 블로킹 없이 AI 1줄 요약 + 시트 E열 갱신 + 할 일 연계
    if (!isFtsOnlyAccount && quickAnalysis.needsAsyncAi) {
      const base64Data = buffer.toString("base64");
      void enrichKakaoAttachmentInBackground({
        cleanEmail,
        phone,
        spreadsheetId: sheetRes.spreadsheetId,
        logId,
        webViewLink: finalLink,
        roomName,
        senderName,
        fileName: safeFileName,
        fileHash,
        base64Data,
        ext,
        mimeType,
        messageType: resolvedTypeLabel,
        mediaIndex,
        mediaTotal,
        autoTaskFromAttachment: userSettings.autoTaskFromAttachment,
      });
    } else if (
      !isFtsOnlyAccount &&
      userSettings.autoTaskFromAttachment &&
      !quickAnalysis.skippedAsMeme &&
      quickAnalysis.immediateSummary
    ) {
      // 1단계 무료 요약(엑셀/EML/텍스트 등)에서도 업무 문서면 비동기로 할 일 자동 추출
      void maybeExtractTaskFromAttachmentSummary({
        cleanEmail,
        phone,
        roomName,
        senderName,
        fileName: safeFileName,
        summary: quickAnalysis.immediateSummary,
        webViewLink: finalLink,
        logId,
      });
    }

    const responsePayload = {
      ok: true,
      success: true,
      fileId: uploadedFileId,
      fileName: uploadedName,
      webViewLink: finalLink,
      folderName: isFtsOnlyAccount ? "파투 시트봇 연동 장부" : KAKAO_ATTACHMENT_FOLDER_NAME,
      source,
      sheetUpdated: sheetRes.updated,
      sheetAppended: sheetRes.appended,
      ftsUpdated: Boolean(sheetRes.ftsUpdated),
      aiSummaryScheduled: !isFtsOnlyAccount && quickAnalysis.needsAsyncAi,
      skippedAsMeme: Boolean(quickAnalysis.skippedAsMeme),
    };

    recentKakaoAttachmentUploads.set(dedupeKey, {
      timestamp: now,
      response: responsePayload,
    });

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[KakaoAttachment] Upload error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: err?.message || "카카오톡 첨부 파일 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
