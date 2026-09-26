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
      latestVersionCode: 4,
      latestVersionName: "1.3.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.3.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v1.3.0 업데이트\n• 💬 문자(SMS/LMS) 송수신 구글 시트 실시간 자동 기록\n• 📤 기본 문자 앱 직접 발신 문자 실시간 감지 (SmsSentObserver)\n• 👤 스마트폰 주소록(연락처) 이름 자동 매칭 (ContactHelper)\n• 🟡 카카오톡 1:1 및 단체 단톡방 수신 메시지 구글 시트 실시간 자동 기록\n• 🎯 사생활 보호를 위한 특정 번호/채팅방 선별 필터링 지원\n• 📁 [SheetBot] 표준 네이밍 구글 시트 대장 자동 생성",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
