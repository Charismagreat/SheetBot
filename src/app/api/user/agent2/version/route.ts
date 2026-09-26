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
      latestVersionCode: 3,
      latestVersionName: "1.2.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.2.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v1.2.0 업데이트\n• 📁 스마트폰 사진 & 문서 구글 드라이브 보관함 자동 업로드\n• ⚡ 갤러리/파일 탐색기 [공유] ➡️ [SheetBot Agent] 1초 원클릭 업로드 지원\n• 📷/📁 앱 내 사진 & 파일 직접 선택 업로드 버튼 지원\n• 📁 구글 드라이브 [SheetBot] 폴더 자동 생성\n• 📊 [SheetBot] 파일 업로드 대장 시트 실시간 자동 기록\n• 🎙️ 통화 녹음 파일 구글 드라이브 백업 기능 안정화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
