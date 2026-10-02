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
      latestVersionCode: 48,
      latestVersionName: "2.1.27",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.27/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.27 릴리즈\n• 📁 [안드로이드 11+ 모든 파일 접근 권한 탑재] 에이닷(A.), T전화 등 서드파티 통화 녹음 파일 스캔 및 드라이브 백업 100% 무결점 지원\n• ⚡ [즉시 동기화 정밀 피드백] 신규 업로드 건수 및 기백업 파일 감지 결과 정밀 안내\n• 🔄 [전체 강제 재동기화 지원] '즉시 동기화' 버튼 길게 누름(롱클릭) 시 기존 녹음 전체 재업로드 기능 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
