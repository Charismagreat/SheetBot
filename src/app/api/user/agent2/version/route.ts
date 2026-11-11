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
const CACHE_TTL_MS = 15 * 1000; // 15초 캐시 (GitHub API Rate Limit 보호 및 실시간 반영)

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
  return 20428;
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
  return "2.4.28";
}

/**
 * GET /api/user/agent2/version
 *
 * 1순위: GitHub Releases Web 302 Location 헤더 조회 (API Rate Limit 무제한, 0.1초 응답)
 * 2순위: 로컬 android-version.properties 버전 폴백
 */
export async function GET() {
  const now = Date.now();
  if (versionCache && now - versionCache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(
      { success: true, ...versionCache.data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  const localVer = readLocalPropertiesVersion();
  let latestName = localVer;
  let latestCode = parseVersionToCode(localVer);
  let apkUrl = `https://github.com/Charismagreat/SheetBot/releases/download/v${localVer}/SheetBotAgent.apk`;
  let releaseNotes =
    "✨ 시트봇 에이전트 v2.4.34 업데이트: (1) 최초 설치 및 신규 카드 배포 시 전체 카드 보관함 자동 보관 (2) 카드 내부 인라인 실행 상태 표시 (3) 파투(FileToSheet) AI 비서·할 일 허브·명함 주소록 자동 저장 완벽 연동 (4) 앱 전환 시 인증 모달 무손실 유지";

  try {
    // Rate-limit이 없는 GitHub Web 302 리다이렉트로 최신 릴리즈 태그 즉시 확인
    const webRes = await fetch("https://github.com/Charismagreat/SheetBot/releases/latest", {
      redirect: "manual",
      headers: { "User-Agent": "SheetBot-Version-Checker" },
      cache: "no-store",
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

  const resultData = {
    latestVersionCode: latestCode,
    latestVersionName: latestName,
    apkUrl,
    fallbackApkUrl: "https://github.com/Charismagreat/SheetBot/releases/latest/download/SheetBotAgent.apk",
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
