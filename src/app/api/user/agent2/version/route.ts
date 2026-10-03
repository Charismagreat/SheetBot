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
      latestVersionCode: 69,
      latestVersionName: "2.1.48",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.48/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.48 릴리즈\n• 🛡️ [ANR '응답하지 않음' 팝업 완전 해결] SMS 수신 시 브로드캐스트 리시버의 생명주기를 즉시 반환하고 영수증 문자 발송을 완전 독립 백그라운드로 분리하여 앱 멈춤 원천 차단\n• ⚡ [실시간 입금 매칭 초고속화] 은행 입금 감지 시 0.5초 이내 주문 매칭 및 영수증 자동 발송\n• 🧪 [영수증 문자 즉시 테스트 도구] 메인 화면에서 원터치로 발송 및 시트 기록 테스트 가능",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
