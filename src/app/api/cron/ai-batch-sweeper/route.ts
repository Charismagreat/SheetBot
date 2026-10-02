import { NextRequest, NextResponse } from "next/server";
import { processPendingBatchJobs } from "@/lib/ai-batch-sweeper";
import { setupDatabase } from "@/lib/setup-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const result = await processPendingBatchJobs();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
