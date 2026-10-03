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
      latestVersionCode: 66,
      latestVersionName: "2.1.45",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.45/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.45 릴리즈\n• 🚀 [수신 SMS 영수증 문자 발송 버그 긴급 해결] 문자 시트 동기화 옵션 OFF 상태에서도 스마트 주문 매칭 응답(replySms)을 100% 정상 수신하여 영수증 문자 즉시 발송\n• 📝 [앱 영수증 템플릿 최우선 적용] 모바일 앱 설정의 '고객 발송 영수증 문구 템플릿' 1순위 반영\n• ✂️ [80B 초과 글자수 정밀 자동 제거] EUC-KR 80바이트 초과 글자수를 한글 깨짐 없이 안전하게 제거하여 단문 100% 발송 보장",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
