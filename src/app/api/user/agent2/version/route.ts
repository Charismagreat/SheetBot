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
      latestVersionCode: 25,
      latestVersionName: "2.1.4",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.4/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.4 정식 릴리스\n• 🚀 [혁신 UX] 시트명/폴더명 입력창을 원터치 바로가기 뱃지로 전면 개편\n• 🌐 [2가지 열기 모드] 뱃지 탭 시 [📊 구글 시트 원본 열기] vs [📱 모바일 스마트 웹앱 열기] 지원\n• 📁 [드라이브 폴더 열기] 통화 녹음 및 파일 보관함 구글 드라이브 폴더 1초 만에 바로가기\n• ⚡ 모든 기능 스위치 ON 시 드라이브 폴더 및 구글 시트 대장 즉시 선제 생성\n• 🏷️ 상단 및 코파일럿 버전 표기 실시간 동적 바인딩(v2.1.4)",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
