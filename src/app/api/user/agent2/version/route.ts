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
      latestVersionCode: 17,
      latestVersionName: "2.0.6",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.6/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.6 정식 릴리스\n• 🧹 불필요한 '오프라인 대기열 서버 전송' 버튼 완전 삭제 (백그라운드 100% 자동화)\n• ⚙️ '계정 연동 해제' 버튼을 화면 최하단 위험 구역(Danger Zone)으로 이동하여 실수 방지\n• 💳 '스마트 편의 설정' ➔ '매장 결제 & 영수증 문자 전송' 전용 비즈니스 카드로 개편\n• 📲 '0원 영수증 문자' ➔ '영수증 문자 전송'으로 명칭 통일 및 직관적 UX 완성",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
