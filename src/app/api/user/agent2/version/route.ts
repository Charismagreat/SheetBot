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
      latestVersionCode: 12,
      latestVersionName: "2.0.1",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.1/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v2.0.1 긴급 패치 업데이트\n• 🔐 Google 원클릭 로그인 호환성 강화 (오류 코드 10 DEVELOPER_ERROR 자동 감지 및 스마트폰 계정 선택기/간편 연동창 자동 전환)\n• ⚡ 롱클릭 시트봇 이메일 직접 연동 지원 (SHA-1 미등록 기기에서도 1초 만에 무중단 연동)\n• 🎁 친구/동료 초대 시 양방향 10,000 보너스 토큰 즉시 적립 (카카오톡/문자 원터치 공유)\n• 🏷️ 추천인 코드 등록 모달 탑재 (+1만 토큰 즉시 수령 & 클립보드 자동 감지)\n• 💰 실시간 내 토큰 지갑 잔액 & 회원 등급(PRO/FREE) 카드 상시 표시\n• ⚡ 토스(Toss) 앱 원터치 1초 송금 연동 (금액/받는사람 자동 입력, 수수료 0원 혜택)\n• 💳 인앱 간편 무통장 충전 (스타터 5만 / 스탠다드 15만 / 프로 45만 패키지)\n• 🤖 입금 즉시 3초 만에 토큰 자동 충전 및 실시간 잔액 동기화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
