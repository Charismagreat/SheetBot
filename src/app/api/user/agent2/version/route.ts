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
      latestVersionCode: 72,
      latestVersionName: "2.1.51",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.51/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.51 릴리즈\n• 🛡️ [영수증 대장 2중 기록 완전 해결] 영수증 대장 동기화에 30초 멱등성 중복 방어(Deduplication Guard) 필터를 탑재하고 단말기 타임아웃을 60초로 확장하여, 네트워크 재시도로 인한 시트 2행 중복 적재를 100% 원천 차단",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
