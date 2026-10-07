export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getEstimateCatalogData } from "@/lib/estimate-catalog-helper";
import { getCurrentUserEmail } from "@/lib/auth";

/**
 * GET /api/user/estimate/catalog
 * 간편 견적 단가표 및 사업자 정보 조회
 * Query: userKey, userEmail, isRefresh
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userKey = searchParams.get("userKey");
    const directEmail = searchParams.get("userEmail");
    const isRefresh = searchParams.get("isRefresh") === "true";

    let emailToUse = directEmail;
    if (!emailToUse && !userKey) {
      emailToUse = await getCurrentUserEmail(req).catch(() => null);
    }

    const data = await getEstimateCatalogData({
      userKey,
      directEmail: emailToUse,
      isRefresh,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[EstimateCatalogAPI] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load estimate catalog" },
      { status: 500 }
    );
  }
}
