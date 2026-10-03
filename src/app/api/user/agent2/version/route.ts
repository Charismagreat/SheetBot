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
      latestVersionCode: 59,
      latestVersionName: "2.1.38",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.38/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.38 릴리즈\n• 🛡️ [문자 송수신 다중 중복 기록 원천 차단] 발신 SMS ContentObserver 다중 발화 선점 가드 및 수신/발신 15초 멱등성 디바운싱(SmsDedupeManager) 탑재\n• 📞 [전화번호 국가코드 자동 정규화] 발신/수신 시 8215993333, 8210... 형태의 번호를 1599-3333, 010-... 표준 하이픈 형식으로 자동 정제\n• ⚡ [수신 리시버 및 알림 옵저버 이중 감지 통합] 동일 문자 수신 시 중복 발송 없이 1건만 안전하게 구글 시트에 기록",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
