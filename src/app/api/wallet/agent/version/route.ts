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
      latestVersionCode: 8,
      latestVersionName: "1.5.1",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.5.1/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.5.1 (긴급 알람 사운드 강화)\n• 화면 꺼짐 & 잠금 상태에서도 TTS 음성 100% 강제 출력 보장\n• 미디어 볼륨 대신 알람 볼륨(USAGE_ALARM) 강제 적용 (무음/진동 모드 뚫고 발화)\n• TTS 발화 직전 비상 사이렌 비프 1초 선행 재생으로 오디오 하드웨어 즉각 점등\n• 백그라운드 절전 슬립 방지용 Partial WakeLock 동시 획득",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
