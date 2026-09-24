export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/wallet/agent/version
 * 시트봇 에이전트 M 앱의 최신 버전 정보 및 원클릭 업데이트 APK 다운로드 링크 제공
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      latestVersionCode: 6,
      latestVersionName: "1.4.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.4.0/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.4.0 (Phase 3)\n• 전원 충전기 분리/연결 감지 & 배터리 방전 비상 경보\n• 대시보드 실시간 배터리 잔량(%) 및 충전 상태(⚡) 시각화\n• 3회 연속 실패 시 와치독 비상 알림 & 자동 복구\n• OLED 번인 & 발열 방지 AOD 블랙 스크린 모드 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
