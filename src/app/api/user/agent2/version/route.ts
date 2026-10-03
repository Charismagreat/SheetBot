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
      latestVersionCode: 63,
      latestVersionName: "2.1.42",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.42/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.42 릴리즈\n• 📲 [일반 수신 SMS 문자 영수증 발송 연동] 은행/통신사 Web발신 입금 문자 수신 시에도 스마트 간편 주문과 일치하면 영수증 문자(SMS) 즉시 자동 발송\n• 🎯 [고객명 & 금액 100% 매칭] 문자 및 푸시의 입금자명과 스마트 간편 주문 대장의 고객명/금액 자동 대조\n• ⚡ [안정성 강화] SMS 수신 시 주문 대장 결제완료 자동 갱신 및 실시간 영수증 대장 동기화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
