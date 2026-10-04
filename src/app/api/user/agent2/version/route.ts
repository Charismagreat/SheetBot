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
      latestVersionCode: 78,
      latestVersionName: "2.1.57",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.57/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.57 릴리즈\n• 🪟 [화면 중앙 최상단 팝업 다이얼로그 신설] 통화 종료 시 다른 앱(T전화, 기본 전화 앱 종료 화면)에 절대 가려지지 않도록 화면 중앙에 선명한 모바일 명함 발송 팝업창 직접 표출\n• 🔔 [상단 배너 헤즈업 팝업 & 원터치 터치 연동] FullScreenIntent 및 전용 알림 채널 분리로 상단 배너 헤즈업 알림 강제 표시 및 상단 알림 뱃지 터치 시에도 즉시 팝업창 오픈\n• ⏱️ [15초 스마트 자동 닫힘] 팝업창 방해를 방지하기 위해 15초 카운트다운 후 자동 닫힘 타이머 탑재\n• 🚀 [원터치 발송 & 시트 기록] 팝업창의 '지금 바로 모바일 명함 보내기' 터치 한 번으로 SMS/MMS 발송과 구글 시트 대장 자동 기록 동시 수행",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
