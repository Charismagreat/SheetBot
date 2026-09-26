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
      latestVersionCode: 7,
      latestVersionName: "1.6.0",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v1.6.0/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 에이전트 v1.6.0 정식 업데이트\n• 🔴 유튜브 영상 및 웹 브라우저 [공유하기] 시 구글 시트 자동 스크랩 & Gemini AI 핵심 3줄 요약\n• 📊 [SheetBot] 웹 링크 & 유튜브 스크랩 대장 구글 스프레드시트 실시간 자동 기록\n• 🧾 영수증 사진 AI OCR 실시간 분석 & [SheetBot] 스마트 경비 영수증 대장 자동 장부화\n• 🪪 명함 사진 AI OCR 실시간 분석 & [SheetBot] 스마트 명함 관리 대장 자동 인맥화\n• 📊 고객 360도 올인원 비즈니스 통합 CRM 대장 자동 프로비저닝 지원\n• 🎙️ 통화 녹음 AI STT & 3줄 핵심 요약 & Action Items 자동 추출\n• 📞 부재중 전화(Missed Call) 감지 시 0원 스마트 안내 문자 자동 회신 및 대장 기록\n• 💼 통화 종료 직후 모바일 명함 원터치 발송 지원\n• 💬 문자(SMS/LMS) 송수신 및 카카오톡 대화 구글 시트 실시간 자동 기록",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
