export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/wallet/agent/version
 * 시트봇 에이전트 M 앱의 최신 버전 정보 및 원클릭 업데이트 APK 다운로드 링크 제공
 */
export async function GET() {
  return NextResponse.json(
    {
      success: true,
      latestVersionCode: 7,
      latestVersionName: "1.5.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/v1.5.0/sheetbot-deposit-agent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/sheetbot-deposit-agent.apk",
      releaseNotes: "시트봇 에이전트 M v1.5.0 (Phase 4)\n• 서버 다운 실시간 감지 & 거짓 정상(False Positive) 완전 차단\n• 스마트폰 잠금/화면 꺼짐 상태에서도 화면 강제 점등(WakeLock) & 전면 비상 경보 팝업\n• 2분 서버 통신 두절 시 TTS 음성 비상 경보 발동\n• 서버 다운 중 수신된 입금 SMS/푸시 오프라인 안전 대기열(Local Queue) 무손실 보관 및 복구 시 자동 일괄 전송(Drain)\n• 가상 입금 테스트 버튼 영구 삭제 및 실시간 서버 통신 관제 콕핏 탑재",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
