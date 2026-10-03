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
      latestVersionCode: 53,
      latestVersionName: "2.1.32",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.32/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.32 릴리즈\n• 📞 [부재중 전화 대장 완벽 기록] Android 9+ 통화 기록 권한(READ_CALL_LOG) 및 CallLog Fallback 안전망 탑재로 부재중 전화 100% 감지 및 구글 시트 대장 자동 기록\n• 📊 [부재중 시트 열 순서 정렬] 발신 번호, 연락처 이름, 자동 회신 내용, 회신 상태 표준 6대 열 순서 완벽 일치화\n• 🛡️ [15초 멱등성 가드] 통화 끊김 시 동일 번호 중복 적재 원천 차단",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
