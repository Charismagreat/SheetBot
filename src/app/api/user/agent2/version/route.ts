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
      latestVersionCode: 50,
      latestVersionName: "2.1.29",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.29/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.29 릴리즈\n• ⚡ [통화 녹음 및 파일 고속 터널 전송] 터널 소켓 블로킹 없는 Base64 JSON 초고속 파이프라인 탑재\n• ☁️ [구글 드라이브 및 구글 시트 100% 무손실 동기화] 녹음 파일 업로드 및 링크 자동 기록 안정화\n• 🎙️ [통화 녹음 감지 진단성 극대화] 발견된 파일 수 및 전송 상태 실시간 표시",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
