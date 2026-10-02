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
      latestVersionCode: 51,
      latestVersionName: "2.1.30",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.30/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.30 릴리즈\n• 📞 [통화 종료 즉시 자동 업로드] 통화 종료 시 3.5초 후 구글 드라이브 및 시트 대장 자동 백업\n• 📶 [Wi-Fi 전용 업로드 모드] 모바일 데이터(LTE/5G) 절약을 위한 Wi-Fi 전용 전송 옵션 제공\n• 🛡️ [숨김 및 휴지통 파일 제외 필터] 임시(.pending) 및 시스템 휴지통 파일 업로드 방지\n• ⚡ [Gemini Batch 파이프라인] 통화 녹음 AI 전사 및 요약 비용 50% 절감 적용",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
