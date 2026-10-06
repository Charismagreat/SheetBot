export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

interface CachedVersion {
  timestamp: number;
  data: {
    latestVersionCode: number;
    latestVersionName: string;
    apkUrl: string;
    fallbackApkUrl: string;
    releaseNotes: string;
  };
}

let versionCache: CachedVersion | null = null;
const CACHE_TTL_MS = 5 * 1000; // 5초 캐시 (실시간 릴리즈 즉시 반영)

function parseVersionToCode(versionName: string): number {
  const clean = versionName.replace(/^(user-)?v?/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  if (parts.length >= 3) {
    // 2.1.76 기준 versionCode 97 매핑 (2.1.81 = 102)
    return 97 + (parts[2] - 76);
  }
  return 102;
}

/**
 * GET /api/user/agent2/version
 * 
 * GitHub Releases API를 실시간 조회하여 가장 최신 버전 정보와 APK 직통 다운로드 링크를 자동 제공합니다.
 * 더 이상 서버 측 수동 버전 수정이나 배포가 필요 없습니다.
 */
export async function GET() {
  const now = Date.now();
  if (versionCache && now - versionCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      { success: true, ...versionCache.data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  let latestName = "2.1.83";
  let latestCode = 104;
  let apkUrl = "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk";
  let releaseNotes = "스마트 통합 할 일 허브(Task Hub), 통화 화면 플로팅 할 일, 모바일 표시 문구 직관화 및 상단 업데이트 알림 뱃지가 적용되었습니다.";

  try {
    const ghRes = await fetch("https://api.github.com/repos/Charismagreat/SheetBot/releases/latest", {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "SheetBot-Version-Checker",
      },
      cache: "no-store",
    });

    if (ghRes.ok) {
      const ghJson = await ghRes.json();
      const rawTag = (ghJson.tag_name || "").trim();
      const cleanVer = rawTag.replace(/^(user-)?v?/i, "").trim();

      if (cleanVer) {
        latestName = cleanVer;
        latestCode = parseVersionToCode(cleanVer);
      }

      const body = (ghJson.body || "").trim();
      if (body) {
        releaseNotes = body;
      }

      // assets에서 SheetBotAgent.apk 직통 URL 탐색
      const assets = ghJson.assets || [];
      const apkAsset = assets.find((a: any) =>
        (a.name || "").toLowerCase().includes("sheetbotagent") && (a.name || "").endsWith(".apk")
      ) || assets.find((a: any) => (a.name || "").endsWith(".apk"));

      if (apkAsset?.browser_download_url) {
        apkUrl = apkAsset.browser_download_url;
      } else if (rawTag) {
        apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/${rawTag}/SheetBotAgent.apk`;
      }
    }
  } catch (err: any) {
    console.warn("[VersionCheck] GitHub release fetch error:", err.message);
  }

  const resultData = {
    latestVersionCode: latestCode,
    latestVersionName: latestName,
    apkUrl,
    fallbackApkUrl: "https://sheetbot.cloud/downloads/SheetBotAgent.apk",
    releaseNotes,
  };

  versionCache = {
    timestamp: now,
    data: resultData,
  };

  return NextResponse.json(
    { success: true, ...resultData },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
