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
      latestVersionCode: 36,
      latestVersionName: "2.1.15",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.15/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.15 릴리즈\n• 📱 [고객 주도형 스마트 셀프 견적 & 1초 주문 웹앱 연동] 메인 화면 [내 견적 웹앱 열기] 및 [주문 링크 복사] 원터치 버튼 탑재\n• 🔗 [원클릭 고객 공유] 카카오톡 및 문자로 고객 전용 주문 링크를 1초 만에 전송하여 모바일에서 실시간 견적 산출 및 자동 예약 접수 지원\n• ⚡ [실시간 연동] 고객 주문 접수 시 구글 시트 견적발급대장 자동 기록 및 스마트폰 알림 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
