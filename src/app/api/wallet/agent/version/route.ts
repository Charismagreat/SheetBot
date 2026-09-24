export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/wallet/agent/version
 * 시트봇 에이전트 M 앱의 최신 버전 정보 및 원클릭 업데이트 APK 다운로드 링크 제공
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      latestVersionCode: 3,
      latestVersionName: "1.1.0",
      apkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.1.0\n• 입금 확인 시 고객에게 0원 영수증 SMS 자동 회신\n• 실시간 TTS 음성 안내 탑재\n• 인앱 원클릭 자동 덮어쓰기 업데이트 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
