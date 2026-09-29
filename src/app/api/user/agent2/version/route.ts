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
      latestVersionCode: 39,
      latestVersionName: "2.1.18",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.18/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.18 릴리즈\n• 📷 [카톡 공유 대표 이미지 등록] 카카오톡 카드 상단에 노출될 매장 로고 및 대표 사진을 스마트폰 갤러리에서 바로 선택하여 업로드 및 실시간 연동\n• 🌐 [웹+모바일 양방향 동기화] PC 웹 대시보드와 스마트폰 앱 양쪽에서 대표 썸네일 이미지 및 상호명 실시간 관리 지원\n• ✨ [공유 카드 비주얼 최적화] 카카오톡 미리보기 카드에 사장님 지정 상호명([상호명]) 및 전용 대표 썸네일 자동 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
