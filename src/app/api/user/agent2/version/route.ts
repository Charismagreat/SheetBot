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
      latestVersionCode: 54,
      latestVersionName: "2.1.33",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.33/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.33 릴리즈\n• 🧾 [스마트 경비 영수증 대장 열기] 모바일 앱에서 영수증 대장 시트 및 모바일 최적화 웹앱 원터치 바로가기 버튼 탑재\n• 🪪 [스마트 명함 관리 대장 열기] 모바일 앱에서 명함 대장 시트 및 모바일 웹앱 원터치 바로가기 버튼 탑재\n• 📂 [클라우드 프로비저닝 완벽 연동] 구글 드라이브 영수증·명함 전용 보관함 및 탭 자동 생성 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
