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
      latestVersionCode: 56,
      latestVersionName: "2.1.35",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.35/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.35 릴리즈\n• 📞 [부재중 전화 대장 중복 기록 원천 차단] 5초 원자적 동시 처리 락(Atomic Lock) 및 정규화 번호 기준 15초 멱등성 가드 탑재\n• 🛡️ [서버 15초 멱등성 2중 방어] 동일 사용자+전화번호 단기간 재인입 시 시트 중복 쓰기 완벽 차단\n• 🔄 [상태 전이 안전망 강화] 링 수신 이력 검증 및 세션 안전 초기화로 단말기 중복 브로드캐스트 방어",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
