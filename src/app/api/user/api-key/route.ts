export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getOrCreateUserApiKey, regenerateUserApiKey } from "@/lib/api-keys";

/**
 * GET: 현재 로그인된 회원의 개인 API 키 조회 (미발급 시 자동 생성하여 반환)
 */
export async function GET(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const keyInfo = await getOrCreateUserApiKey(userEmail);

    return NextResponse.json({
      success: true,
      apiKey: keyInfo.apiKey,
      name: keyInfo.name,
      status: keyInfo.status,
      lastUsedAt: keyInfo.lastUsedAt,
      createdAt: keyInfo.createdAt,
    });
  } catch (err: any) {
    console.error("[User API Key GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "API 키 조회 실패" }, { status: 500 });
  }
}

/**
 * POST: 회원의 API 키 재발급 (기존 키 즉시 만료 처리)
 */
export async function POST(request: Request) {
  try {
    const sessionEmail = await getCurrentUserEmail();
    const userEmail = sessionEmail || (process.env.NODE_ENV === "development" ? "test.user@sheetbot.dev" : null);

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    const keyName = body.name || "Default Agent Key";
    const newKey = await regenerateUserApiKey(userEmail, keyName);

    return NextResponse.json({
      success: true,
      apiKey: newKey.apiKey,
      name: newKey.name,
      status: newKey.status,
      createdAt: newKey.createdAt,
      message: "API 키가 성공적으로 재발급되었습니다. 이전 키는 즉시 해지되었습니다.",
    });
  } catch (err: any) {
    console.error("[User API Key POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message || "API 키 재발급 실패" }, { status: 500 });
  }
}
