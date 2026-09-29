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
      latestVersionCode: 43,
      latestVersionName: "2.1.22",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.22/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.22 릴리즈\n• 🛡️ [공유하기 중복 등록 원천 차단] 웹 링크 및 유튜브 공유 시 10초 이내 중복 전송 방지 및 인텐트 소진(Deduplication)\n• ⏰ [한국 표준시(KST) 100% 일치] 모든 대장 등록 시간을 한국 시간(UTC+9)으로 정확하게 기록\n• ⚡ [2단계 비동기 분석 보장] 0.1초 즉시 시트 선행 기록 후 AI 3줄 요약 정확한 행(F열) 인플레이스 자동 갱신\n• 📁 [무손실 구글 드라이브 파일 업로드 브릿지] 원격 및 로컬 환경 파일 업로드 전송 오류 완전 해결",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
