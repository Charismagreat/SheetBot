export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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
let inFlightRefresh: Promise<CachedVersion["data"]> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시 + Stale-While-Revalidate + Single-Flight 중복 차단

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function parseVersionToCode(versionName: string): number {
  const clean = versionName.replace(/^(user-|manager-)?v?/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  if (parts.length >= 3) {
    const major = parts[0];
    const minor = parts[1];
    const patch = parts[2];
    if (major > 2 || (major === 2 && minor >= 3)) {
      return major * 10000 + minor * 100 + patch;
    }
    if (major === 2 && minor >= 2) {
      return 121 + (minor - 2) * 100 + patch;
    }
    if (major === 2 && minor === 1) {
      return 97 + (patch - 76);
    }
  }
  return 20481;
}

function readLocalPropertiesVersion(): string {
  try {
    const propPath = path.join(process.cwd(), "android-version.properties");
    if (fs.existsSync(propPath)) {
      const text = fs.readFileSync(propPath, "utf8");
      const m = text.match(/VERSION_NAME\s*=\s*([^\r\n#]+)/);
      if (m?.[1]?.trim()) return m[1].trim();
    }
  } catch {}
  return "2.4.81";
}

function refreshVersionCache(): Promise<CachedVersion["data"]> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    const localVer = readLocalPropertiesVersion();
    let latestName = localVer;
    let latestCode = parseVersionToCode(localVer);
    let apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/v${localVer}/SheetBotAgent.apk`;
    const releaseNotes =
      `✨ 시트봇 에이전트 v${latestName} 업데이트: 초경량 서버 상태 진단(/api/health) 분리 및 오탐 방지·배터리/트래픽 최적화`;

    try {
      // Rate-limit이 없는 GitHub Web 302 리다이렉트로 최신 릴리즈 태그 즉시 확인 (3초 타임아웃 보호)
      const webRes = await fetch("https://github.com/Charismagreat/SheetBot/releases/latest", {
        redirect: "manual",
        headers: { "User-Agent": "SheetBot-Version-Checker" },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      const loc = webRes.headers.get("location") || "";
      const tagMatch = loc.match(/\/releases\/tag\/([^/?#]+)/i);
      if (tagMatch?.[1]) {
        const rawTag = decodeURIComponent(tagMatch[1]).trim();
        const cleanVer = rawTag.replace(/^(user-)?v?/i, "").trim();
        const ghCode = parseVersionToCode(cleanVer);
        if (cleanVer && ghCode >= latestCode) {
          latestName = cleanVer;
          latestCode = ghCode;
          apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/${rawTag}/SheetBotAgent.apk`;
        }
      }
    } catch (err: any) {
      console.warn("[VersionCheck] GitHub release redirect check warning:", err.message);
    }

    const resultData: CachedVersion["data"] = {
      latestVersionCode: latestCode,
      latestVersionName: latestName,
      apkUrl,
      fallbackApkUrl: "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk",
      releaseNotes,
    };

    versionCache = {
      timestamp: Date.now(),
      data: resultData,
    };
    return resultData;
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

/**
 * GET /api/user/agent2/version
 *
 * 1순위: GitHub Releases Web 302 Location 헤더 조회 (API Rate Limit 무제한, 5분 SWR 캐시)
 * 2순위: 로컬 android-version.properties 버전 폴백
 */
export async function GET() {
  const now = Date.now();
  if (versionCache) {
    if (now - versionCache.timestamp >= CACHE_TTL_MS) {
      void refreshVersionCache().catch(() => {});
    }
    return NextResponse.json(
      { success: true, ...versionCache.data },
      { headers: NO_STORE_HEADERS }
    );
  }

  const resultData = await refreshVersionCache();
  return NextResponse.json(
    { success: true, ...resultData },
    { headers: NO_STORE_HEADERS }
  );
}
