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
      latestVersionCode: 42,
      latestVersionName: "2.1.21",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.21/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.21 릴리즈\n• 💬 [구글 메시지(Google Messages) RCS/SMS 완벽 감지] 구글 메시지 기본 앱 사용 시 발생하는 RCS 채팅(데이터 문자) 및 SMS를 알림 리스너와 최적화된 리시버를 통해 100% 실시간 캐치하여 구글 시트에 자동 기록\n• 📤 [24시간 발신 문자 상시 감지] KeepAlive 백그라운드 서비스에 SmsSentObserver를 영구 등록하여 앱이 닫혀있어도 기본 메시지 앱에서 발신한 문자를 구글 시트에 즉시 기록\n• 📷 [카톡 미리보기 대표 사진 등록 최적화] 스마트폰 고화질 카메라 사진(수십 MB) 자동 다운스케일링 및 고화질 압축 전송 (HTTP 500 오류 완전 해결)\n• 🛍️ [스마트 간편 주문 & 사업자정보 연동] 구글 시트 3대 탭(품목, 주문접수대장, 사업자정보) 및 모바일 전자 주문확인서 실시간 동기화",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
