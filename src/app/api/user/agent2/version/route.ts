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
      latestVersionCode: 70,
      latestVersionName: "2.1.49",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.49/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.49 릴리즈\n• 🔍 [영수증 발송 조건 5단계 종합 진단 도구 탑재] 실제 은행 송금 없이 고객명/금액 지정으로 가상 입금 SMS를 시뮬레이션하여 SMS 권한, 앱 설정, 구글 시트 주문접수대장 매칭 여부 및 매칭 세부정보, 규격 검증 및 실제 발송 전 과정을 1초 만에 원스톱 점검\n• 🛡️ [ANR '앱 닫기/대기' 팝업 완전 방어] SMS 수신 시 브로드캐스트 리시버 생명주기 즉시 해제 및 메인 스레드 지갑 폴링 제거로 멈춤 현상 원천 차단",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
