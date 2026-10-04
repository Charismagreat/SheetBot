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
      latestVersionCode: 75,
      latestVersionName: "2.1.54",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.54/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.54 릴리즈\n• 🎙️ [AI 비서 카드 전면 개편] 옵션 A 모던 올인원 프롬프트 박스 디자인(14dp 라운드, 1.5dp 테두리, 음성/실행 일체형) 및 쉬운 안내 문구 적용\n• 💳 [매장 결제 & 통화 녹음 등 주요 카드 개편] '결제될 때 음성으로 안내받기', '영수증 문자 발송 시트 열기', '통화 끝나면 바로 자동 저장' 등 쉬운 동사형 문구 100% 개편\n• 📂 [전 카드 상시 아코디언 접기/펼치기] 토큰 지갑을 포함하여 기능이 켜져 있는 상태에서도 모든 카드를 슬림하게 접어둘 수 있도록 지원\n• 💼 [모바일 명함 옵션 정비] 웹 명함 링크 및 갤러리 사진 직접 첨부(MMS) 방식 선택 지원",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
