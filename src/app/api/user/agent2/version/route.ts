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
      latestVersionCode: 61,
      latestVersionName: "2.1.40",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.40/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.40 릴리즈\n• 🔔 [알림 문구 개선] 결제/송금 감지 알림 제목을 '결제 및 매출 대장 기록 완료!'로 명확화\n• ⚡ [최신 APK 자동 리다이렉트] 인앱 업데이트 및 웹 다운로드 시 항상 최신 정식 버전으로 원클릭 덮어쓰기 지원\n• 🛡️ [카카오페이 송금 지원 강화] 마스킹 수취인 및 계좌 송금 완벽 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
