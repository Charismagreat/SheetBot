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
      latestVersionCode: 74,
      latestVersionName: "2.1.53",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.53/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.53 릴리즈\n• 🎙️ [통화 녹음 대장 연동 및 상대방 이름 정상화] 파일명 파싱 버그를 해결하여 상대방 이름 및 전화번호가 '미지정 연락처'로 오표기되던 문제를 완벽 해결\n• 🛡️ [구글 드라이브 파일 중복 생성 원천 차단] 15초 멱등성 가드 및 사전 파일 중복 검증을 탑재하여 동일 통화 녹음 파일의 중복 업로드를 100% 방지\n• ⚡ [AI 음성 비동기 배치 수거 정상화] Zero-Block 비동기 수거 워커 연동을 최적화하여 504 Gateway Timeout 없이 화자 분리 STT 및 3줄 요약이 대장에 안정적으로 자동 기록되도록 개선",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
