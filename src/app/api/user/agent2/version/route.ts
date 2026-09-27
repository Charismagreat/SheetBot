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
      latestVersionCode: 23,
      latestVersionName: "2.1.2",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.2/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.2 정식 릴리스\n• 🛡️ 신규 설치 시 기능 기본 꺼짐(Default OFF) 전환으로 완전한 사용자 주도권(Opt-in) 보장\n• ⚡ 기능 스위치 ON 시 구글 스프레드시트 대장 및 헤더 즉시 자동 생성(Eager Provisioning)\n• 👥 문자/통화녹음 기록 대상 주소록(연락처) 선택 및 대상 관리(개별 제외/전체 해제) 다이얼로그 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
