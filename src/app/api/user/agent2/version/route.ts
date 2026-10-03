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
      latestVersionCode: 52,
      latestVersionName: "2.1.31",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.31/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.31 릴리즈\n• 🪪 [명함 자동 인맥 등록] 명함 대장 등록 시 스마트폰 연락처 자동 저장 & 내 모바일 명함 즉시 발송 승인 팝업 탑재\n• 🖼️ [모바일 명함 MMS 방안 2 유지 개선] 갤러리 명함 사진 등록 후 앱 복귀 시 방안 1로 리셋되던 현상 완벽 해결\n• ⚡ [명함 실시간 AI 가속] 3~5초 이내 초고속 시트 장부화 및 연락처 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
