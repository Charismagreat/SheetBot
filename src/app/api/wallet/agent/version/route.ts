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
      latestVersionCode: 5,
      latestVersionName: "1.3.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.3.0/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.3.0 (Phase 2)\n• 주요 7대 금융사(카카오뱅크/토스/국민/신한/우리/하나/기업 등) 무료 앱 푸시 실시간 감지\n• 은행 유료 SMS 없이 0원 입금 자동 확인\n• 알림 접근 권한 원클릭 가이드 & 가상 푸시 테스트 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
