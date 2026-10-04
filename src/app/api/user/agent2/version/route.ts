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
      latestVersionCode: 75,
      latestVersionName: "2.1.54",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.54/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.54 릴리즈\n• 🗂️ [단일 통합 접이식 카드 전면 개편] 기존 3개의 분산 카드를 하나로 통합하고, 한 줄의 슬림한 카드로 언제든 접거나 펼칠 수 있도록 최적화\n• 🛡️ [개인정보 100% 안전 보증 안내 탑재] 시트봇 서버 무보관 100% 원칙 및 개인 구글 계정 전송 보증을 공식 명시\n• 🚀 [화면 공간 극대화] 불필요한 추천 카드를 정리하고 시트봇 관제 센터 바로가기와 통합하여 최적의 모바일 가독성 제공",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
