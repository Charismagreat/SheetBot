export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { writeDebugLog } from "@/lib/recording-upload-core";
import { readSession, writeChunk, isValidUploadId, sha256Hex } from "@/lib/recording-chunk-store";

/**
 * PUT /api/user/recordings/chunks/:id/parts/:index — 원시 바이너리(application/octet-stream) 청크 수신
 * 선택 헤더: x-chunk-sha256 (무결성 검증)
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  try {
    const { id, index: indexStr } = await ctx.params;
    if (!isValidUploadId(id)) {
      return NextResponse.json({ success: false, error: "잘못된 업로드 ID입니다." }, { status: 400 });
    }
    const meta = readSession(id);
    if (!meta) {
      return NextResponse.json({ success: false, error: "업로드 세션이 없거나 만료되었습니다." }, { status: 404 });
    }

    const index = Number(indexStr);
    if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
      return NextResponse.json({ success: false, error: `잘못된 청크 번호입니다: ${indexStr}` }, { status: 400 });
    }

    const data = Buffer.from(await req.arrayBuffer());
    const isLast = index === meta.totalChunks - 1;
    const expectedSize = isLast ? meta.totalSize - meta.chunkSize * (meta.totalChunks - 1) : meta.chunkSize;
    if (data.length !== expectedSize) {
      return NextResponse.json(
        { success: false, error: `청크 크기 불일치 (index=${index}, expected ${expectedSize}, got ${data.length})` },
        { status: 400 },
      );
    }

    const sha = req.headers.get("x-chunk-sha256");
    if (sha && sha.toLowerCase() !== sha256Hex(data)) {
      return NextResponse.json({ success: false, error: `청크 무결성(SHA-256) 검증 실패 (index=${index})` }, { status: 422 });
    }

    writeChunk(id, index, data);
    return NextResponse.json({ success: true, index });
  } catch (err: any) {
    writeDebugLog(`[Chunked] Part error: ${err.message}`);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
