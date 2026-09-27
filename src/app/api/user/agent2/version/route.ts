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
      latestVersionCode: 15,
      latestVersionName: "2.0.4",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.4/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.4 정식 릴리스\n• 🛡️ 안심보증 카드 '접기/펼치기' 원터치 버튼 전환\n• 🟢 가동 상태 & 서버 통신 단일 통합 카드 구성 및 접기/펼치기 지원\n• 💡 AI 코파일럿 카드 투명한 토큰 안내 & 다른 기능 평생 100% 무료(0원) 보장 배너 탑재\n• 📱 UI 컴팩트화 및 불필요한 중복 카드 완전 제거",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
