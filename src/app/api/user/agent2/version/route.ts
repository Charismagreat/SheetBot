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
      latestVersionCode: 29,
      latestVersionName: "2.1.8",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.8/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.8 릴리스\n• 📊 [구글 시트 헤더 및 다크 서식 완벽 반영] 시트 생성 시 1행 7개 헤더 및 다크 서식 100% 자동 주입\n• 🚀 [대장 열기 무한 대기 방어] 프로비저닝 응답 대기 시 다이얼로그 닫기 지원 및 25초 타임아웃 안전망 구축\n• ⚡ [0초 즉시 오픈 강화] SharedPreferences 캐시 즉시 연동 및 구글 드라이브 바인딩 안정화\n• 🛡️ [웹사이트 장애 감시 센티널] 24시간 실시간 무중단 장애 감시 및 시트 자동 로깅",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
