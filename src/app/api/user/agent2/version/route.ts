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
      latestVersionCode: 35,
      latestVersionName: "2.1.14",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.14/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.14 긴급 안정화 패치\n• 🛡️ [글로벌 크래시 방어벽 구축] SheetBotApp Application 클래스 및 전역 미처리 예외 핸들러 탑재로 앱 비정상 종료 완벽 차단\n• ⚡ [코루틴 스코프 안전성 강화] SupervisorJob 및 비동기 예외 격리 적용으로 통신 지연/오류 시 프로세스 크래시 원천 방지\n• 🔄 [라이프사이클 전방위 보호] onResume, onDestroy 및 백그라운드 사전 캐싱 전면 안전 가드 적용\n• 📑 [AI 스마트 견적 & 단가표 대장 연동 스위치 탑재] 메인 화면에서 원클릭으로 구글 시트 단가표 및 견적발급대장 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
