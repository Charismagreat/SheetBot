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
      latestVersionCode: 44,
      latestVersionName: "2.1.23",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.23/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.23 릴리즈\n• 🌐 [Vercel 클라우드 전면 복구] 공용 터널 자동 라우팅으로 잔액 조회·웹링크 스크랩·문자/카톡 동기화 0.1초 즉시 응답\n• 📁 [무손실 구글 드라이브 파일 업로드 브릿지] 명함·영수증·통화녹음 파일 완벽 업로드 및 AI OCR 토큰 차감 연동\n• 💼 [모바일 명함 발송 대장 연동] 통화 종료 후 명함 발송 시 [SheetBot] 모바일 명함 발송 대장 시트 실시간 자동 기록\n• 🧾 [고객 영수증 문자 발송 대장 연동] 결제 후 영수증 SMS 발송 시 [SheetBot] 고객 영수증 문자 발송 대장 시트 실시간 자동 기록\n• 🖥️ [웹사이트 모니터링 & 매장 결제 대장 강화] Self-Healing 헤더 보장 및 8열 표준 규격 동기화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
