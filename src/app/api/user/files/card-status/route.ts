export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCardJob } from "@/lib/card-job-store";

/**
 * GET /api/user/files/card-status?jobId=...
 * 명함 비동기 AI 분석 상태 확인 (0.01초 Fast-Check)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ success: false, error: "jobId가 누락되었습니다." }, { status: 400 });
  }

  const job = getCardJob(jobId);
  if (!job) {
    return NextResponse.json({ success: false, error: "작업을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(
    {
      success: true,
      jobId: job.jobId,
      status: job.status,
      ocrData: job.ocrData || null,
      spreadsheetUrl: job.spreadsheetUrl || null,
      fileName: job.fileName,
      folderName: job.folderName,
      error: job.error || null,
      message:
        job.status === "COMPLETED"
          ? `🪪 [${job.ocrData?.name || "명함 고객"}] 명함 AI 분석이 완료되었습니다.`
          : job.status === "FAILED"
          ? "명함 분석에 실패했습니다."
          : "명함 분석이 진행 중입니다...",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
