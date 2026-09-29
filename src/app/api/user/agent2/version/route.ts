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
      latestVersionCode: 38,
      latestVersionName: "2.1.17",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.17/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.17 릴리즈\n• 🛡️ [고객 웹앱 환경 최적화] 고객 전용 견적/주문 페이지(/order/*)에서 내부 관리용 시트봇 AI 챗봇 및 푸터 노출 완벽 차단\n• 🏢 [상호명 실시간 반영 강화] 상호명 입력창 옆 [저장] 전용 버튼 및 키보드 엔터 즉시 저장 탑재, 이메일 아이디 노출 100% 원천 방어\n• ⚡ [멀티 티어 저장소 동기화] sheetbot_settings와 sheetbot_users 2중 보존으로 상호명 누락 없는 즉시 반영 보장",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
