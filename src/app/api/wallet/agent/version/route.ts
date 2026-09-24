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
      latestVersionCode: 9,
      latestVersionName: "1.5.2",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.5.2/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.5.2 (글로벌 GitHub API 직통 업데이트 보장)\n• sheetbot.cloud 서버가 꺼져 있어도 GitHub Releases API로 최신 버전 직통 감지\n• 서버 다운/점검 중에도 0초 만에 인앱 원클릭 덮어쓰기 업데이트 100% 보장\n• 버전 문자열 정밀 비교 알고리즘 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
