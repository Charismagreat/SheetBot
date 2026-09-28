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
      latestVersionCode: 33,
      latestVersionName: "2.1.12",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.12/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.12 릴리스\n• 🌐 [웹 관제 센터 원터치 바로가기 신설] 앱 내에서 바로 크롬 브라우저로 시트봇 웹 관제 센터를 열어 실시간 발송 이력과 AI 스마트 규칙 설정 가능\n• 🛡️ [Zero-Retention 고객 알림 대장 100% 구글 시트 직통 기록] 서버 무보관 원칙에 따라 고객 알림 발송/수신 내역을 회원 본인의 구글 스프레드시트에 실시간 안전 기록\n• 🧹 [주소록 의존성 및 복잡한 UI 정리] 불특정 고객 대상 자동화 원칙에 맞추어 주소록 선택 UI를 정리하여 앱 경량화 및 직관성 향상\n• 💬 [카톡 대화 파일 가져오기 지원] 카카오톡 내보내기(.txt) 파일 1초 구글 시트 구간 덮어쓰기 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
