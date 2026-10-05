export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  let latestCode = 91;
  let latestName = "2.1.70";

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
      releaseNotes: `시트봇 모바일 에이전트 v${latestName} 릴리즈\n• ⚡ [Zero-Timeout 비동기 티켓 아키텍처] 터널 소켓 타임아웃 100% 원천 차단\n• 🪪 [명함 AI 분석 무결점 수거] 1.5초 Fast-Check + 안전 백그라운드 수거로 time out 오류 완전 종결\n• 🔔 분석 완료 시 상단 헤드업 알림 및 팝업창 100% 정상 연동`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
