import crypto from "crypto";
import {
  callAiCaller,
  callBidnoticeTool,
  callCompanyResearchTool,
  callDriveTool,
  callHostingCodingTool,
  callSeoTool,
  createTable,
  getOrCreateCompanyResearchDoc,
  getNpsWorkplaceDetail,
  getNpsWorkplaceTrend,
  insertRows,
  listDriveFiles,
  lookupKonepsVendor,
  lookupNpsWorkplace,
  lookupSmppCertifications,
  queryTable,
  searchBizinfo,
  searchCompanyResearch,
  searchKonepsContracts,
  searchNpsWorkplaces,
  searchSmppCertifications,
  WorkspaceVisitorCallOptions,
} from "@/lib/egdesk-helpers";
import { uploadDriveFileWithBridge } from "@/lib/drive-upload-helper";
import { getKoreanTimeString } from "@/lib/date-utils";

export const COMPANY_RESEARCH_REPORTS_TABLE = "sheetbot_company_research_reports";

export interface ExtractedCompanyEntity {
  companyName: string;
  businessNumber: string;
  ceoName: string;
  domain: string;
  industry: string;
  keywords: string[];
  address: string;
  sourceSummary: string;
}

export interface MultiAngleMcpResearchResult {
  nps: {
    primary: any;
    detail: any;
    trend: any;
    employeeCount: string;
    avgSalary: string;
    bNoPrefix: string;
  };
  bizverify: {
    raw: any;
    taxStatus: string;
  };
  smpp: {
    items: any[];
    count: number;
    summary: string;
  };
  koneps: {
    vendor: any;
    contracts: any[];
    bidNotices: any[];
    contractCount: number;
    contractSummary: string;
  };
  bizinfo: {
    items: any[];
    count: number;
    summary: string;
  };
  webTech: {
    hosting: any;
    lighthouse: any;
    summary: string;
  };
  existingResearch: {
    cached: any;
    docId: string;
    docUrl: string;
  };
}

let tableEnsured = false;
const folderCache = new Map<string, string>();

/** 타임아웃 안전 래퍼 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

/** AI Caller 응답 텍스트 2중 언래핑 헬퍼 */
export function unwrapAiCallerText(res: any): string {
  if (!res) return "";
  let text = typeof res === "string" ? res : String(res.text ?? res.content ?? "");
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.content === "string") {
        text = parsed.content;
      } else if (parsed && typeof parsed.text === "string") {
        text = parsed.text;
      }
    } catch {
      // 원문 유지
    }
  }
  return text.trim();
}

/** AI Caller JSON 파싱 2중 언래핑 헬퍼 */
export function unwrapAiCallerJson<T = any>(res: any): T | null {
  const raw = unwrapAiCallerText(res);
  if (!raw) return null;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 리서치 보고서 테이블 존재 보장 (7종 감사 컬럼 포함) */
export async function ensureCompanyResearchReportsTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await queryTable(COMPANY_RESEARCH_REPORTS_TABLE, { limit: 1 });
    tableEnsured = true;
    return;
  } catch {
    // 테이블 미존재 시 안전 생성
  }

  try {
    await createTable(
      "SheetBot 기업 심층 리서치 HTML 보고서 대장",
      [
        { name: "id", type: "TEXT" },
        { name: "uuid", type: "TEXT" },
        { name: "user_email", type: "TEXT" },
        { name: "company_name", type: "TEXT" },
        { name: "domain", type: "TEXT" },
        { name: "business_number", type: "TEXT" },
        { name: "source_type", type: "TEXT" },
        { name: "source_file_name", type: "TEXT" },
        { name: "source_file_url", type: "TEXT" },
        { name: "drive_html_url", type: "TEXT" },
        { name: "doc_url", type: "TEXT" },
        { name: "sheet_url", type: "TEXT" },
        { name: "share_url", type: "TEXT" },
        { name: "tax_status", type: "TEXT" },
        { name: "employee_count", type: "TEXT" },
        { name: "avg_salary", type: "TEXT" },
        { name: "contract_summary", type: "TEXT" },
        { name: "smpp_summary", type: "TEXT" },
        { name: "grants_summary", type: "TEXT" },
        { name: "ai_summary", type: "TEXT" },
        { name: "report_html", type: "TEXT" },
        { name: "mcp_data_json", type: "TEXT" },
        { name: "status", type: "TEXT" },
        { name: "created_at", type: "TEXT" },
        { name: "updated_at", type: "TEXT" },
        { name: "updated_by", type: "TEXT" },
        { name: "deleted_at", type: "TEXT" },
        { name: "deleted_by", type: "TEXT" },
        { name: "restored_at", type: "TEXT" },
        { name: "restored_by", type: "TEXT" },
      ],
      { tableName: COMPANY_RESEARCH_REPORTS_TABLE }
    );
    tableEnsured = true;
  } catch (err: any) {
    console.warn("[CompanyResearchEngine] Table ensure warning:", err?.message || err);
  }
}

/** 도메인 정규화 */
export function normalizeDomain(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

/** 텍스트에서 URL 추출 */
export function extractFirstUrlFromText(text: string): string {
  const m = (text || "").match(/https?:\/\/[^\s"'<>()]+/i);
  if (m) return m[0];
  const domainMatch = (text || "").match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i);
  if (domainMatch && !domainMatch[0].includes("@") && /\.(kr|com|co\.kr|net|org|io|ai|cloud|dev|app)$/i.test(domainMatch[0])) {
    return `https://${domainMatch[0]}`;
  }
  return "";
}

/** 웹페이지 경량 텍스트 스크래핑 (URL 자료 보강용) */
export async function fetchLightweightWebContext(urlStr: string): Promise<{ domain: string; text: string }> {
  const domain = normalizeDomain(urlStr);
  if (!urlStr) return { domain: "", text: "" };
  const targetUrl = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SheetBotCompanyResearch/2.0; +https://sheetbot.cloud)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return { domain, text: "" };
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3500);

    const summary = [
      titleMatch ? `페이지 제목: ${titleMatch[1].trim()}` : "",
      descMatch ? `메타 설명: ${descMatch[1].trim()}` : "",
      bodyText ? `본문 발췌: ${bodyText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { domain, text: summary };
  } catch {
    return { domain, text: "" };
  }
}

/**
 * 1단계: 멀티모달 자료(텍스트/URL/이미지/PDF)에서 AI 회사 엔티티 추출
 */
export async function extractCompanyEntities(params: {
  companyName?: string;
  domain?: string;
  sourceText?: string;
  sourceUrl?: string;
  fileBuffer?: Buffer | null;
  fileName?: string;
  fileMimeType?: string;
}): Promise<ExtractedCompanyEntity> {
  const explicitCompany = (params.companyName || "").trim();
  const explicitUrl = (params.sourceUrl || "").trim() || extractFirstUrlFromText(params.sourceText || "");
  const explicitDomain = normalizeDomain(params.domain || explicitUrl);
  const rawText = (params.sourceText || "").trim();

  // URL이 있으면 웹 컨텍스트 수집
  const webContext = explicitUrl ? await fetchLightweightWebContext(explicitUrl) : { domain: "", text: "" };
  const resolvedDomain = explicitDomain || webContext.domain;

  const hasFile = Boolean(params.fileBuffer && params.fileBuffer.length > 0);
  const hasRichInput = hasFile || Boolean(rawText) || Boolean(webContext.text);

  // 단순 회사명/도메인만 있고 추가 자료가 없으면 바로 반환 (속도 최적화)
  if (!hasRichInput) {
    return {
      companyName: explicitCompany || resolvedDomain.replace(/\.[a-z.]+$/i, ""),
      businessNumber: "",
      ceoName: "",
      domain: resolvedDomain,
      industry: "",
      keywords: [],
      address: "",
      sourceSummary: explicitCompany
        ? `직접 입력된 기업명(${explicitCompany}) 및 도메인(${resolvedDomain || "미입력"}) 기반 조사`
        : `직접 입력된 도메인(${resolvedDomain}) 기반 조사`,
    };
  }

  const prompt = `당신은 기업 실사(Due Diligence) 자료 분석 전문가입니다.
제공된 텍스트, 웹페이지 내용, 또는 첨부 파일(명함/사업자등록증/회사소개서 이미지 또는 PDF)에서 조사 대상 회사의 정확한 정보를 추출하여 반드시 순수 JSON으로만 응답하세요.

[사용자 입력 힌트]
- 입력된 회사명: ${explicitCompany || "없음"}
- 입력된 도메인/URL: ${resolvedDomain || explicitUrl || "없음"}
- 입력된 텍스트/메모: ${rawText ? rawText.slice(0, 3000) : "없음"}
${webContext.text ? `\n[웹페이지 본문 발췌]\n${webContext.text.slice(0, 3000)}` : ""}

[출력 JSON 스키마]
{
  "companyName": "정식 상호명 (예: 주식회사 홍길동 -> 홍길동 또는 (주)홍길동, 없으면 빈 문자열)",
  "businessNumber": "사업자등록번호 10자리 숫자만 (하이픈 제거, 없으면 빈 문자열)",
  "ceoName": "대표자명 (없으면 빈 문자열)",
  "domain": "공식 홈페이지 도메인만 (예: example.com, 없으면 빈 문자열)",
  "industry": "핵심 업종 또는 사업 분야 (예: AI 소프트웨어 개발, 친환경 패키징 제조)",
  "keywords": ["핵심 사업 키워드 3~5개"],
  "address": "사업장 주소 (없으면 빈 문자열)",
  "sourceSummary": "업로드된 자료에서 확인된 핵심 사실(주요 제품/서비스, 강점, 연락처, 특이사항 등) 3~5줄 한국어 요약"
}`;

  const files = hasFile
    ? [
        {
          name: params.fileName || "company_source",
          content: params.fileBuffer!.toString("base64"),
          encoding: "base64",
          mimeType: params.fileMimeType || "image/jpeg",
        },
      ]
    : undefined;

  try {
    const aiRes = await withTimeout(
      callAiCaller(prompt, {
        caller: "sheetbot-company-research-extract",
        model: "gemini-3.8-flash",
        temperature: 0.1,
        maxOutputTokens: 1500,
        files,
      }),
      20000,
      null
    );

    const parsed = unwrapAiCallerJson<Partial<ExtractedCompanyEntity>>(aiRes);
    if (parsed) {
      const cleanBNo = String(parsed.businessNumber || "").replace(/[^0-9]/g, "").slice(0, 10);
      const finalDomain = normalizeDomain(String(parsed.domain || "")) || resolvedDomain;
      const finalName =
        String(parsed.companyName || "").trim() ||
        explicitCompany ||
        finalDomain.replace(/\.[a-z.]+$/i, "") ||
        "미확인 기업";

      return {
        companyName: finalName,
        businessNumber: cleanBNo,
        ceoName: String(parsed.ceoName || "").trim(),
        domain: finalDomain,
        industry: String(parsed.industry || "").trim(),
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 6)
          : [],
        address: String(parsed.address || "").trim(),
        sourceSummary:
          String(parsed.sourceSummary || "").trim() ||
          rawText.slice(0, 300) ||
          `${finalName} 업로드 자료 분석 완료`,
      };
    }
  } catch (err: any) {
    console.warn("[CompanyResearchEngine] Entity extract warning:", err?.message || err);
  }

  return {
    companyName: explicitCompany || resolvedDomain.replace(/\.[a-z.]+$/i, "") || "미확인 기업",
    businessNumber: "",
    ceoName: "",
    domain: resolvedDomain,
    industry: "",
    keywords: [],
    address: "",
    sourceSummary: rawText.slice(0, 400) || webContext.text.slice(0, 400) || "업로드 자료 기반 리서치",
  };
}

/**
 * 2단계: EGDesk MCP 다각적 병렬 리서치 (국민연금 + 국세청 + SMPP + 나라장터 + 입찰공고 + 기업마당 + SEO/호스팅 + 사내 캐시)
 */
export async function runMultiAngleMcpResearch(
  entity: ExtractedCompanyEntity
): Promise<MultiAngleMcpResearchResult & { resolvedBusinessNumber: string }> {
  const companyName = entity.companyName.trim();
  const cleanSearchName = companyName.replace(/^(주식회사|\(주\)|㈜)\s*/i, "").replace(/\s*(주식회사|\(주\)|㈜)$/i, "").trim() || companyName;
  const domain = entity.domain.trim();

  // 1차: 국민연금 사업장 검색 (seq 및 사업자번호 확보)
  let npsPrimary: any = null;
  let npsSeq = "";
  let bNoPrefix = "";
  let bNo = entity.businessNumber.replace(/[^0-9]/g, "");

  try {
    const npsLookup = await withTimeout(
      lookupNpsWorkplace({
        workplaceName: cleanSearchName,
        businessNumber: bNo ? bNo.slice(0, 6) : undefined,
      }).catch(() => null),
      5000,
      null
    );

    const npsSearchFallback =
      !npsLookup
        ? await withTimeout(
            searchNpsWorkplaces({ workplaceName: cleanSearchName, display: 3 }).catch(() => null),
            4000,
            null
          )
        : null;

    const candidate =
      npsLookup?.workplace ||
      npsLookup?.primary ||
      npsLookup?.items?.[0] ||
      npsSearchFallback?.items?.[0] ||
      npsSearchFallback?.item?.[0] ||
      null;

    if (candidate) {
      npsPrimary = candidate;
      npsSeq = String(candidate.seq || candidate.workplaceSeq || "").trim();
      bNoPrefix = String(candidate.businessNumberPrefix || candidate.businessNumber || candidate.bzowrRgstNo || "").trim();
      if (!bNo && bNoPrefix) {
        bNo = bNoPrefix.replace(/[^0-9]/g, "").slice(0, 10);
      }
    }
  } catch (err: any) {
    console.warn("[CompanyResearchEngine] NPS lookup warning:", err?.message || err);
  }

  // 10자리 표준 사업자번호 (doc 개설용 fallback 해시 포함)
  let docBNo = bNo.replace(/[^0-9]/g, "");
  const hasReal10DigitBNo = docBNo.length === 10 && !docBNo.startsWith("999");
  if (!hasReal10DigitBNo) {
    if (docBNo.length >= 6) {
      docBNo = docBNo.slice(0, 10).padEnd(10, "0");
    } else {
      let hash = 0;
      const seed = companyName || domain || "company";
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      docBNo = `999${Math.abs(hash).toString().padStart(7, "0").slice(0, 7)}`;
    }
  }

  const bizQuery = entity.industry || entity.keywords[0] || cleanSearchName;
  const fullUrl = domain ? `https://${domain}` : "";

  // 2차: 7대 축 MCP 병렬 조회 (SMPP 포함!)
  const [
    npsDetailRes,
    npsTrendRes,
    bizverifyRes,
    smppRes,
    konepsVendorRes,
    konepsContractsRes,
    bidnoticeRes,
    bizinfoRes,
    hostingRes,
    lighthouseRes,
    cachedResearchRes,
    researchDocRes,
  ] = await Promise.allSettled([
    npsSeq ? withTimeout(getNpsWorkplaceDetail(npsSeq).catch(() => null), 4500, null) : Promise.resolve(null),
    npsSeq ? withTimeout(getNpsWorkplaceTrend(npsSeq).catch(() => null), 4500, null) : Promise.resolve(null),
    hasReal10DigitBNo
      ? withTimeout(callCompanyResearchTool("bizverify_status", { businessNumber: docBNo }).catch(() => null), 4500, null)
      : Promise.resolve(null),
    // ✨ SMPP 중소벤처기업부 기술개발제품 인증현황 (우선구매 13종)
    withTimeout(
      lookupSmppCertifications({
        companyName: cleanSearchName,
        businessNumber: hasReal10DigitBNo ? docBNo : undefined,
        display: 10,
      })
        .then(async (res) => {
          const items = res?.items || res?.certifications || res?.results || [];
          if (Array.isArray(items) && items.length > 0) return res;
          return searchSmppCertifications({ companyName: cleanSearchName, display: 8 }).catch(() => res);
        })
        .catch(() => null),
      5500,
      null
    ),
    withTimeout(
      lookupKonepsVendor({
        companyName: cleanSearchName,
        businessNumber: hasReal10DigitBNo ? docBNo : undefined,
      }).catch(() => null),
      5000,
      null
    ),
    withTimeout(
      searchKonepsContracts({
        category: "goods",
        display: 5,
        institutionName: cleanSearchName,
      }).catch(() => null),
      4500,
      null
    ),
    withTimeout(
      callBidnoticeTool("bidnotice_search", {
        keyword: bizQuery,
        display: 5,
      }).catch(() => null),
      4500,
      null
    ),
    withTimeout(
      searchBizinfo({
        query: bizQuery,
        display: 5,
      }).catch(() => null),
      4500,
      null
    ),
    fullUrl
      ? withTimeout(callHostingCodingTool("hosting_analyze_site", { url: fullUrl, save: false }).catch(() => null), 6000, null)
      : Promise.resolve(null),
    fullUrl
      ? withTimeout(callSeoTool("seo_run_lighthouse", { urls: [fullUrl] }).catch(() => null), 8000, null)
      : Promise.resolve(null),
    withTimeout(searchCompanyResearch(cleanSearchName).catch(() => null), 3500, null),
    withTimeout(
      getOrCreateCompanyResearchDoc({
        businessNumber: docBNo,
        companyName,
        domain: domain || undefined,
        title: `[SheetBot] ${companyName} 기업 심층 리서치 보고서`,
      }).catch(() => null),
      4500,
      null
    ),
  ]);

  const val = <T>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

  const npsDetail = val(npsDetailRes);
  const npsTrend = val(npsTrendRes);
  const bizverifyRaw = val(bizverifyRes);
  const smppRaw = val(smppRes);
  const konepsVendor = val(konepsVendorRes);
  const konepsContractsRaw = val(konepsContractsRes);
  const bidnoticeRaw = val(bidnoticeRes);
  const bizinfoRaw = val(bizinfoRes);
  const hostingRaw = val(hostingRes);
  const lighthouseRaw = val(lighthouseRes);
  const cachedResearch = val(cachedResearchRes);
  const docRes = val(researchDocRes);

  // 국민연금 지표 파싱
  let employeeCount = "-";
  let avgSalary = "-";
  const npsBase = npsDetail || npsPrimary;
  if (npsBase) {
    const subscribers = npsBase.subscriberCount || npsBase.jnngpCnt || npsBase.employees || null;
    const noticeAmount = npsBase.monthlyNoticeAmount || npsBase.crrmmNtcAmt || npsBase.totalAmount || null;
    if (subscribers) employeeCount = `${Number(subscribers).toLocaleString()}명`;
    if (noticeAmount && subscribers && Number(subscribers) > 0) {
      const avg = Math.round(Number(noticeAmount) / Number(subscribers) / 0.09);
      if (avg > 0) avgSalary = `월 ~${Math.round(avg / 10000).toLocaleString()}만원`;
    }
  }

  // 국세청 상태 파싱
  const vItems = bizverifyRaw?.results || bizverifyRaw?.items || [];
  let taxStatus = hasReal10DigitBNo ? "조회 완료" : "사업자번호 미확인";
  if (Array.isArray(vItems) && vItems.length > 0) {
    const first = vItems[0];
    taxStatus = `${first.status || first.b_stt || "계속사업자"} (${first.taxType || first.tax_type || "일반과세자"})`;
  } else if (bizverifyRaw?.status) {
    taxStatus = `${bizverifyRaw.status} (${bizverifyRaw.taxType || "과세정보 확인"})`;
  }

  // SMPP 기술개발제품 인증 파싱
  const smppItems: any[] = Array.isArray(smppRaw?.items)
    ? smppRaw.items
    : Array.isArray(smppRaw?.certifications)
      ? smppRaw.certifications
      : Array.isArray(smppRaw?.results)
        ? smppRaw.results
        : [];
  const smppCount = smppItems.length;
  const smppSummary =
    smppCount > 0
      ? `기술개발제품 인증 ${smppCount}건 확인`
      : "보유 인증 이력 없음(또는 미매칭)";

  // 나라장터 실적/입찰 파싱
  const vendorContracts = Array.isArray(konepsVendor?.contracts) ? konepsVendor.contracts : [];
  const searchContracts = Array.isArray(konepsContractsRaw?.items || konepsContractsRaw?.data)
    ? (konepsContractsRaw?.items || konepsContractsRaw?.data)
    : [];
  const allContracts = vendorContracts.length > 0 ? vendorContracts : searchContracts;
  const bidNotices = Array.isArray(bidnoticeRaw?.items || bidnoticeRaw?.data)
    ? (bidnoticeRaw?.items || bidnoticeRaw?.data)
    : [];
  const contractCount = allContracts.length;
  const contractSummary =
    contractCount > 0 ? `공공계약 ${contractCount}건 확인` : "최근 공공계약 실적 없음";

  // 기업마당 지원사업 파싱
  const bizinfoItems = Array.isArray(bizinfoRaw?.items || bizinfoRaw?.data)
    ? (bizinfoRaw?.items || bizinfoRaw?.data)
    : [];
  const grantsCount = bizinfoItems.length;
  const grantsSummary =
    grantsCount > 0 ? `맞춤 지원사업 ${grantsCount}건 추천` : "관련 추천 공고 없음";

  // 웹사이트/SEO/호스팅 요약
  const webSummaryParts: string[] = [];
  if (hostingRaw) webSummaryParts.push("호스팅/SSL 분석 완료");
  if (lighthouseRaw) webSummaryParts.push("SEO/성능 진단 완료");
  const webTechSummary = webSummaryParts.length > 0 ? webSummaryParts.join(" · ") : domain ? "웹 진단 정보 없음" : "도메인 미입력";

  const docId = docRes?.docId || docRes?.id || "";
  const docUrl = docId ? `https://sheetbot.cloud/research?id=${docId}` : "";

  return {
    resolvedBusinessNumber: hasReal10DigitBNo ? docBNo : (bNoPrefix || docBNo.slice(0, 6)),
    nps: {
      primary: npsPrimary,
      detail: npsDetail,
      trend: npsTrend,
      employeeCount,
      avgSalary,
      bNoPrefix,
    },
    bizverify: {
      raw: bizverifyRaw,
      taxStatus,
    },
    smpp: {
      items: smppItems.slice(0, 10),
      count: smppCount,
      summary: smppSummary,
    },
    koneps: {
      vendor: konepsVendor,
      contracts: allContracts.slice(0, 8),
      bidNotices: bidNotices.slice(0, 5),
      contractCount,
      contractSummary,
    },
    bizinfo: {
      items: bizinfoItems.slice(0, 6),
      count: grantsCount,
      summary: grantsSummary,
    },
    webTech: {
      hosting: hostingRaw,
      lighthouse: lighthouseRaw,
      summary: webTechSummary,
    },
    existingResearch: {
      cached: cachedResearch,
      docId,
      docUrl,
    },
  };
}

/**
 * HTML 문자열 안전 정제 (코드펜스 제거 및 완전 문서 보장)
 */
function sanitizeGeneratedHtml(rawHtml: string): string {
  let cleaned = (rawHtml || "").trim();
  // ```html ... ``` 코드 블록 제거
  const fenced = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    cleaned = fenced[1].trim();
  }
  // <!DOCTYPE html> 또는 <html 이전의 불필요한 설명 텍스트 제거
  const docIdx = cleaned.search(/<!doctype\s+html|<html/i);
  if (docIdx > 0) {
    cleaned = cleaned.slice(docIdx).trim();
  }
  const endHtmlIdx = cleaned.toLowerCase().lastIndexOf("</html>");
  if (endHtmlIdx !== -1) {
    cleaned = cleaned.slice(0, endHtmlIdx + 7).trim();
  }
  return cleaned;
}

/**
 * AI 생성 실패 시 안전 폴백 HTML 보고서
 */
function buildFallbackResearchHtml(
  entity: ExtractedCompanyEntity,
  mcp: MultiAngleMcpResearchResult & { resolvedBusinessNumber: string },
  aiSummary: string,
  nowStr: string
): string {
  const esc = (s: any) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(entity.companyName)} — 기업 심층 리서치 보고서</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; line-height: 1.65; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; }
  .hero { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #fff; border-radius: 20px; padding: 28px; margin-bottom: 24px; }
  .hero h1 { margin: 8px 0 6px; font-size: 28px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: rgba(56,189,248,0.2); color: #7dd3fc; font-size: 12px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-bottom: 24px; }
  .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
  .kpi .label { font-size: 12px; color: #64748b; }
  .kpi .val { font-size: 18px; font-weight: 800; margin-top: 6px; color: #0f172a; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; margin-bottom: 18px; }
  .card h2 { margin: 0 0 12px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <span class="badge">SheetBot AI · MCP 기업 심층 리서치</span>
      <h1>${esc(entity.companyName)}</h1>
      <div>도메인: ${esc(entity.domain || "미확인")} · 사업자번호: ${esc(mcp.resolvedBusinessNumber || "미확인")} · 조사일시: ${esc(nowStr)}</div>
    </div>
    <div class="grid">
      <div class="kpi"><div class="label">국세청 상태</div><div class="val">${esc(mcp.bizverify.taxStatus)}</div></div>
      <div class="kpi"><div class="label">국민연금 고용</div><div class="val">${esc(mcp.nps.employeeCount)}</div></div>
      <div class="kpi"><div class="label">추정 평균 급여</div><div class="val">${esc(mcp.nps.avgSalary)}</div></div>
      <div class="kpi"><div class="label">SMPP 기술인증</div><div class="val">${esc(mcp.smpp.summary)}</div></div>
      <div class="kpi"><div class="label">공공조달(나라장터)</div><div class="val">${esc(mcp.koneps.contractSummary)}</div></div>
      <div class="kpi"><div class="label">추천 지원사업</div><div class="val">${esc(mcp.bizinfo.summary)}</div></div>
    </div>
    <div class="card">
      <h2>경영진 핵심 요약</h2>
      <pre>${esc(aiSummary)}</pre>
    </div>
    <div class="card">
      <h2>업로드 자료 분석 요약</h2>
      <p>${esc(entity.sourceSummary)}</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 3단계: AI 자유 HTML 코드 생성 + 3줄 Executive Summary 생성
 */
export async function generateFreeformResearchHtml(params: {
  entity: ExtractedCompanyEntity;
  mcp: MultiAngleMcpResearchResult & { resolvedBusinessNumber: string };
  nowStr: string;
}): Promise<{ html: string; summary: string; tokensUsed: number }> {
  const { entity, mcp, nowStr } = params;

  const compactMcpPayload = {
    company: entity,
    businessNumber: mcp.resolvedBusinessNumber,
    analyzedAt: nowStr,
    bizverify: mcp.bizverify,
    nps: {
      employeeCount: mcp.nps.employeeCount,
      avgSalary: mcp.nps.avgSalary,
      primary: mcp.nps.primary,
      detail: mcp.nps.detail,
      trend: Array.isArray(mcp.nps.trend?.items || mcp.nps.trend)
        ? (mcp.nps.trend?.items || mcp.nps.trend).slice(0, 12)
        : mcp.nps.trend,
    },
    smpp: {
      summary: mcp.smpp.summary,
      count: mcp.smpp.count,
      items: mcp.smpp.items.slice(0, 8),
    },
    koneps: {
      contractSummary: mcp.koneps.contractSummary,
      contracts: mcp.koneps.contracts.slice(0, 6),
      bidNotices: mcp.koneps.bidNotices.slice(0, 5),
    },
    bizinfo: {
      summary: mcp.bizinfo.summary,
      items: mcp.bizinfo.items.slice(0, 5),
    },
    webTech: {
      summary: mcp.webTech.summary,
      hosting: mcp.webTech.hosting ? JSON.stringify(mcp.webTech.hosting).slice(0, 1200) : null,
      lighthouse: mcp.webTech.lighthouse ? JSON.stringify(mcp.webTech.lighthouse).slice(0, 1200) : null,
    },
  };

  const jsonContext = JSON.stringify(compactMcpPayload, null, 2).slice(0, 14000);

  // 3-A: 3줄 Executive Summary & 리치 HTML 코드 동시 병렬 생성
  const summaryPrompt = `당신은 B2B 기업 실사 수석 애널리스트입니다.
아래 MCP 실측 데이터와 업로드 자료 요약을 바탕으로 경영진과 영업 실무자를 위한 3줄 Executive Summary를 한국어로 간결하게 작성하세요.
허위 수치는 절대 생성하지 마세요.

${jsonContext}

형식:
1. [기업 규모·신용] ...
2. [기술인증(SMPP)·공공조달·웹역량] ...
3. [영업·제휴 핵심 공략 포인트] ...`;

  const htmlPrompt = `당신은 맥킨지·BCG 스타일의 임원용 기업 실사(Due Diligence) 리포트를 제작하는 최고급 프론트엔드 디자이너 겸 전략 애널리스트입니다.
아래 수집된 실제 자료와 EGDesk MCP 실측 데이터(국세청, 국민연금, SMPP 기술개발제품 인증, 조달청 나라장터, 기업마당 지원사업, 웹사이트/SEO/SSL 진단)를 바탕으로 **완전 자립형(Standalone) 단일 HTML5 보고서 코드 전체**를 자유롭고 창의적으로 작성하세요.

[필수 디자인 및 기술 규칙]
1. 반드시 \`<!DOCTYPE html>\`로 시작하고 \`</html>\`로 끝나는 완전한 단일 HTML 파일 코드만 출력하세요. (설명 문구 금지)
2. 외부 JS/CSS CDN에 의존하지 말고 \`<style>\` 태그 안에 현대적이고 세련된 반응형 CSS를 직접 작성하세요 (모바일 360px ~ 데스크톱 1200px 완벽 대응, \`@media print\` 인쇄 최적화 포함).
3. 다음 섹션을 시각적으로 풍부하게 구성하세요:
   - **히어로 헤더**: 기업명, 업종/키워드 뱃지, 도메인, 사업자번호, 조사 일시, 종합 신뢰도/매력도 인디케이터
   - **핵심 KPI 대시보드 카드**: 국세청 상태, 국민연금 고용 인원, 추정 평균 급여, SMPP 기술개발제품 인증 건수, 나라장터 공공계약 실적, 맞춤 지원사업 건수
   - **업로드 자료 기반 기업 프로파일**: 사용자가 올린 텍스트/URL/이미지/PDF에서 추출된 핵심 사업 정보 요약
   - **고용·재무 안정성 분석 (국민연금)**: 인원/급여 분석 및 추이 데이터가 있으면 순수 SVG 막대/꺾은선 차트로 시각화
   - **기술력 & 인증 역량 (SMPP 기술개발제품 우선구매 13종)**: SMPP 조회 결과 인증 목록/뱃지 표기 (데이터 없으면 '확인된 SMPP 기술개발제품 인증 없음'으로 정직하게 표기)
   - **공공조달(나라장터) & 정부지원사업(기업마당)**: 계약 실적 테이블 및 추천 지원사업 리스트
   - **디지털/웹사이트 기술 진단**: 도메인 SSL·호스팅·SEO/Lighthouse 분석 결과
   - **SWOT 분석 & B2B 영업·제휴 실행 전략**: 실무자가 바로 미팅에 활용할 수 있는 공략 포인트 및 체크리스트
4. 데이터 정직성 절대 준수: 제공된 JSON에 없는 수치나 계약·인증 내역을 지어내지 말고, 미확인 항목은 "공개 데이터 미확인"으로 명확히 표기하세요.
5. \`<script>\` 태그는 사용하지 말고 순수 HTML + CSS + 인라인 SVG만으로 0초 렌더링되고 안전한 보고서를 만드세요.

[수집된 실측 데이터 JSON]
${jsonContext}`;

  const [summaryRes, htmlRes] = await Promise.allSettled([
    withTimeout(
      callAiCaller(summaryPrompt, {
        caller: "sheetbot-company-research-summary",
        model: "gemini-3.8-flash",
        temperature: 0.2,
        maxOutputTokens: 600,
      }),
      12000,
      null
    ),
    withTimeout(
      callAiCaller(htmlPrompt, {
        caller: "sheetbot-company-research-html",
        model: "gemini-3.8-flash",
        temperature: 0.35,
        maxOutputTokens: 8192,
      }),
      42000,
      null
    ),
  ]);

  const defaultSummary = `1. [기업 규모·신용] 국세청 ${mcp.bizverify.taxStatus}, 국민연금 가입 ${mcp.nps.employeeCount}(추정 급여 ${mcp.nps.avgSalary})입니다.\n2. [기술인증·조달] SMPP ${mcp.smpp.summary}, 조달청 ${mcp.koneps.contractSummary}입니다.\n3. [영업·제휴 전략] ${mcp.bizinfo.summary} 및 업로드 자료(${entity.industry || "핵심 사업"}) 중심으로 제휴 포인트를 제안할 수 있습니다.`;

  const summaryText =
    summaryRes.status === "fulfilled" ? unwrapAiCallerText(summaryRes.value) : "";
  const finalSummary = summaryText.length > 20 ? summaryText : defaultSummary;

  const rawHtml =
    htmlRes.status === "fulfilled" ? unwrapAiCallerText(htmlRes.value) : "";
  const sanitized = sanitizeGeneratedHtml(rawHtml);

  const isValidHtml =
    sanitized.length > 500 &&
    /<html[\s>]/i.test(sanitized) &&
    /<body[\s>]/i.test(sanitized);

  const finalHtml = isValidHtml
    ? sanitized
    : buildFallbackResearchHtml(entity, mcp, finalSummary, nowStr);

  const summaryTokens =
    summaryRes.status === "fulfilled" ? Number(summaryRes.value?.usage?.totalTokens || 0) : 0;
  const htmlTokens =
    htmlRes.status === "fulfilled" ? Number(htmlRes.value?.usage?.totalTokens || 0) : 0;

  return {
    html: finalHtml,
    summary: finalSummary,
    tokensUsed: summaryTokens + htmlTokens,
  };
}

/**
 * 구글 드라이브 전용 폴더([SheetBot] 기업 리서치 보고서) ID 확보 및 영구 바인딩
 * - Strict Folder-Id Guard: 유효한 folderId를 확보하지 못하면 null 반환 (기본 감시 폴더 유출 원천 차단)
 */
export async function resolveCompanyResearchFolderId(
  userEmail: string,
  callOptions?: WorkspaceVisitorCallOptions
): Promise<string | null> {
  const cleanEmail = userEmail.toLowerCase().trim();
  const cacheKey = `${cleanEmail}::COMPANY_RESEARCH_REPORT`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  // 1. DB 바인딩 조회
  try {
    const existing = await queryTable("sheetbot_user_sheet_bindings", {
      filters: { user_email: cleanEmail, sheet_type: "COMPANY_RESEARCH_REPORT" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const row = (existing.rows || []).find((r: any) => !r.deleted_at);
    if (row?.folder_id) {
      folderCache.set(cacheKey, String(row.folder_id));
      return String(row.folder_id);
    }
  } catch {}

  const folderName = "[SheetBot] 기업 리서치 보고서";

  // 2. 드라이브에서 기존 폴더 탐색 또는 신규 생성
  try {
    const listed = await listDriveFiles({
      query: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      pageSize: 5,
    }, callOptions).catch(() => null);

    let folderId: string | null = listed?.files?.[0]?.id || null;

    if (!folderId) {
      const created = await callDriveTool(
        "drive_create_folder",
        { name: folderName, preferOAuth: true },
        callOptions
      ).catch(() => null);
      folderId = created?.id || created?.folderId || created?.file?.id || null;
    }

    if (folderId) {
      folderCache.set(cacheKey, folderId);
      const nowStr = getKoreanTimeString();
      await insertRows("sheetbot_user_sheet_bindings", [
        {
          id: `bind_cr_folder_${Date.now()}`,
          uuid: crypto.randomUUID(),
          user_email: cleanEmail,
          sheet_type: "COMPANY_RESEARCH_REPORT",
          spreadsheet_id: "",
          spreadsheet_url: "",
          sheet_title: folderName,
          folder_id: folderId,
          created_at: nowStr,
          updated_at: nowStr,
          updated_by: cleanEmail,
        },
      ]).catch(() => {});
      return folderId;
    }
  } catch (err: any) {
    console.warn("[CompanyResearchEngine] Folder resolve warning:", err?.message || err);
  }

  return null;
}

/**
 * HTML 보고서 및 원본 자료를 격리된 구글 드라이브 폴더에 업로드
 */
export async function uploadResearchArtifactsToDrive(params: {
  userEmail: string;
  companyName: string;
  reportHtml: string;
  sourceFileBuffer?: Buffer | null;
  sourceFileName?: string;
  sourceFileMimeType?: string;
  callOptions?: WorkspaceVisitorCallOptions;
}): Promise<{ driveHtmlUrl: string; sourceFileUrl: string }> {
  const folderId = await resolveCompanyResearchFolderId(params.userEmail, params.callOptions);
  if (!folderId) {
    // Strict Folder-Id Guard: 폴더 ID 미확정 시 업로드 중단 (기본 감시 폴더 유출 원천 차단)
    console.warn("[CompanyResearchEngine] Target folderId unavailable — skipping Drive upload to prevent root folder leak.");
    return { driveHtmlUrl: "", sourceFileUrl: "" };
  }

  const safeCompany = (params.companyName || "기업").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 40);
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const htmlFileName = `${safeCompany}_기업리서치보고서_${dateStamp}.html`;

  const [htmlUpload, sourceUpload] = await Promise.allSettled([
    uploadDriveFileWithBridge({
      buffer: Buffer.from(params.reportHtml, "utf-8"),
      fileName: htmlFileName,
      folderId,
      mimeType: "text/html",
      userEmail: params.userEmail,
      callOptions: params.callOptions,
    }),
    params.sourceFileBuffer && params.sourceFileBuffer.length > 0
      ? uploadDriveFileWithBridge({
          buffer: params.sourceFileBuffer,
          fileName: params.sourceFileName || `${safeCompany}_원본자료_${dateStamp}`,
          folderId,
          mimeType: params.sourceFileMimeType || "application/octet-stream",
          userEmail: params.userEmail,
          callOptions: params.callOptions,
        })
      : Promise.resolve(null),
  ]);

  const driveHtmlUrl =
    htmlUpload.status === "fulfilled" ? htmlUpload.value?.webViewLink || "" : "";
  const sourceFileUrl =
    sourceUpload.status === "fulfilled" && sourceUpload.value
      ? sourceUpload.value.webViewLink || ""
      : "";

  return { driveHtmlUrl, sourceFileUrl };
}
