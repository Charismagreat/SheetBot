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
      latestVersionCode: 26,
      latestVersionName: "2.1.5",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.5/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.5 릴리스\n• ⚡ [시트 열기 즉각 반응] 대장 시트 열기 시 생성 대기 지연 없이 확인 즉시 브라우저/웹앱 자동 실행\n• 🔄 [사전 캐싱 최적화] 앱 실행 시 활성화된 기능의 대장 시트 URL을 백그라운드에서 선제 동기화\n• 📁 [드라이브 폴더 직행] 폴더 열기 시 구글 드라이브 보관함 폴더로 1초 만에 바로가기\n• 📊 구글 스프레드시트 원본 및 모바일 스마트 웹앱 열기 경험 개선",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
