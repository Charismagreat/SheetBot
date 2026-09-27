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
      latestVersionCode: 21,
      latestVersionName: "2.1.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.0 정식 릴리스\n• 🌐 웹 링크 & 🔴 유튜브 AI 자동 스크랩 전용 On/Off 설정 카드 신설\n• 🗑️ 계정 연동 해제 문구 ➔ '계정 삭제'로 직관적 개편 (버튼 및 안내창)\n• ⚡ 모든 기능 스위치 On/Off 및 입력창 텍스트 실시간 자동 저장(Auto-Save) 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
