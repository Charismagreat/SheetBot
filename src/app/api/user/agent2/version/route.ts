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
      latestVersionCode: 5,
      latestVersionName: "1.4.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.4.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v1.4.0 업데이트\n• 🎙️ 통화 녹음 AI 음성 전사(STT) & 3줄 요약 & Action Items 자동 추출\n• 📞 부재중 전화 감지 시 0원 스마트 안내 문자 자동 회신\n• 📊 [SheetBot] 부재중 전화 대장 구글 시트 실시간 자동 기록\n• 💼 통화 종료 직후 모바일 명함 원터치 발송 지원\n• 💬 문자 송수신 및 카카오톡 대화 구글 시트 자동 기록 안정화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
