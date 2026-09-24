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
      latestVersionCode: 11,
      latestVersionName: "1.6.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.6.0/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 v1.6.0 (유니버설 에이전트 통합 & 0원 양방향 SMS 지원)\n• 단일 유니버설 APK: 이용자용 SheetBot Agent 및 관리자용 SheetBot Agent M 자동 전환\n• 이용자 모드: 고객 수신 SMS 시트봇 및 구글 시트 실시간 동기화\n• 0원 문자 발송 및 1:1 페어링 완벽 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
