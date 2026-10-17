export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { writeDebugLog, RECORDING_DEFAULTS, defaultCallTime } from "@/lib/recording-upload-core";
import { createSession, RECORDING_MAX_TOTAL_SIZE } from "@/lib/recording-chunk-store";

/**
 * POST /api/user/recordings/chunks — 통화 녹음 청크 업로드 세션 초기화
 * body(JSON): { userEmail, fileName, totalSize, contactName?, callTime?, folderName?, autoRecordSheet?, channelCount? }
 * resp: { success, uploadId, chunkSize, totalChunks }
 */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({} as any));
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const bodyEmail: string | null = json.userEmail || json.email || null;

    const userEmail = (bodyEmail && bodyEmail.includes("@"))
      ? bodyEmail.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const totalSize = Number(json.totalSize ?? json.size);
    if (!Number.isFinite(totalSize) || totalSize <= 0) {
      return NextResponse.json({ success: false, error: "totalSize가 올바르지 않습니다." }, { status: 400 });
    }
    if (totalSize > RECORDING_MAX_TOTAL_SIZE) {
      return NextResponse.json({ success: false, error: `파일이 너무 큽니다 (최대 ${RECORDING_MAX_TOTAL_SIZE / 1024 / 1024}MB).` }, { status: 413 });
    }

    const meta = createSession({
      userEmail,
      fileName: String(json.fileName || RECORDING_DEFAULTS.rawFileName),
      contactName: String(json.contactName || RECORDING_DEFAULTS.contactName),
      callTime: String(json.callTime || defaultCallTime()),
      folderName: String(json.folderName || RECORDING_DEFAULTS.rawFolderName),
      autoRecordSheet: json.autoRecordSheet !== false,
      channelCount: Number(json.channelCount) || RECORDING_DEFAULTS.channelCount,
      totalSize,
    });

    writeDebugLog(`[Chunked] Init ${meta.uploadId}: ${meta.fileName} (${totalSize} bytes, ${meta.totalChunks} chunks) for ${userEmail}`);
    return NextResponse.json({
      success: true,
      uploadId: meta.uploadId,
      chunkSize: meta.chunkSize,
      totalChunks: meta.totalChunks,
    });
  } catch (err: any) {
    writeDebugLog(`[Chunked] Init error: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
