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
      latestVersionCode: 58,
      latestVersionName: "2.1.37",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.37/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.37 릴리즈\n• 💳 [카카오페이 공식 앱 실시간 연동 100% 보장] 카카오페이(com.kakao.kakaopay) 및 사장님플러스(com.kakaopay.biz) 앱 패키지 정밀 등록\n• 💸 [카카오페이 송금 및 수취인 핀포인트 추출] 'OOO님에게 5,000원을 보냈어요', '5,000원 송금 완료' 등 송금 시 수취인 및 금액 정밀 파싱\n• ⚡ [카카오톡 금융 알림톡 최우선 독립 감지] 일반 카톡 대화 시트 동기화 스위치와 무관하게 카카오페이/카카오뱅크 금융 알림톡 즉시 매장 대장 직행 전송",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
