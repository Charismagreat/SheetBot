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
      latestVersionCode: 64,
      latestVersionName: "2.1.43",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.43/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.43 릴리즈\n• 📲 [한국 통신사 80B 단문 SMS 최적화] 90바이트 초과 Multipart SMS 폐기 문제를 방지하기 위해 단문 규격(80바이트 이하)으로 자동 압축 발송\n• 📁 [단말기 보낸 문자함 동기화] 발송된 영수증 문자가 스마트폰 기본 메시지 앱 발신함(Sent Box)에도 즉시 저장\n• 🕒 [KST 시간 완전 일치] UTC 9시간 시차 버그 완벽 보정 및 영수증 대장 1회 단일 기록 보장",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
