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
      latestVersionCode: 22,
      latestVersionName: "2.1.1",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.1/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.1 정식 릴리스\n• 🌐 웹 링크 & 🔴 유튜브 AI 자동 스크랩 설정 카드 디자인 통일 (배경/패딩/라벨 완벽 일치)\n• 👥 문자(SMS) 및 통화 녹음 기록 대상 번호 '연락처에서 추가' 기능 지원\n• 📋 등록 대상 실시간 뱃지 및 대상 관리(개별 제외/삭제, 전체 해제) 팝업 다이얼로그 추가\n• 🟡 카카오톡 기록 대상 관리 및 원클릭 제외 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
