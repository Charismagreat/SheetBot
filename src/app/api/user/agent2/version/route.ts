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
      latestVersionCode: 68,
      latestVersionName: "2.1.47",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.47/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.47 릴리즈\n• ⚡ [실제 입금 시 영수증 문자 발송 타임아웃 완벽 해결] 구글 시트 지연으로 인한 6초 타임아웃을 60초로 확장 및 서버 Fast-Path 즉시 응답(1초) 적용으로 실제 입금 시 영수증 문자 100% 자동 발송 보장\n• 🧪 [영수증 문자 즉시 테스트 도구 완비] 템플릿 바이트 실시간 계산 및 단말기/시트 원스톱 테스트 기능 탑재\n• 📝 [앱 영수증 템플릿 최우선 적용] 모바일 앱 설정의 '고객 발송 영수증 문구 템플릿' 1순위 반영\n• ✂️ [80B 초과 글자수 정밀 자동 제거] EUC-KR 80바이트 초과 글자수를 한글 깨짐 없이 안전하게 제거하여 단문 100% 발송 보장",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
