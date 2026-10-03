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
      latestVersionCode: 71,
      latestVersionName: "2.1.50",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.50/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.50 릴리즈\n• ⚡ [실시간 주문 매칭 0.5초 초고속화] 입금 감지 시 구글 시트 상태 갱신을 비동기 Zero-Block으로 위임하여 단말기 네트워크 타임아웃 원천 차단 및 영수증 문자 즉시 발송 보장\n• 🔍 [5단계 진단 도구 고유화 및 2중 폴백] 가상 입금 문자 고유 타임스탬프 적용으로 15초 중복 방어 필터 회피 및 엔드포인트 2중 폴백 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
