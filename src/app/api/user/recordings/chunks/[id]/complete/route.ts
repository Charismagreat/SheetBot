export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { setupDatabase } from "@/lib/setup-db";
import { processPendingBatchJobs } from "@/lib/ai-batch-sweeper";
import { acceptRecordingUpload, writeDebugLog } from "@/lib/recording-upload-core";
import {
  readSession,
  assembleChunks,
  deleteSession,
  isValidUploadId,
  listReceivedChunks,
} from "@/lib/recording-chunk-store";

/**
 * POST /api/user/recordings/chunks/:id/complete
 * 모든 청크 재조립 → 기존 통화 녹음 파이프라인(acceptRecordingUpload) 투입
 * (구글 드라이브 업로드 / 시트 대장 / AI 배치 분석은 백그라운드, 응답은 즉시 반환)
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  let uploadId = "";
  try {
    const { id } = await ctx.params;
    uploadId = id;
    if (!isValidUploadId(id)) {
      return NextResponse.json({ success: false, error: "잘못된 업로드 ID입니다." }, { status: 400 });
    }
    const meta = readSession(id);
    if (!meta) {
      return NextResponse.json({ success: false, error: "업로드 세션이 없거나 만료되었습니다." }, { status: 404 });
    }

    const received = listReceivedChunks(meta);
    if (received.length !== meta.totalChunks) {
      const missing: number[] = [];
      for (let i = 0; i < meta.totalChunks; i++) if (!received.includes(i)) missing.push(i);
      return NextResponse.json(
        { success: false, error: "아직 수신되지 않은 청크가 있습니다.", missing },
        { status: 409 },
      );
    }

    const buffer = assembleChunks(meta);
    writeDebugLog(`[Chunked] Complete ${id}: assembled ${buffer.length} bytes for ${meta.userEmail} (${meta.fileName})`);

    await setupDatabase();
    void processPendingBatchJobs().catch(() => {});

    const res = await acceptRecordingUpload({
      buffer,
      rawFileName: meta.fileName,
      contactName: meta.contactName,
      callTime: meta.callTime,
      rawFolderName: meta.folderName,
      autoRecordSheet: meta.autoRecordSheet,
      bodyEmail: meta.userEmail,
      channelCount: meta.channelCount,
      sessionEmail: null,
      headerEmail: null,
    });

    // 파이프라인은 자체 임시 파일을 사용하므로 청크 디렉토리는 즉시 회수
    if (res.status < 400) deleteSession(id);
    return res;
  } catch (err: any) {
    writeDebugLog(`[Chunked] Complete error (${uploadId}): ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
