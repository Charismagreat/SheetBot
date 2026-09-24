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
      latestVersionCode: 4,
      latestVersionName: "1.2.0",
      apkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/SheetBot/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.2.0\n• 미발송 영수증 대기열(Outbox Queue) 자동 회신 기능 탑재\n• 백그라운드 3분 주기 미발송 영수증 자동 발송\n• [미발송 영수증 즉시 발송] 수동 동기화 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
