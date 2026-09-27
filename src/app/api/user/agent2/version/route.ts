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
      latestVersionCode: 24,
      latestVersionName: "2.1.3",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.3/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.3 정식 릴리스\n• ⚡ 모든 기능 스위치 ON 시 구글 드라이브 전용 폴더 및 대응 시트 대장 즉시 선제 자동 생성\n  - '[SheetBot] 통화 녹음' 폴더 및 통화 녹음 대장\n  - '[SheetBot] 파일 보관함' 폴더 및 파일 업로드 대장\n  - '[SheetBot] 모바일 명함 발송 대장'\n  - '[SheetBot] 매장 결제 및 매출 대장'\n  - '[SheetBot] 고객 영수증 문자 발송 대장'\n• 🏷️ 상단 및 코파일럿 버전 표기 실시간 동적 바인딩(v2.1.3)\n• 📁 파일 보관함 전용 ON/OFF 제어 스위치 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
