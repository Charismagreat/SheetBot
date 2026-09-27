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
      latestVersionCode: 20,
      latestVersionName: "2.0.9",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.9/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.9 정식 릴리스\n• 🔗 구글 스프레드시트 고유 ID 영구 바인딩 (구글 드라이브에서 시트 파일명을 수정해도 100% 지속 연동)\n• 🧹 화면 내 6개 [설정 저장] 버튼 완전 삭제 및 슬림화\n• ⚡ 모든 기능 스위치 On/Off 및 입력창 텍스트 변경 시 실시간 자동 저장(Auto-Save) 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
