export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { searchCompanyCandidates } from "@/lib/egdesk-helpers";

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { companyName } = body;

    if (!companyName || companyName.trim().length < 2) {
      return NextResponse.json({ success: true, candidates: [] });
    }

    const candidates = await searchCompanyCandidates(companyName.trim(), 6);
    return NextResponse.json({ success: true, candidates });
  } catch (err: any) {
    console.error("[Company Candidates API Error]:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
