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
      latestVersionCode: 27,
      latestVersionName: "2.1.6",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.6/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.6 릴리스\n• 🌐 [웹사이트 실시간 장애 감시 (Uptime Sentinel)] 내 홈페이지/쇼핑몰 다운타임 실시간 감지 & 새벽 긴급 비상 경보 탑재\n• 🛡️ [오탐 방지 교차 검증] 스마트폰 인터넷 정상 여부 자동 확인으로 가짜 알람 원천 차단\n• 🔕 [조용한 오프라인 전환] 시트봇 서버 점검/지연 시 불필요한 비상 사이렌 제거 및 조용한 오프라인 모드 적용\n• ⚡ [즉시 점검] 등록한 웹사이트 응답 속도 및 HTTP 상태 실시간 원터치 점검 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
