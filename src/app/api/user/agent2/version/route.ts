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
      latestVersionCode: 2,
      latestVersionName: "1.1.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.1.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v1.1.0 업데이트\n• 🎙️ 통화 녹음 파일 구글 드라이브 자동 백업 추가\n• 🎯 지정된 번호/이름 필터링 선택 백업 기능\n• 📁 [SheetBot] 표준 네이밍 폴더 자동 생성\n• 📊 [SheetBot] 통화 녹음 대장 시트 자동 생성 및 실시간 링크 기록\n• 백그라운드 문자 발송 반응 주기 대폭 단축 (20초)",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
