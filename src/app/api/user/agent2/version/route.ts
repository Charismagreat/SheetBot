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
      latestVersionCode: 65,
      latestVersionName: "2.1.44",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.44/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.44 릴리즈\n• 📝 [앱 영수증 템플릿 최우선 적용] 모바일 앱 설정의 '고객 발송 영수증 문구 템플릿'을 1순위로 즉시 반영\n• ✂️ [80B 초과 글자수 정밀 자동 제거] EUC-KR 80바이트 초과 글자수를 한글 깨짐 없이 안전하게 제거하여 단문 100% 발송 보장\n• 📊 [실제 발송 문구 대장 동기화] 잘려나간 실제 발송 문구가 구글 시트 대장과 단말기 발신함에 동일하게 기록",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
