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
      latestVersionCode: 77,
      latestVersionName: "2.1.56",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.56/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.56 릴리즈\n• 💼 [통화 종료 후 모바일 명함 발송 완벽 개선] 수신 통화뿐만 아니라 내가 건 발신 통화 후에도 상대방 번호와 이름을 100% 감지하여 상단 알림창 원터치 발송 지원\n• 📊 [명함 발송 대장 시트 연동 강화] 스마트 웹 명함(0원) 및 갤러리 사진 첨부(MMS) 모드 모두 구글 시트 [SheetBot] 모바일 명함 발송 대장에 실시간 기록 보장\n• ⚡ [원터치 확인 vs 즉시 자동 발송 선택 옵션] 통화 종료 후 상단 알림창 원터치 확인 모드(기본 권장)와 알림 없이 즉시 자동 발송 모드를 자유롭게 선택할 수 있는 스위치 추가",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
