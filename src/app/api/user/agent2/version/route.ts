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
      latestVersionCode: 49,
      latestVersionName: "2.1.28",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.28/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.28 릴리즈\n• 🎙️ [통화 녹음 감지 진단성 극대화] 발견된 파일 수, 파일명 미리보기, 필터 제외 및 전송 에러 투명 안내\n• 📁 [에이닷/T전화 하위 폴더 포괄 탐색] 지정된 경로 및 1단계 하위 디렉터리 동시 탐색 지원\n• ⚡ [구글 드라이브 원격 업로드 최적화] 무한 대기 방지 및 통신 안정성 강화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
