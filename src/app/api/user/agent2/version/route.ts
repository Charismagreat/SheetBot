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
      latestVersionCode: 40,
      latestVersionName: "2.1.19",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.19/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.19 릴리즈\n• 🛍️ [스마트 간편 주문 & 품목 대장 전면 개편] 단순 견적 시스템에서 실시간 모바일 간편 주문 시스템으로 전면 전환\n• 🖼️ [품목 대표사진 & 품절 표시 연동] 구글 시트의 품목 대장에 등록된 대표사진, 상세이미지, 품절 여부가 모바일 주문 웹에 실시간 연동\n• 🧾 [모바일 전자 주문확인서 탑재] 주문 완료 즉시 웹 화면에 영수증 형태의 전자 주문확인서(인쇄, PDF, 주문내역 복사) 제공 및 구글 시트 주문접수대장 10개 열 자동 기록\n• 📱 [앱 UI 최적화] 스마트 간편 주문 및 품목 대장 연동 메뉴 및 토스트 안내 반영",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
