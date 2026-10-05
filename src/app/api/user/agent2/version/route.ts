export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  let latestCode = 94;
  let latestName = "2.1.73";

  try {
    const gradlePath = path.join(process.cwd(), "android-user-agent", "app", "build.gradle.kts");
    if (fs.existsSync(gradlePath)) {
      const gradleContent = fs.readFileSync(gradlePath, "utf-8");
      const codeMatch = gradleContent.match(/versionCode\s*=\s*(\d+)/);
      const nameMatch = gradleContent.match(/versionName\s*=\s*["']([^"']+)["']/);
      if (codeMatch) latestCode = parseInt(codeMatch[1], 10);
      if (nameMatch) latestName = nameMatch[1].trim();
    }
  } catch {}

  const tag = `user-v${latestName}`;
  const apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/${tag}/SheetBotAgent.apk`;

  return NextResponse.json(
    {
      success: true,
      latestVersionCode: latestCode,
      latestVersionName: latestName,
      apkUrl,
      fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
      releaseNotes: `시트봇 모바일 에이전트 v${latestName} 릴리즈\n• 🛡️ [3중 중복 방지 시스템 탑재] 서버 60초 선제 락(In-Flight Lock) + 구글 드라이브 중복 파일 재사용 + 시트 중복 행 사전 방어\n• ⚡ [클라이언트 중복 재전송 원천 차단] 소켓 지연 시 2차 호스트 중복 전송 방어\n• 📇 [스마트폰 연락처 100% 자동 저장] 주소록 직접 저장 & 팝업 다이얼로그 무결점 연동`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
