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
      latestVersionCode: 14,
      latestVersionName: "2.0.3",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.3/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.3 정식 릴리스\n• 🛡️ '고객정보 안심보증' 숨기기(접기/펼치기) 컴팩트 모드 탑재\n• 🟢 가동 상태 카드 슬림 컴팩트화 (화면 여백 최적화)\n• 🏷️ 인앱 모든 모듈 버전 표시 v2.0.3 동기화\n• 🌐 서버 연결 대기 시 경고창 대신 '가동 중 (통신 확인 중)' 친화적 안내로 개선",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
