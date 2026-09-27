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
      latestVersionCode: 13,
      latestVersionName: "2.0.2",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.2/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.2 정식 릴리스\n• 🛡️ Zero-Retention 프라이버시 안심 보증 카드 탑재 (서버 무보관 100% · 고객 본인 구글 드라이브에만 안전 저장)\n• 📱 시트봇 모바일 에이전트 브랜딩 일원화 (구글 시트 ↔ 스마트폰 양방향 자동화)\n• 🏪 포스(POS) 및 배달앱(배민/쿠팡이츠) 결제 알림 실시간 시트 기입 지원\n• ⚡ 0원 무제한 고객 알림 문자 발송 및 수신 동기화 안정성 개선",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
