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
      latestVersionCode: 47,
      latestVersionName: "2.1.26",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.26/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.26 릴리즈\n• 🎙️ [통화 녹음 전 어플 통합 지원] SKT 에이닷(A.), T전화, 삼성 갤럭시, 후후, Cube ACR 등 모든 통화 녹음 앱 자동 감지 완비\n• 📁 [저장 위치 자유 선택 지원] 에이닷/T전화 원클릭 지정 및 기타 어플 커스텀 저장 폴더 직접 지정 지원\n• ⚡ [유연한 스마트 파일명 파서] 다양한 형식의 녹음 파일명에서 상대방 연락처와 통화 일시를 100% 무결점 자동 식별",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
