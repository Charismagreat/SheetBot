export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const email = await getCurrentUserEmail();
    if (!email) {
      return NextResponse.json({
        success: true,
        isAdmin: false,
        email: null,
      });
    }

    const isAdmin = await isCurrentUserAdmin(email);

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
