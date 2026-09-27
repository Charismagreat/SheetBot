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
      latestVersionCode: 16,
      latestVersionName: "2.0.5",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.5/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.5 정식 릴리스\n• 🪙 토큰 잔액 로컬 캐시 즉시 표시 (0원 표시 현상 완전 해결)\n• 💡 AI 코파일럿 불필요 문구 삭제 및 토큰 안내 확인(접기)/자세히 보기 토글 탑재\n• 🛡️ 토큰 소량 차감 및 기본 자동화 100% 무료 안내 배너 문구 고도화\n• 📝 자연어 입력창 여러 줄 자동 확장 (입력 길이에 따라 최대 6줄까지 자동 확장)",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
