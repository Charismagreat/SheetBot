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
      latestVersionCode: 46,
      latestVersionName: "2.1.25",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.25/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.25 릴리즈\n• 📷 [대표 사진 영구 로컬 캐싱 완비] 앱 재실행/화면 이동 시에도 등록된 사진이 사라지지 않고 0초 즉각 유지\n• ⚡ [0초 실시간 렌더링] 사진 선택 즉시 화면에 바로 띄우고 백그라운드 클라우드 동기화 수행\n• 🌐 [오프라인/네트워크 무결점 방어] 통신 지연 시에도 기기 내부 저장소에 안전하게 영구 보존",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
