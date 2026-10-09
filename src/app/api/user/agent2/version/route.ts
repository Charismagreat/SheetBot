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
    const major = parts[0];
    const minor = parts[1];
    const patch = parts[2];
    if (major === 2 && minor >= 2) {
      return 121 + (minor - 2) * 100 + patch; // 2.2.0 = 121, 2.2.1 = 122
    }
    if (major === 2 && minor === 1) {
      return 97 + (patch - 76);
    }
  }
  return 122;
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

  let latestName = "2.2.1";
  let latestCode = 122;
  let apkUrl = "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk";
  let releaseNotes = "🛍️ 카드 스토어(Marketplace) 1단계 출시: 22종 업무 자동화 카드 카탈로그, 원클릭 설치 및 맞춤 제작 의뢰 지원";

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
