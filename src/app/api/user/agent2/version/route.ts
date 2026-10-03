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
      latestVersionCode: 62,
      latestVersionName: "2.1.41",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.41/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.41 릴리즈\n• 🎯 [스마트 간편 주문 영수증 자동 발송] 스마트 간편 주문 및 품목 대장의 고객명과 입금 금액 일치 시 영수증 문자(SMS) 자동 발송 연동\n• 💬 [영수증 문구 동적 치환 최적화] 실제 고객명과 결제 금액을 맞춤 템플릿에 실시간 자동 대입\n• 🔔 [카카오 금융 알림톡 영수증 연동] 카카오페이/카카오뱅크 알림톡 수신 시에도 영수증 SMS 및 음성 안내 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
