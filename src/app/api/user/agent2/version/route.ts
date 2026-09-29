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
      latestVersionCode: 41,
      latestVersionName: "2.1.20",
      apkUrl: "https://github.com/Charismagreat/SheetBot/releases/download/user-v2.1.20/SheetBotAgent.apk",
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: "시트봇 모바일 에이전트 v2.1.20 릴리즈\n• 📷 [카톡 미리보기 대표 사진 등록 완벽 지원] 스마트폰 고화질 카메라 사진(수십 MB) 선택 시 카카오톡/웹 최적 규격으로 자동 다운스케일링 및 고화질 JPEG 스마트 압축 전송 (HTTP 500 오류 및 메모리 초과 완전 해결)\n• 🛍️ [스마트 간편 주문 & 품목 대장 연동] 대표사진, 상세이미지, 품절 표시 및 전자 주문확인서 실시간 동기화\n• 🏢 [시트 사업자정보 연동] 구글 시트의 사업자정보 탭(계좌번호, 배송/환불 안내 등)과 모바일 영수증 100% 연동",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
