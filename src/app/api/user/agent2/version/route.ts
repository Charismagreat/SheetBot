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
      latestVersionCode: 37,
      latestVersionName: "2.1.16",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.16/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.16 릴리즈\n• 🏢 [상호명/브랜드명 실시간 변경 지원] 스마트 견적 대장 연동 카드에서 사장님 상호명 입력 시 모바일 고객 견적/주문 웹앱 상단 헤더에 0초 만에 실시간 반영\n• 📱 [스마트 셀프 견적 & 1초 주문 웹앱 최적화] 고객이 견적 링크 확인 시 정식 상호명 노출로 신뢰도 극대화\n• 🔄 [양방향 동기화] 스마트폰 앱과 시트봇 클라우드 간 상호명 자동 동기화 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
