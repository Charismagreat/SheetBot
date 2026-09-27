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
      latestVersionCode: 18,
      latestVersionName: "2.0.7",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.7/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.0.7 정식 릴리스\n• 💼 통화 종료 모바일 명함 하이브리드 발송 지원\n• 🌐 [방안 1] 스마트 웹 명함 링크 모드 (0원 무료 · 아이폰/갤럭시 고화질 미리보기 썸네일 카드)\n• 🖼️ [방안 2] 갤러리 사진 직접 첨부 모드 (통화 종료 시 등록된 명함/포스터 사진과 문구가 문자 앱에 자동 첨부되어 MMS 원클릭 발송)\n• 🪪 이용자가 원하는 발송 방식을 앱 화면에서 언제든 라디오 버튼으로 자유롭게 선택 가능",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
