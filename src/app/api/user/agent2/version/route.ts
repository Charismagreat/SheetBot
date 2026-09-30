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
      latestVersionCode: 45,
      latestVersionName: "2.1.24",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.24/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.24 릴리즈\n• 📊 [스마트 간편 주문 대장 연동 정상화] 주문접수대장 탭(gid=1021826080) 직행 및 구버전 시트 캐시 자동 무효화\n• 🖼️ [대표 사진 로고 무결점 지원] 상대 경로 정규화 및 이미지 엑박 방지 폴백 탑재\n• 🌐 [공용 터널 및 실시간 동기화 안정화] 0초 반응형 스프레드시트 양방향 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
