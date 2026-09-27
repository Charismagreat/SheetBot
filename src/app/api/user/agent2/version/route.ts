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
      latestVersionCode: 11,
      latestVersionName: "2.0.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.0.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v2.0.0 정식 업데이트\n• 🎁 친구/동료 초대 시 양방향 10,000 보너스 토큰 즉시 적립 (카카오톡/문자 원터치 공유)\n• 🏷️ 추천인 코드 등록 모달 탑재 (+1만 토큰 즉시 수령 & 클립보드 자동 감지)\n• 💰 실시간 내 토큰 지갑 잔액 & 회원 등급(PRO/FREE) 카드 상시 표시\n• ⚡ 토스(Toss) 앱 원터치 1초 송금 연동 (금액/받는사람 자동 입력, 수수료 0원 혜택)\n• 💳 인앱 간편 무통장 충전 (스타터 5만 / 스탠다드 15만 / 프로 45만 패키지)\n• 🤖 입금 즉시 3초 만에 토큰 자동 충전 및 실시간 잔액 동기화\n• 🔐 Google 원클릭 로그인(Sign in with Google) 지원 (PC 없이 스마트폰 단독 0초 자동 연동)\n• 🎙️ 자연어 음성/텍스트 모바일 AI 시트 코파일럿 (Google Apps Script 함수 원격 다이렉트 구동)\n• 💬 말 한마디로 고객 문자 자동 발송 / 정산 마감 / 시트 데이터 조회 및 TTS 음성 브리핑\n• 🔴 유튜브 영상 및 웹 브라우저 [공유하기] 시 구글 시트 자동 스크랩 & Gemini AI 핵심 3줄 요약\n• 🧾 영수증 & 🪪 명함 사진 AI OCR 실시간 분석 및 대장 자동 기록",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
