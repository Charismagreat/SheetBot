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
      latestVersionCode: 30,
      latestVersionName: "2.1.9",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.9/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.9 릴리스\n• 📜 [실시간 감지 로그 전용 부드러운 독립 스크롤 탑재] 부모 화면 간섭 없이 로그창 내부만 매끄럽게 상하 스크롤 지원\n• 💾 [최대 1,000건 로컬 영구 보관] 앱 재시작 후에도 이전 감지 로그 100% 안전 유지\n• 🗑️ [원클릭 로그 비우기] 확인 팝업을 거친 안전한 초기화 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
