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
      latestVersionCode: 76,
      latestVersionName: "2.1.55",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.55/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.55 릴리즈\n• 🗂️ [카드별 명확한 독립 블록 분리] 펼쳐졌을 때도 각 카드의 영역이 100% 명확히 구분되도록 독립 라운드 카드 박스 적용\n• 🔀 [통화 & 소통 집중형 최적화 재배치] 통화 녹음 ➔ 부재중 자동 답장 ➔ 통화 후 모바일 명함 ➔ 고객 문자 ➔ 카카오톡 ➔ 매장 결제 순으로 상위권 집중 배치\n• 🔼 [슬림 아이콘 버튼화] 접기/펼치기 글자를 제거하고 단일 화살표 아이콘(▲/▼)으로 전환하여 가로 공간 극대화\n• 🎙️ [AI 비서 타이틀 가독성 개선] 불필요한 버전 뱃지를 정리하여 타이틀과 혜택 뱃지가 한 줄로 시원하게 노출\n• 📞 [문구 정비] '전화 못 받았을 때 자동 답장 문자 발송'으로 직관화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
