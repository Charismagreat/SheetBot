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
      latestVersionCode: 73,
      latestVersionName: "2.1.52",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.52/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.52 릴리즈\n• ⚡ [안드로이드 시스템 ANR 팝업 원천 차단] SMS 수신 시 브로드캐스트 대기(goAsync)를 전면 제거하고 0초 즉각 반환 처리하여 '앱이 응답하지 않음' 시스템 오류 100% 해소\n• ✉️ [영수증 문자 무중단 발송] 입금 확인 즉시 백그라운드 코루틴에서 고객 영수증 문자가 안정적으로 자동 발송되도록 파이프라인 최적화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
