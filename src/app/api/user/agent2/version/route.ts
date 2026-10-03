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
      latestVersionCode: 55,
      latestVersionName: "2.1.34",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.34/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.34 릴리즈\n• 🧾 [영수증 대장 0초 즉시 열기 해결] 영수증/명함 대장 사전 캐싱 및 0초 프리셋 탑재로 지연 없이 즉시 열리도록 개선\n• ⚡ [프로비저닝 Fast-Path 0ms 최적화] 기존 시트 탐색 시 무거운 드라이브 재검색을 생략하고 0초 즉시 반환\n• 📊 [모바일 웹앱 13개 전체 열 완벽 지원] 영수증(13열) 및 명함(11열) 전체 데이터 표시 및 모바일 최적화 웹앱 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
