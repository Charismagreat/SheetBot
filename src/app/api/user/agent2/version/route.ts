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
      latestVersionCode: 28,
      latestVersionName: "2.1.7",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.7/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.7 릴리스\n• 📊 [웹사이트 장애 대장 시트 자동 생성] 감시 스위치 ON 즉시 구글 시트에 [웹사이트 모니터링 & 장애 대장] 자동 바인딩\n• ⚡ [대장 시트 즉시 열기] 앱 화면에서 원클릭으로 구글 시트 원본 또는 모바일 스마트 웹앱 즉시 열기\n• 📝 [장애/복구 이력 자동 기록] 서버 다운 및 정상 복구 시각, 응답 속도, HTTP 상태 실시간 로깅\n• 🛡️ [오탐 방지 교차 검증] 폰 인터넷 정상 확인 후 실제 다운타임만 감지",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
