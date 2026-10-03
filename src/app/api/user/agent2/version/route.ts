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
      latestVersionCode: 57,
      latestVersionName: "2.1.36",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.36/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.36 릴리즈\n• 💳 [카카오페이 & 카카오뱅크 송금/결제 대장 연동 완벽 지원] 카카오페이 앱 푸시 및 카카오톡 금융 알림톡 감지 엔진 탑재\n• 📊 [매출 vs 지출 자동 분류] 송금/결제는 '지출(계좌/카드)', 입금/충전은 '매출(계좌)'로 [SheetBot] 매장 결제 및 매출 대장에 실시간 자동 기록\n• 🎯 [가맹점 및 송금대상자 핀포인트 추출] 스타벅스, 배민, 송금 상대방 이름 및 계좌/카드 마스킹 번호 정밀 파싱",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
