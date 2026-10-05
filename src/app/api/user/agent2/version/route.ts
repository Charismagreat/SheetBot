export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/agent2/version
 * 이용자용 스마트폰 앱 (SheetBot Agent) 최신 버전 정보 및 원클릭 업데이트 APK 링크 제공
 */
export async function GET() {
  let latestCode = 90;
  let latestName = "2.1.69";

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
      releaseNotes: `시트봇 모바일 에이전트 v${latestName} 릴리즈\n• 🏢 [이지데스크 운영 서버 1순위 직결] 이지데스크 공식 터널을 1차 메인 호스트로 최우선 지정하여 0초 즉시 통신\n• ⚡ [고화질 사진 1600px 최적화 압축] 10MB 원본 사진을 300KB로 97% 경량화하여 번개처럼 업로드\n• 🪪 [명함 AI OCR 분석 실패 해결] 터널 413 용량 초과 및 타임아웃 완전 방지\n• 🔔 분석 완료 시 상단 헤드업 알림 및 팝업창 100% 정상 연동`,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
