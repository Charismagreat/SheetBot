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
      latestVersionCode: 31,
      latestVersionName: "2.1.10",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.10/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.10 핫픽스 릴리스\n• 🛡️ [앱 실행 즉각 크래시 긴급 차단 및 100% 정상화] 중첩 스크롤 컨테이너를 제거하고 가벼운 순수 TextView 내장 스크롤 엔진으로 전면 교체하여 튕김 현상 원천 방어\n• 📜 [부드러운 전용 스크롤 유지] 부모 화면 간섭 없이 실시간 감지 로그 영역만 매끄럽게 상하 스크롤 보장\n• 💾 [최대 1,000건 로컬 영구 보관] 앱 재시작 후에도 이전 감지 로그 100% 안전 유지\n• 🗑️ [원클릭 로그 비우기] 확인 팝업을 거친 안전한 초기화 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
