export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { fetchWithCache } from "@/lib/server-cache";

export async function GET(req: NextRequest) {
  try {
    const email = await getCurrentUserEmail();
    if (!email) {
      return NextResponse.json({
        success: true,
        isAdmin: false,
        email: null,
      });
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("refresh") === "true";

    // ⚡ 30초 인메모리 캐시: 같은 유저의 관리자 권한 확인은 30초간 0ms 즉시 반환
    const isAdmin = await fetchWithCache(
      `admin_check_${email.toLowerCase().trim()}`,
      () => isCurrentUserAdmin(email),
      30,
      force
    );

    return NextResponse.json({
      success: true,
      isAdmin,
      email,
    });
  } catch (error: any) {
    console.error("[Admin-Check-API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        isAdmin: false,
        error: error.message || "Failed to check admin role",
      },
      { status: 500 }
    );
  }
}
