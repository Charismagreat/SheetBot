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
      latestVersionCode: 19,
      latestVersionName: "2.0.8",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.8/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.8 정식 릴리스\n• 🚀 구글 드라이브 파일 업로드 엔진 최적화 (API 파라미터 교정 및 대용량 파일 전송 60초 타임아웃 보장)\n• 🔴 유튜브 영상 & 웹 링크 공유(Share) 자동 스크랩 정상화 (인텐트 라우팅 교정 및 시트 실시간 기입)\n• 🧠 사이트 환경설정에서 이용자가 선택한 AI 모델(Gemini 2.5 Flash 등) 우선 적용 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
