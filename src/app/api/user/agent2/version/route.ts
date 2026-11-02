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
  const clean = versionName.replace(/^(user-|manager-)?v?/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  if (parts.length >= 3) {
    const major = parts[0];
    const minor = parts[1];
    const patch = parts[2];
    // 공통 버전 체계 (android-version.properties): 모든 앱 동일 versionCode
    if (major > 2 || (major === 2 && minor >= 3)) {
      return major * 10000 + minor * 100 + patch;
    }
    if (major === 2 && minor >= 2) {
      return 121 + (minor - 2) * 100 + patch; // 2.2.0 = 121, 2.2.1 = 122
    }
    if (major === 2 && minor === 1) {
      return 97 + (patch - 76);
    }
  }
  return 20426;
}

/**
 * GET /api/user/agent2/version
 *
 * GitHub Releases API를 실시간 조회하여 가장 최신 버전 정보와 APK 직통 다운로드 링크를 자동 제공합니다.
 */
export async function GET() {
  const now = Date.now();
  if (versionCache && now - versionCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      { success: true, ...versionCache.data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  let latestName = "2.4.26";
  let latestCode = 20426;
  let apkUrl = "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk";
  let releaseNotes =
    "⚡ 무중단 OTA 동적 카드 엔진 & AI 나만의 맞춤 카드 제작 탑재 (v2.4.26): 이제 앱 업데이트 없이 시트봇 스토어 신규 카드 및 안티그라비티 맞춤 카드를 즉시 다운로드·생성하여 사용할 수 있습니다.";

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
      const apkAsset =
        assets.find(
          (a: any) =>
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
