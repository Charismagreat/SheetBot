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
      latestVersionCode: 82,
      latestVersionName: "2.1.61",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.61/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.61 릴리즈\n• 🪪 [명함/영수증 AI 자동 장부화 보장] 파일 업로드 시트 연동 설정 여부와 무관하게 명함 및 영수증은 100% 무조건 AI OCR 분석 및 구글 시트 대장 자동 등록 보장\n• 📁 [구글 드라이브 폴더 중복 방지 강화] 동일한 이름의 폴더가 중복 생성되지 않도록 영구 바인딩 및 정밀 격리",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
