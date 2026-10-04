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
      latestVersionCode: 80,
      latestVersionName: "2.1.59",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.59/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.59 릴리즈\n• 💳 [결제 확인 & 영수증 카드 크기 통일] 다른 스마트 규칙 카드들과 상하 높이 및 상단 구분선 디자인을 100% 일치시켜 깔끔하고 통일된 카드 UI 제공",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
