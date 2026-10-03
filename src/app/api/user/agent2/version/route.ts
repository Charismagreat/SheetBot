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
      latestVersionCode: 60,
      latestVersionName: "2.1.39",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.39/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.39 릴리즈\n• 📝 [영수증 문자 커스텀 발송 문구 설정 UI 탑재] 상호명/안내 템플릿 직접 편집 및 실시간 자동 저장 지원\n• 💡 [스마트 치환 변수 지원] {고객명}, {금액}, {일시} 동적 치환 엔진 완비\n• 🔄 [원클릭 기본값 복원] [기본값] 터치 시 표준 영수증 안내 문구로 즉시 리셋",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
