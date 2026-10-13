export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { setupDatabase } from "@/lib/setup-db";
import { handleRuntimeCall, type RuntimeCallBody } from "@/lib/runtime/runtime-call-service";
import { SheetbotServiceError, sheetbotErrorResponse } from "@/lib/wrapping/sheetbot-api-error";

/**
 * Sheet runtime MCP proxy (Phase 6-lite).
 * Auth: Bearer `rt_*` + `scriptId` binding; billing via manifest + wallet.
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = (await req.json()) as RuntimeCallBody;
    const result = await handleRuntimeCall(req, body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof SheetbotServiceError) {
      return sheetbotErrorResponse(err.apiError);
    }
    console.error("[runtime/call]", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Runtime call failed",
          httpStatus: 500,
        },
      },
      { status: 500 },
    );
  }
}
