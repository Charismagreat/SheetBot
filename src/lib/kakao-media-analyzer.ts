import * as XLSX from "xlsx";
import { callAiCaller, insertRows, queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getKoreanTimeString } from "@/lib/date-utils";

const SUMMARY_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

const MAX_AI_ANALYZE_BYTES = 12 * 1024 * 1024; // 12MB 이하만 AI 멀티모달 분석
const MIN_IMAGE_BYTES_FOR_AI = 15 * 1024; // 15KB 미만 극소형 스티커/썸네일성 이미지 제외
const MAX_SUMMARY_CHARS = 180;
const SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 500;

interface CachedSummaryEntry {
  summary: string;
  skippedAsMeme: boolean;
  cachedAt: number;
}

export interface KakaoMediaUserSettings {
  aiSummaryEnabled: boolean;
  autoTaskFromAttachment: boolean;
}

const DEFAULT_KAKAO_MEDIA_SETTINGS: KakaoMediaUserSettings = {
  aiSummaryEnabled: true,
  autoTaskFromAttachment: true,
};

function getSummaryCache(): Map<string, CachedSummaryEntry> {
  const g = globalThis as unknown as {
    __sbKakaoMediaSummaryCache?: Map<string, CachedSummaryEntry>;
  };
  if (!g.__sbKakaoMediaSummaryCache) {
    g.__sbKakaoMediaSummaryCache = new Map<string, CachedSummaryEntry>();
  }
  return g.__sbKakaoMediaSummaryCache;
}

function getSettingsCache(): Map<string, { value: KakaoMediaUserSettings; cachedAt: number }> {
  const g = globalThis as unknown as {
    __sbKakaoMediaSettingsCache?: Map<string, { value: KakaoMediaUserSettings; cachedAt: number }>;
  };
  if (!g.__sbKakaoMediaSettingsCache) {
    g.__sbKakaoMediaSettingsCache = new Map();
  }
  return g.__sbKakaoMediaSettingsCache;
}

function getCachedSummary(fileHash?: string): CachedSummaryEntry | null {
  if (!fileHash) return null;
  const cache = getSummaryCache();
  const hit = cache.get(fileHash);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > SUMMARY_CACHE_TTL_MS) {
    cache.delete(fileHash);
    return null;
  }
  return hit;
}

function putCachedSummary(fileHash: string | undefined, summary: string, skippedAsMeme: boolean) {
  if (!fileHash) return;
  const cache = getSummaryCache();
  cache.set(fileHash, { summary, skippedAsMeme, cachedAt: Date.now() });
  if (cache.size > SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

/**
 * AI Caller 응답 메타데이터 2중 언래핑 헬퍼
 * { content: "실제 텍스트", usage: {...} } 형태나 이중 직렬화 JSON에서 순수 텍스트를 안전하게 추출합니다.
 */
function unwrapAiCallerText(res: any): string {
  let candidate: any = res;
  if (candidate && typeof candidate === "object") {
    candidate =
      candidate.text ??
      candidate.content ??
      candidate.response ??
      candidate.output ??
      candidate?.result?.content?.[0]?.text ??
      "";
  }
  if (typeof candidate !== "string") {
    return "";
  }
  const trimmed = candidate.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && typeof parsed.content === "string") {
        return parsed.content.trim();
      }
      if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
        return parsed.text.trim();
      }
    } catch {
      // 일반 텍스트로 처리
    }
  }
  return trimmed;
}

function cleanOneLineSummary(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*#_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= MAX_SUMMARY_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_SUMMARY_CHARS - 1).trim()}…`;
}

export function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 확장자·MIME 기준으로 메시지 유형 라벨(사진/동영상/음성/파일)을 추론합니다.
 */
export function inferKakaoMediaTypeLabel(ext: string, mimeType = "", explicitType = ""): string {
  const explicit = explicitType.trim();
  if (explicit && ["사진", "사진 묶음", "동영상", "음성", "파일"].includes(explicit)) {
    return explicit;
  }
  const lowerExt = ext.toLowerCase().replace(/^\./, "");
  const lowerMime = mimeType.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(lowerExt) || lowerMime.startsWith("image/")) {
    return "사진";
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(lowerExt) || lowerMime.startsWith("video/")) {
    return "동영상";
  }
  if (["m4a", "mp3", "wav", "ogg", "aac", "amr"].includes(lowerExt) || lowerMime.startsWith("audio/")) {
    return "음성";
  }
  return "파일";
}

/**
 * 파일명을 항상 보존하면서 구글 시트 E열(메시지 내용) 문자열을 일관되게 조립합니다.
 */
export function formatKakaoMediaMessage(params: {
  messageType: string;
  fileName: string;
  mediaIndex?: number;
  mediaTotal?: number;
  summary?: string;
  analyzing?: boolean;
}): string {
  const idx = params.mediaIndex ?? 1;
  const total = params.mediaTotal ?? 1;
  const prefix =
    total > 1
      ? `[${params.messageType} ${idx}/${total}: ${params.fileName}]`
      : `[${params.messageType}: ${params.fileName}]`;

  if (params.summary && params.summary.trim()) {
    return `${prefix} ${params.summary.trim()}`;
  }
  if (params.analyzing) {
    return `${prefix} (내용 분석 중...)`;
  }
  return prefix;
}

/**
 * 사용자별 카카오톡 첨부파일 AI 요약/할 일 연계 설정 조회 (DB + 60초 메모리 캐시)
 */
export async function getKakaoMediaUserSettings(userEmail: string): Promise<KakaoMediaUserSettings> {
  const cleanEmail = (userEmail || "").toLowerCase().trim();
  if (!cleanEmail) return { ...DEFAULT_KAKAO_MEDIA_SETTINGS };

  const cache = getSettingsCache();
  const cached = cache.get(cleanEmail);
  if (cached && Date.now() - cached.cachedAt < 60_000) {
    return { ...cached.value };
  }

  try {
    await setupDatabase();
    const settingKey = `kakao_media_settings_${cleanEmail}`;
    const res = await queryTable("sheetbot_settings", {
      filters: { key: settingKey },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (res?.rows && res.rows.length > 0 && res.rows[0]?.value) {
      const parsed = JSON.parse(String(res.rows[0].value));
      const merged: KakaoMediaUserSettings = {
        aiSummaryEnabled: parsed?.aiSummaryEnabled !== false,
        autoTaskFromAttachment: parsed?.autoTaskFromAttachment !== false,
      };
      cache.set(cleanEmail, { value: merged, cachedAt: Date.now() });
      return { ...merged };
    }
  } catch (err) {
    console.warn("[KakaoMediaAnalyzer] 사용자 설정 조회 경고:", err);
  }

  return { ...DEFAULT_KAKAO_MEDIA_SETTINGS };
}

/**
 * 사용자별 카카오톡 첨부파일 AI 요약/할 일 연계 설정 저장
 */
export async function saveKakaoMediaUserSettings(
  userEmail: string,
  patch: Partial<KakaoMediaUserSettings>
): Promise<KakaoMediaUserSettings> {
  const cleanEmail = (userEmail || "").toLowerCase().trim();
  if (!cleanEmail) return { ...DEFAULT_KAKAO_MEDIA_SETTINGS };

  await setupDatabase();
  const current = await getKakaoMediaUserSettings(cleanEmail);
  const next: KakaoMediaUserSettings = {
    aiSummaryEnabled:
      typeof patch.aiSummaryEnabled === "boolean" ? patch.aiSummaryEnabled : current.aiSummaryEnabled,
    autoTaskFromAttachment:
      typeof patch.autoTaskFromAttachment === "boolean"
        ? patch.autoTaskFromAttachment
        : current.autoTaskFromAttachment,
  };

  const settingKey = `kakao_media_settings_${cleanEmail}`;
  const nowStr = getKoreanTimeString();
  const existing = await queryTable("sheetbot_settings", {
    filters: { key: settingKey },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  if (existing?.rows && existing.rows.length > 0 && existing.rows[0]?.id) {
    await updateRows(
      "sheetbot_settings",
      {
        value: JSON.stringify(next),
        updated_at: nowStr,
      },
      { ids: [Number(existing.rows[0].id)] }
    );
  } else {
    await insertRows("sheetbot_settings", [
      {
        key: settingKey,
        value: JSON.stringify(next),
        updated_at: nowStr,
      },
    ]);
  }

  getSettingsCache().set(cleanEmail, { value: next, cachedAt: Date.now() });
  return next;
}

export interface QuickAnalysisResult {
  /** 동기 단계에서 즉시 확정된 요약 (엑셀/CSV/텍스트/비분석 바이너리/캐시 히트 등) */
  immediateSummary?: string;
  /** 백그라운드 AI 멀티모달 분석을 추가로 실행해야 하는지 여부 */
  needsAsyncAi: boolean;
  /** 짤방/이모티콘/스티커 등으로 분석 제외되었는지 여부 */
  skippedAsMeme?: boolean;
}

function quickParseEmlSummary(rawText: string): string {
  const subjectMatch = rawText.match(/^Subject:\s*(.+)$/im);
  const fromMatch = rawText.match(/^From:\s*(.+)$/im);
  const parts: string[] = [];
  if (subjectMatch?.[1]) parts.push(`제목: ${subjectMatch[1].trim().slice(0, 80)}`);
  if (fromMatch?.[1]) parts.push(`발신: ${fromMatch[1].trim().slice(0, 60)}`);
  const bodyIdx = rawText.search(/\r?\n\r?\n/);
  if (bodyIdx >= 0) {
    const bodySnippet = rawText
      .slice(bodyIdx + 2, bodyIdx + 500)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (bodySnippet) parts.push(bodySnippet.slice(0, 100));
  }
  return cleanOneLineSummary(parts.join(" · "));
}

/**
 * 1단계(동기, <50ms, 비용 0원):
 * - SHA-256 해시 캐시 히트 시 즉시 반환
 * - 엑셀/CSV/텍스트/JSON/EML/HTML은 AI 호출 없이 로컬 직결 요약
 * - GIF 및 15KB 미만 소형 이미지는 단톡방 짤방/이모티콘성 사진으로 간주해 분석 제외
 * - JPG/PNG/WEBP, PDF, 음성 파일은 백그라운드 AI 분석 대상으로 마킹
 */
export function inspectMediaForQuickSummary(params: {
  buffer: Buffer;
  fileName: string;
  ext: string;
  fileHash?: string;
  aiSummaryEnabled: boolean;
}): QuickAnalysisResult {
  const ext = params.ext.toLowerCase().replace(/^\./, "");

  // 0. 해시 캐시 히트 확인
  const cached = getCachedSummary(params.fileHash);
  if (cached) {
    return {
      immediateSummary: cached.skippedAsMeme ? undefined : cached.summary || undefined,
      needsAsyncAi: false,
      skippedAsMeme: cached.skippedAsMeme,
    };
  }

  // 1. 엑셀 / CSV — AI 없이 무료 초고속 직결 요약
  if (["xlsx", "xls", "csv"].includes(ext)) {
    try {
      const wb = XLSX.read(params.buffer, { type: "buffer" });
      const sheetNames = wb.SheetNames || [];
      let totalRows = 0;
      let firstHeaders: string[] = [];
      for (let i = 0; i < sheetNames.length; i++) {
        const ws = wb.Sheets[sheetNames[i]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
        const nonEmpty = rows.filter(
          (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== "")
        );
        if (i === 0 && nonEmpty.length > 0) {
          firstHeaders = nonEmpty[0]
            .map((h) => String(h ?? "").trim())
            .filter(Boolean)
            .slice(0, 6);
        }
        totalRows += Math.max(0, nonEmpty.length - 1);
      }
      const headerPart = firstHeaders.length > 0 ? ` · 컬럼: ${firstHeaders.join(", ")}` : "";
      const summary = cleanOneLineSummary(
        `시트 ${sheetNames.length}개(${sheetNames.slice(0, 2).join(", ")}, 총 ${totalRows.toLocaleString()}행)${headerPart}`
      );
      putCachedSummary(params.fileHash, summary, false);
      return { immediateSummary: summary, needsAsyncAi: false };
    } catch {
      return {
        immediateSummary: `스프레드시트 (${formatBytesHuman(params.buffer.length)})`,
        needsAsyncAi: false,
      };
    }
  }

  // 2. EML 이메일 파일 — 로컬 직결 요약
  if (ext === "eml") {
    try {
      const summary = quickParseEmlSummary(params.buffer.toString("utf-8"));
      if (summary) {
        putCachedSummary(params.fileHash, summary, false);
        return { immediateSummary: summary, needsAsyncAi: false };
      }
    } catch {
      // 폴백 진행
    }
  }

  // 3. 텍스트 / JSON / HTML / 마크다운 — 로컬 직결 요약
  if (["txt", "json", "html", "htm", "md", "log"].includes(ext)) {
    try {
      let text = params.buffer.toString("utf-8");
      if (ext === "html" || ext === "htm") {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");
      }
      const summary = cleanOneLineSummary(text.slice(0, 400));
      if (summary) {
        putCachedSummary(params.fileHash, summary, false);
        return { immediateSummary: summary, needsAsyncAi: false };
      }
    } catch {
      // 폴백 진행
    }
  }

  // AI 자동 요약이 OFF인 경우 AI 호출 생략
  if (!params.aiSummaryEnabled) {
    return { needsAsyncAi: false };
  }

  // 4. 짤방/이모티콘성 사진 사전 차단 (.gif 또는 15KB 미만 소형 이미지)
  if (ext === "gif") {
    putCachedSummary(params.fileHash, "", true);
    return { needsAsyncAi: false, skippedAsMeme: true };
  }
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    if (params.buffer.length < MIN_IMAGE_BYTES_FOR_AI) {
      putCachedSummary(params.fileHash, "", true);
      return { needsAsyncAi: false, skippedAsMeme: true };
    }
    if (params.buffer.length <= MAX_AI_ANALYZE_BYTES) {
      return { needsAsyncAi: true };
    }
    return { immediateSummary: formatBytesHuman(params.buffer.length), needsAsyncAi: false };
  }

  // 5. PDF / 음성 — 백그라운드 경량 멀티모달 AI 요약 대상
  if (["pdf", "m4a", "mp3", "wav", "ogg", "aac", "amr"].includes(ext)) {
    if (params.buffer.length <= MAX_AI_ANALYZE_BYTES) {
      return { needsAsyncAi: true };
    }
    return { immediateSummary: formatBytesHuman(params.buffer.length), needsAsyncAi: false };
  }

  // 6. 그 외 바이너리(동영상, ZIP, HWP, DOCX 등) — 크기만 간결하게 표기
  return {
    immediateSummary: formatBytesHuman(params.buffer.length),
    needsAsyncAi: false,
  };
}

/**
 * 2단계(비동기 백그라운드): 이지데스크 AI Caller(경량 멀티모달)로 사진·PDF·음성의 핵심 내용을 1줄 요약합니다.
 * - 단톡방 짤방/이모티콘/스티커로 판별되면 skippedAsMeme: true를 반환하여 요약을 생략합니다.
 */
export async function analyzeMediaWithAi(params: {
  base64Data: string;
  ext: string;
  mimeType: string;
  fileName: string;
  fileHash?: string;
  channel?: "kakao" | "sms";
}): Promise<{ summary: string; skippedAsMeme: boolean }> {
  const cached = getCachedSummary(params.fileHash);
  if (cached) {
    return { summary: cached.summary, skippedAsMeme: cached.skippedAsMeme };
  }

  const ext = params.ext.toLowerCase().replace(/^\./, "");
  const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);
  const isPdf = ext === "pdf";
  const isAudio = ["m4a", "mp3", "wav", "ogg", "aac", "amr"].includes(ext);

  if (!isImage && !isPdf && !isAudio) {
    return { summary: "", skippedAsMeme: false };
  }

  let prompt = "";
  let resolvedMime = params.mimeType || "application/octet-stream";

  if (isImage) {
    const imgMimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    resolvedMime = imgMimeMap[ext] || "image/jpeg";
    prompt = [
      "당신은 메신저·문자 대화 대장에 첨부된 이미지를 1줄로 요약하는 업무 비서입니다.",
      '규칙 1) 이 이미지가 업무·정보 가치가 없는 단순 짤방, 밈(meme), 이모티콘, 스티커, 캐릭터 반응짤, 인사말 이미지라면 다른 설명 없이 반드시 "SKIP_MEME" 한 단어만 출력하세요.',
      "규칙 2) 문서(인증서, 영수증, 거래명세서, 견적서, 명함, 계약서, 통장사본, 공문, 안내문 등), 스크린샷, 제품·현장 사진 등 정보 가치가 있는 이미지라면 한국어로 1줄(최대 160자) 핵심 사실만 요약하세요.",
      '규칙 3) 문서 제목, 상호/이름, 날짜, 금액/인증번호 등 검색에 유용한 핵심 키워드를 " · "로 구분해 포함하고, 마크다운 기호나 줄바꿈 없이 평문 한 줄만 출력하세요.',
    ].join("\n");
  } else if (isPdf) {
    resolvedMime = "application/pdf";
    prompt = [
      `첨부된 PDF 문서("${params.fileName}")의 핵심 내용을 한국어 1줄(최대 160자)로 요약하세요.`,
      '문서 종류, 발행처/거래처, 날짜, 주요 품목·합계금액 등 검색에 유용한 키워드를 " · "로 구분해 포함하고, 마크다운 기호나 줄바꿈 없이 평문 한 줄만 출력하세요.',
    ].join("\n");
  } else if (isAudio) {
    const audioMimeMap: Record<string, string> = {
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      aac: "audio/aac",
      amr: "audio/amr",
    };
    resolvedMime = audioMimeMap[ext] || "audio/mp4";
    prompt = [
      "첨부된 음성 메시지의 핵심 발화 내용을 한국어 1줄(최대 160자)로 요약하세요.",
      "마크다운 기호나 줄바꿈 없이 평문 한 줄만 출력하세요.",
    ].join("\n");
  }

  const callerTag =
    params.channel === "sms"
      ? "sheetbot-sms-media-summary"
      : "sheetbot-kakao-media-summary";

  for (const model of SUMMARY_MODELS) {
    try {
      const res = await callAiCaller(prompt, {
        caller: callerTag,
        model,
        temperature: 0.1,
        maxOutputTokens: 220,
        files: [
          {
            name: params.fileName,
            content: params.base64Data,
            encoding: "base64",
            mimeType: resolvedMime,
          },
        ],
      });

      const rawText = unwrapAiCallerText(res);
      if (!rawText) continue;

      if (isImage && /\bSKIP_MEME\b/i.test(rawText)) {
        putCachedSummary(params.fileHash, "", true);
        return { summary: "", skippedAsMeme: true };
      }

      const summary = cleanOneLineSummary(rawText);
      if (summary) {
        putCachedSummary(params.fileHash, summary, false);
        return { summary, skippedAsMeme: false };
      }
    } catch (err) {
      console.warn(`[KakaoMediaAnalyzer] 모델 ${model} 호출 실패, 다음 모델 폴백:`, err);
    }
  }

  return { summary: "", skippedAsMeme: false };
}
