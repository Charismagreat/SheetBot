export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      latestVersionCode: 1,
      latestVersionName: "1.0.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.0.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 (이용자용) v1.0.0 출시\n• 안드로이드 스마트폰과 구글 스프레드시트 1:1 결합\n• 스마트폰으로 수신된 고객 SMS 구글 시트 실시간 자동 기록\n• 구글 시트에서 0원 문자 일괄 발송\n• 24시간 실시간 무중단 백그라운드 동기화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
