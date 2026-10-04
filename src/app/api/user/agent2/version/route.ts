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
      latestVersionCode: 81,
      latestVersionName: "2.1.60",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.60/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.60 릴리즈\n• 🟡 [카카오톡 메시지 2중 기록 완벽 차단] 안드로이드 헤즈업 팝업 닫힘 및 알림창 갱신 시 발생하는 6초 중복 이벤트를 15초 멱등성 디바운싱(앱+서버 2단 방어)으로 완벽 차단하여 시트에 단 1회만 깔끔하게 기록",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
