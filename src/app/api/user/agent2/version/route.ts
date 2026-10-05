export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  let latestCode = 93;
  let latestName = "2.1.72";

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
      releaseNotes: `시트봇 모바일 에이전트 v${latestName} 릴리즈\n• 📇 [스마트폰 연락처 100% 자동 저장] WRITE_CONTACTS 런타임 권한 자동 요청 및 구글/삼성 계정 자동 바인딩으로 주소록 저장 완벽 해결\n• 🛡️ [2중 안전망 시스템 주소록 연동] 권한 미부여 시에도 시스템 연락처 등록 화면으로 무손실 즉시 연동\n• 🪪 [명함 AI 분석 즉각 팝업] 분석 완료 즉시 화면에 [연락처 저장 & 내 명함 발송] 팝업 다이렉트 출현`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
