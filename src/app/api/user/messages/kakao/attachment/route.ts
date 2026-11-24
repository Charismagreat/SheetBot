export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
import { attachDriveLinkToKakaoSheetRow } from "@/lib/ai-copilot-learning";
import { getKoreanTimeString } from "@/lib/date-utils";

const KAKAO_ATTACHMENT_FOLDER_NAME = "[SheetBot] 카카오톡 첨부파일";
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB 상한 (터널 프록시 안정성 확보)

// 15초 중복 수신 방어 캐시 (Idempotency Guard)
const recentKakaoAttachmentUploads = new Map<string, { timestamp: number; response: any }>();
// 사용자별 카카오톡 첨부파일 전용 드라이브 폴더 ID 메모리 캐시 (0초 타겟팅)
const kakaoAttachmentFolderCache = new Map<string, string>();

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
    // DB 바인딩 영구 저장 (실패해도 업로드 진행)
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
 * POST /api/user/messages/kakao/attachment
 * PC 카톡 브리지(sheetbot_pc_kakao_agent.py)에서 수집한 대화창 첨부 파일(URL 자동 다운로드 또는 로컬 폴더 감시)을
 * 구글 드라이브 '[SheetBot] 카카오톡 첨부파일' 전용 폴더에 저장하고,
 * '[SheetBot] 카카오톡 메시지 대장' 시트 해당 행 I열('파일링크')에 자동 연결합니다.
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const contentType = req.headers.get("content-type") || "";
    let email = "";
    let phone = "";
    let code = "";
    let pcName = "내 PC";
    let logId = "";
    let roomName = "";
    let senderName = "";
    let rawFileName = "kakao_attachment";
    let mimeType = "application/octet-stream";
    let source = "URL_DOWNLOAD";
    let buffer: Buffer | null = null;

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      email = String(body.email || body.userEmail || "").trim();
      phone = String(body.phone || "").trim();
      code = String(body.code || "").trim();
      pcName = String(body.pcName || "내 PC").trim();
      logId = body.logId !== undefined && body.logId !== null ? String(body.logId).trim() : "";
      roomName = String(body.roomName || body.room || "").trim();
      senderName = String(body.senderName || body.sender || "").trim();
      rawFileName = String(body.fileName || rawFileName).trim();
      mimeType = String(body.mimeType || mimeType).trim();
      source = String(body.source || source).trim();

      const rawBase64 = String(body.fileBase64 || body.base64 || "");
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      email = String(formData.get("email") || formData.get("userEmail") || "").trim();
      phone = String(formData.get("phone") || "").trim();
      code = String(formData.get("code") || "").trim();
      pcName = String(formData.get("pcName") || "내 PC").trim();
      logId = String(formData.get("logId") || "").trim();
      roomName = String(formData.get("roomName") || "").trim();
      senderName = String(formData.get("senderName") || "").trim();
      rawFileName = String(formData.get("fileName") || file?.name || rawFileName).trim();
      mimeType = String(formData.get("mimeType") || file?.type || mimeType).trim();
      source = String(formData.get("source") || source).trim();

      if (file) {
        buffer = Buffer.from(await file.arrayBuffer());
      }
    }

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
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
        { ok: false, error: "첨부 파일 크기가 15MB 제한을 초과했습니다." },
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
    const base64ForFts = buffer.length <= 4 * 1024 * 1024 ? buffer.toString("base64") : "";

    let uploadedFileId: string | null = null;
    let uploadedName = destName;
    let webViewLink = "";

    // 구글 계정 연동 회원: 구글 드라이브 전용 폴더('[SheetBot] 카카오톡 첨부파일') 업로드
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

    // 구글 시트(I열) 및 파투 시트('파일링크' + uploaded_files 원본 저장) 동시 연결
    const sheetRes = await attachDriveLinkToKakaoSheetRow({
      userEmail: cleanEmail,
      phoneNumber: phone,
      logId,
      roomName,
      senderName,
      fileName: rawFileName,
      mimeType,
      fileBase64: base64ForFts,
      webViewLink,
      pcName,
      req,
    });

    const finalLink = webViewLink || sheetRes.ftsFileUrl || "";

    const responsePayload = {
      ok: true,
      fileId: uploadedFileId,
      fileName: uploadedName,
      webViewLink: finalLink,
      folderName: isFtsOnlyAccount ? "파투 시트봇 연동 장부" : KAKAO_ATTACHMENT_FOLDER_NAME,
      source,
      sheetUpdated: sheetRes.updated,
      sheetAppended: sheetRes.appended,
      ftsUpdated: Boolean(sheetRes.ftsUpdated),
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
