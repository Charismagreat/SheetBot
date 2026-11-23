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

function getLocalPropertiesVersion(): { name: string; code: number } {
  try {
    const propPath = path.resolve(process.cwd(), "android-version.properties");
    if (fs.existsSync(propPath)) {
      const content = fs.readFileSync(propPath, "utf-8");
      const match = content.match(/VERSION_NAME\s*=\s*([0-9.]+)/i);
      if (match && match[1]) {
        const v = match[1].trim();
        const parts = v.split(".").map((p) => parseInt(p, 10) || 0);
        const code = parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
        return { name: v, code };
      }
    }
  } catch (_) {}
  return { name: "2.4.81", code: 20481 };
}

function parseVersionToCode(versionName: string): number {
  const clean = versionName.replace(/^v?/i, "").trim();
  const parts = clean.split(".").map((p) => parseInt(p, 10) || 0);
  if (parts.length >= 3) {
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }
  return 20481;
}

function refreshVersionCache(): Promise<CachedVersion["data"]> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    const local = getLocalPropertiesVersion();
    let latestName = local.name;
    let latestCode = local.code;
    let apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/v${latestName}/sheetbot-deposit-agent.apk`;
    const releaseNotes = `시트봇 에이전트 M v${latestName} (입금 감지 + FileToSheet 인증번호 SMS 릴레이 일체형 통합)`;

    try {
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
        const cleanVer = rawTag.replace(/^v?/i, "").trim();
        const ghCode = parseVersionToCode(cleanVer);
        if (cleanVer && ghCode >= latestCode) {
          latestName = cleanVer;
          latestCode = ghCode;
          apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/${rawTag}/sheetbot-deposit-agent.apk`;
        }
      }
    } catch (err: any) {
      console.warn("[VersionCheck] GitHub release redirect check warning:", err.message);
    }

    const resultData: CachedVersion["data"] = {
      latestVersionCode: latestCode,
      latestVersionName: latestName,
      apkUrl,
      fallbackApkUrl: "https://github.com/Charismagreat/SheetBot/releases/latest/download/sheetbot-deposit-agent.apk",
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
 * GET /api/wallet/agent/version
 * 시트봇 에이전트 M(입금 감지 + 인증번호 릴레이) 앱의 최신 버전 정보 및 APK 다운로드 링크 자동 제공
 */
export async function GET() {
  const now = Date.now();
  if (versionCache) {
    if (now - versionCache.timestamp >= CACHE_TTL_MS) {
      // Stale-while-revalidate: 캐시 만료 시 즉시 기존 값 반환 후 백그라운드 1회 갱신
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
