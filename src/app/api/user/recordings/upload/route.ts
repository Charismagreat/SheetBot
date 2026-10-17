export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { setupDatabase } from "@/lib/setup-db";
import { processPendingBatchJobs } from "@/lib/ai-batch-sweeper";
import {
  acceptRecordingUpload,
  writeDebugLog,
  RECORDING_DEFAULTS,
  defaultCallTime,
} from "@/lib/recording-upload-core";

/**
 * POST /api/user/recordings/upload
 * 스마트폰 시트봇 에이전트에서 통화 녹음 파일을 수신하여
 * 구글 드라이브 지정 폴더에 자동 업로드하고, 폴더 내 [SheetBot] 통화 녹음 대장 시트에 자동 기록
 *
 * ⚠️ 단일 본문 업로드는 이지데스크 프록시(proxy.ts)의 10MB 본문 제한을 받습니다.
 *    대용량 녹음은 청크 업로드(/api/user/recordings/chunks)를 사용하세요.
 *    (pipeline 본체는 @/lib/recording-upload-core 로 이전됨)
 */
export async function POST(req: NextRequest) {
  writeDebugLog(`>>> Incoming upload request. Content-Length: ${req.headers.get("content-length")}, Content-Type: ${req.headers.get("content-type")}`);
  try {
    await setupDatabase();
    // 이전에 대기 중이던 배치 작업이 있다면 백그라운드로 즉시 수거
    void processPendingBatchJobs().catch(() => {});

    // 1. 유저 식별 (세션, 헤더, 폼데이터/JSON 다중 폴백)
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";

    let buffer: Buffer | null = null;
    let rawFileName = RECORDING_DEFAULTS.rawFileName;
    let contactName = RECORDING_DEFAULTS.contactName;
    let callTime = defaultCallTime();
    let rawFolderName = RECORDING_DEFAULTS.rawFolderName;
    let autoRecordSheet = true;
    let bodyEmail: string | null = null;
    let channelCount = RECORDING_DEFAULTS.channelCount;

    if (contentType.includes("application/json")) {
      const json = await req.json();
      bodyEmail = json.userEmail || json.email || null;
      rawFileName = json.fileName || rawFileName;
      contactName = json.contactName || contactName;
      callTime = json.callTime || callTime;
      rawFolderName = json.folderName || rawFolderName;
      autoRecordSheet = json.autoRecordSheet !== false;
      if (json.channelCount !== undefined) {
        channelCount = Number(json.channelCount) || 2;
      }

      const rawBase64 = json.fileBase64 || json.base64 || json.audioBase64 || "";
      if (rawBase64) {
        const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/, "");
        buffer = Buffer.from(cleanBase64, "base64");
      }
      writeDebugLog(`Parsed JSON: fileName=${rawFileName}, contactName=${contactName}, channels=${channelCount}, bufferSize=${buffer?.length}, bodyEmail=${bodyEmail}`);
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      bodyEmail = formData.get("userEmail") as string | null;
      rawFileName = (formData.get("fileName") as string | null) || (file?.name) || rawFileName;
      contactName = (formData.get("contactName") as string | null) || contactName;
      callTime = (formData.get("callTime") as string | null) || callTime;
      rawFolderName = (formData.get("folderName") as string | null) || rawFolderName;
      autoRecordSheet = formData.get("autoRecordSheet") !== "false";
      const formChannels = formData.get("channelCount");
      if (formChannels) {
        channelCount = Number(formChannels) || 2;
      }

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
      writeDebugLog(`Parsed form: fileName=${rawFileName}, contactName=${contactName}, channels=${channelCount}, fileSize=${file?.size}, bodyEmail=${bodyEmail}`);
    }

    return await acceptRecordingUpload({
      buffer,
      rawFileName,
      contactName,
      callTime,
      rawFolderName,
      autoRecordSheet,
      bodyEmail,
      channelCount,
      sessionEmail,
      headerEmail,
    });
  } catch (err: any) {
    writeDebugLog(`FATAL ERROR in route.ts: ${err.message}\nStack: ${err.stack}`);
    console.error("[RecordingsUpload] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
