export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  let latestCode = 85;
  let latestName = "2.1.64";

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
      releaseNotes: `시트봇 모바일 에이전트 v${latestName} 릴리즈\n• 🪪 [명함 백그라운드 AI 분석 및 헤드업 알림 팝업 연동]\n• 창 전환 시에도 백그라운드 무중단 실행\n• 분석 완료 시 상단 헤드업 배너 출현 및 원클릭 연락처 저장 & 모바일 명함 전송`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
