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
      latestVersionCode: 79,
      latestVersionName: "2.1.58",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.58/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.58 릴리즈\n• 💼 [상단 알림 버튼 클릭 시 명함 화면 즉시 전환] 통화 종료 후 상단 알림에서 [모바일 명함 보내기] 버튼을 누르면 시트봇 명함 확인 화면으로 즉시 전환되어 내용을 직접 확인하고 안전하게 전송 가능\n• ❌ [상단 알림 닫기 버튼 추가] 알림에 [닫기] 액션을 추가하여 원치 않을 때 알림을 즉시 제거 가능\n• 🧹 [화면 진입 시 알림 자동 정리] 명함 확인 창이 뜨면 상단 알림이 자동으로 닫혀 알림 바가 깔끔하게 유지됨",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
