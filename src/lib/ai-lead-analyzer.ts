import {
  callAiCaller,
  updateRows,
  searchBizinfoGrants,
  lookupCompanyProfile,
  searchCompanyCandidates,
  type RealCompanyProfile,
  type BizinfoGrantItem,
} from "@/lib/egdesk-helpers";

export interface AiLeadScore {
  tier: "S" | "A" | "B" | "C";
  score: number; // 0 ~ 100
  conversionProbability: number; // 0 ~ 100 (%)
  estimatedPriceRange: string; // 예: "450만 ~ 650만원"
  urgency: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  recommendedAction: string;
}

export interface MatchedVoucher {
  name: string;
  agency: string;
  supportRatio: string;
  matchReason: string;
  postUrl?: string;
}

export interface AiCompanyAnalysis {
  companyName: string;
  industry: string;
  industryInsight: string;
  automationScope: string[];
  matchedVouchers: MatchedVoucher[];
  salesPitchingPoints: string[];
  riskFactors: string[];
  analyzedAt: string;
  realCompanyProfile?: RealCompanyProfile | null;
  liveBizinfoAnnouncements?: BizinfoGrantItem[];
}

export interface LeadAnalysisInput {
  type: "ENTERPRISE" | "FDE_APPLICATION" | "FDE_REQUEST" | "GENERAL";
  companyName?: string;
  bizNumber?: string;
  websiteUrl?: string;
  contactName?: string;
  userEmail?: string;
  phone?: string;
  industry?: string;
  targetAreas?: string;
  useVoucher?: string;
  title?: string;
  content?: string;
}

export interface LeadAnalysisResult {
  score: AiLeadScore;
  analysis: AiCompanyAnalysis;
}

/**
 * 고객 문의 / 기업 맞춤 견적 신청에 대한 AI B2B 리드 스코어링 및 정부지원사업 매칭 분석
 * (이지데스크 MCP 3종 연동: egdesk-ai-caller + egdesk-bizinfo + egdesk-company-research)
 * @param selectedProfile 관리자가 공공데이터 후보군 중 명시적으로 선택한 기업 프로필 (null인 경우 일반 기업 분석)
 */
export async function analyzeInquiryLead(
  input: LeadAnalysisInput,
  selectedProfile?: RealCompanyProfile | null
): Promise<LeadAnalysisResult> {
  const {
    type,
    companyName = "미기재 기업",
    bizNumber = "",
    websiteUrl = "",
    contactName = "담당자",
    userEmail = "",
    phone = "",
    industry = "일반 기업",
    targetAreas = "시트 자동화",
    useVoucher = "NONE",
    title = "",
    content = "",
  } = input;

  const hasValidCompany = Boolean(
    companyName && companyName.trim() && companyName !== "미기재 기업" && companyName !== "귀사"
  );
  if (!hasValidCompany) {
    throw new Error("상호명(회사명)이 기재되지 않아 기업 AI 진단을 실행할 수 없습니다.");
  }

  const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  // 1. [이지데스크 MCP 실시간 연동]: 국민연금 사업장 공공데이터 + 기업마당(Bizinfo) 최신 공고 실시간 병렬 수집
  let realProfile: RealCompanyProfile | null = null;
  let liveAnnouncements: BizinfoGrantItem[] = [];

  try {
    let profilePromise: Promise<RealCompanyProfile | null>;
    if (selectedProfile !== undefined) {
      // 관리자가 확정한 프로필(또는 null) 직접 적용
      profilePromise = Promise.resolve(selectedProfile);
    } else {
      profilePromise = lookupCompanyProfile(companyName, bizNumber);
    }

    realProfile = await profilePromise.catch(() => null);

    // 기업의 실제 소재지(주소), 업종, 고용 규모를 주입하여 기업마당 실시간 공고 지능형 맞춤 수집
    liveAnnouncements = await searchBizinfoGrants({
      category: "tech",
      display: 4,
      companyAddress: realProfile?.address,
      companyIndustry: realProfile?.industryName || industry,
      subscriberCount: realProfile?.subscriberCount,
    }).catch(() => []);
  } catch (mcpErr: any) {
    console.warn("[AI Lead Analyzer] MCP enrichment warning:", mcpErr.message);
  }

  // MCP로 수집된 실시간 공공데이터를 프롬프트에 직접 주입
  const realProfileText = realProfile
    ? `
- 실제 법인/사업장명: ${realProfile.workplaceName}
- 사업자번호: ${realProfile.businessNumberPrefix || bizNumber || "미공개"}
- 사업장 소재지: ${realProfile.address || "미기재"}
- 법인/사업자 구분: ${realProfile.form || "일반 법인"}
- 공공 고용 인원(국민연금 가입자): ${realProfile.subscriberCount ? `${realProfile.subscriberCount}명` : "확인 중"}
- 공공데이터 등록 업종: ${realProfile.industryName || industry || "일반 제조업/서비스업"}
- 설립일자: ${realProfile.establishedDate || "미상"}
`.trim()
    : "공공데이터 상호 미일치 또는 단독 개인 사업자 (추가 서류 확인 필요)";

  const liveAnnouncementsText =
    liveAnnouncements.length > 0
      ? liveAnnouncements
          .map(
            (a, i) =>
              `${i + 1}. [${a.title}] (소관: ${a.agency || a.executor}, 접수: ${a.period || "접수중"}, 링크: ${a.postUrl})`
          )
          .join("\n")
      : "현재 접수 중인 기술/디지털 혁신 기본 바우처 풀 적용";

  const prompt = `
당신은 대한민국 B2B 기업 대상 구글 스프레드시트 기반 경량 ERP & AI 업무 자동화 솔루션 'SheetBot(시트봇)'의 수석 비즈니스 애널리스트 및 정부지원사업 전문 컨설턴트입니다.
접수된 고객 문의와 [이지데스크 공공데이터 MCP]에서 실시간 수집된 실제 기업 프로필 및 기업마당 최신 공고를 종합 분석하여 [B2B 리드 스코어링]과 [기업 배경 분석 및 정부지원사업 매칭 리포트]를 JSON 규격으로 산출해 주세요.

[고객 접수 정보]
- 유형: ${type}
- 입력 기업/기관명: ${companyName}
- 사업자등록번호: ${bizNumber || "미기재"}
- 웹사이트 / 쇼핑몰: ${websiteUrl || "미기재"}
- 담당자: ${contactName} (연락처: ${phone || "미기재"}, 이메일: ${userEmail || "미기재"})
- 업종/산업군: ${industry}
- 희망 자동화 영역: ${targetAreas}
- 정부지원사업(바우처) 희망 여부: ${useVoucher}
- 제목: ${title}
- 상세 요구사항:
${content || "(내용 없음)"}

[이지데스크 egdesk-company-research MCP 실시간 조회 결과]
${realProfileText}

[이지데스크 egdesk-bizinfo MCP 기업마당 실시간 정부지원사업 공고]
${liveAnnouncementsText}

[분석 지침]
1. 리드 스코어링 (score):
   - 실제 기업 프로필(고용 인원, 업력, 설립일)과 요구사항을 바탕으로 정밀 평가
   - tier: "S" (수주 확률 80% 이상, 10인 이상 법인, 예산 확보 유력, 실물/공정 연계 요구), "A" (60~79%, 명확한 니즈), "B" (40~59%, 일반 탐색), "C" (40% 미만 단순 문의)
   - score: 0~100점 잠재 가치 종합 점수
   - conversionProbability: 0~100 (%) 현실적 수주 성공 확률
   - estimatedPriceRange: 구축 예상 견적가 (예: "450만 ~ 650만원", "800만 ~ 1,500만원", "무상 온보딩")
   - urgency: "HIGH", "MEDIUM", "LOW"
   - summary: 영업 대표가 한눈에 파악할 1줄 핵심 진단 (실제 종업원 수나 업종 특성 언급)
   - recommendedAction: 수주를 위한 즉시 권장 행동 (예: "기술영업 PM 24시간 내 유선 미팅 제안 및 바우처 매칭 브리핑")
2. 기업 및 지원사업 분석 (analysis):
   - industryInsight: 해당 업종의 전형적인 수기/엑셀 업무 비효율 분석 및 SheetBot 침투 전략
   - automationScope: 구축을 권장하는 3~4가지 핵심 기능 배열 (예: ["자재 발주 및 입고 시트", "라벨/바코드 실물 프린터 연동", "모바일 현장 재고 실사"])
   - matchedVouchers: 위 기업마당 실시간 공고 및 중기부 비대면 바우처/스마트공방 중 가장 적합한 2~3종 매칭 (각 항목: name, agency, supportRatio, matchReason, postUrl)
     [중요 규칙]: postUrl은 반드시 'https://'로 시작하는 유효한 인터넷 주소여야 합니다. 특정 공고 URL이 없거나 상시 지원사업인 경우 설명 문장을 절대 넣지 말고 반드시 빈 문자열("")로 반환하세요.
   - salesPitchingPoints: 고객 설득을 위한 2~3가지 핵심 세일즈 무기
   - riskFactors: 도입 시 유의할 점이나 사전 확인 사항 1~2가지

[출력 형식 - 순수 JSON만 반환]
{
  "score": {
    "tier": "S" | "A" | "B" | "C",
    "score": 88,
    "conversionProbability": 85,
    "estimatedPriceRange": "400만 ~ 600만원",
    "urgency": "HIGH",
    "summary": "...",
    "recommendedAction": "..."
  },
  "analysis": {
    "companyName": "${companyName}",
    "industry": "${industry}",
    "industryInsight": "...",
    "automationScope": ["...", "..."],
    "matchedVouchers": [
      {
        "name": "...",
        "agency": "...",
        "supportRatio": "...",
        "matchReason": "...",
        "postUrl": "https://..."
      }
    ],
    "salesPitchingPoints": ["...", "..."],
    "riskFactors": ["..."],
    "analyzedAt": "${nowStr}"
  }
}
`.trim();

  try {
    const res = await callAiCaller(prompt, {
      model: "gemini-2.5-flash",
      temperature: 0.2,
    });

    const rawText = (res.text || res.content || "").trim();
    const parsed = unwrapLeadAnalysisJson(rawText);
    if (parsed && parsed.score && parsed.analysis) {
      parsed.analysis.analyzedAt = parsed.analysis.analyzedAt || nowStr;
      parsed.analysis.companyName = parsed.analysis.companyName || companyName;
      parsed.analysis.industry = parsed.analysis.industry || industry;
      parsed.analysis.realCompanyProfile = realProfile;
      parsed.analysis.liveBizinfoAnnouncements = liveAnnouncements;

      // postUrl 정제: http/https가 아닌 설명 텍스트가 들어온 경우 빈 문자열로 정제
      if (Array.isArray(parsed.analysis.matchedVouchers)) {
        parsed.analysis.matchedVouchers = parsed.analysis.matchedVouchers.map((v) => ({
          ...v,
          postUrl:
            typeof v.postUrl === "string" && /^(https?:\/\/)/i.test(v.postUrl.trim())
              ? v.postUrl.trim()
              : "",
        }));
      }

      return parsed;
    }

    const fallback = getFallbackLeadAnalysis(input, nowStr);
    fallback.analysis.realCompanyProfile = realProfile;
    fallback.analysis.liveBizinfoAnnouncements = liveAnnouncements;
    return fallback;
  } catch (err: any) {
    console.warn("[AI Lead Analyzer] callAiCaller error, using fallback analysis:", err.message);
    const fallback = getFallbackLeadAnalysis(input, nowStr);
    fallback.analysis.realCompanyProfile = realProfile;
    fallback.analysis.liveBizinfoAnnouncements = liveAnnouncements;
    return fallback;
  }
}

/**
 * AI Caller 응답 JSON 파싱 및 2중 언래핑 안전 처리
 */
function unwrapLeadAnalysisJson(raw: string): LeadAnalysisResult | null {
  if (!raw) return null;
  try {
    let clean = raw.trim();
    if (clean.startsWith("```json")) {
      clean = clean.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```")) {
      clean = clean.replace(/^```\s*/i, "").replace(/\s*```$/, "");
    }

    const firstPass = JSON.parse(clean);

    // 메타데이터 래퍼({ content: "..." }) 구조인 경우 2차 언래핑
    if (firstPass && typeof firstPass.content === "string") {
      try {
        let innerClean = firstPass.content.trim();
        if (innerClean.startsWith("```json")) {
          innerClean = innerClean.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
        } else if (innerClean.startsWith("```")) {
          innerClean = innerClean.replace(/^```\s*/i, "").replace(/\s*```$/, "");
        }
        return JSON.parse(innerClean);
      } catch {
        // 2차 파싱 실패 시 1차 결과가 맞는지 확인
      }
    }

    if (firstPass && firstPass.score && firstPass.analysis) {
      return firstPass as LeadAnalysisResult;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 지능형 고품질 폴백 리드 스코어링 & 분석 데이터
 */
function getFallbackLeadAnalysis(input: LeadAnalysisInput, analyzedAt: string): LeadAnalysisResult {
  const {
    type,
    companyName = "고객사",
    industry = "일반 기업",
    targetAreas = "업무 자동화",
    useVoucher = "NONE",
    content = "",
  } = input;

  const isManufacture =
    industry.includes("제조") ||
    industry.includes("생산") ||
    content.includes("프린터") ||
    content.includes("자재") ||
    content.includes("발주");
  const wantsVoucher = useVoucher === "YES" || content.includes("바우처") || content.includes("지원사업");

  if (type === "ENTERPRISE" || isManufacture) {
    const tier = wantsVoucher ? "S" : "A";
    const prob = wantsVoucher ? 88 : 75;
    return {
      score: {
        tier,
        score: wantsVoucher ? 92 : 82,
        conversionProbability: prob,
        estimatedPriceRange: isManufacture ? "450만 ~ 650만원" : "300만 ~ 500만원",
        urgency: "HIGH",
        summary: `${companyName}은 ${industry} 분야 실물 업무(자재/출력) 및 ${wantsVoucher ? "정부지원사업 연계" : "자동화"} 니즈가 뚜렷한 고가치 수주 유력 고객입니다.`,
        recommendedAction: "24시간 이내 기술영업 PM 배정 후 맞춤 기능 데모 시연 및 바우처 매칭 계획안 발송 권장",
      },
      analysis: {
        companyName,
        industry,
        industryInsight: `${industry} 업종은 수기 장부나 분산된 엑셀로 인해 자재 입출고 누락 및 거래처 마감 지연이 빈번합니다. 기존 시트를 그대로 UI로 활용하는 SheetBot 도입 시 즉각적인 ROI를 기대할 수 있습니다.`,
        automationScope: [
          "실시간 자재 발주 및 입출고 재고 자동 추적 시트",
          "외주/거래처별 납품 명세서 자동 생성 및 실물 프린터 출력 연동",
          "월 마감 정산 자동 집계 및 거래처 알림톡/문자 자동 발송",
          "SQLite 클라우드 동기화로 다중 사용자 동시 편집 충돌 방지",
        ],
        matchedVouchers: [
          {
            name: "중소벤처기업부 비대면 서비스 바우처",
            agency: "중소벤처기업부 / 창업진흥원",
            supportRatio: "최대 70% 국비 지원 (자부담 30%)",
            matchReason: "클라우드 기반 업무 협업 및 자동화 솔루션 도입 시 필수 지원 가능",
          },
          {
            name: "소상공인 스마트공방 기술보급사업",
            agency: "소상공인시장진흥공단",
            supportRatio: "최대 4,900만원 국비 지원 (자부담 30%)",
            matchReason: isManufacture
              ? "제조/생산 현장의 수기 공정 디지털화 및 바코드/프린터 설비 연동 전액 인정"
              : "디지털 전환 공정 도입 시 적합",
          },
          {
            name: "중소기업 클라우드 서비스 보급·확산 사업",
            agency: "정보통신산업진흥원(NIPA)",
            supportRatio: "이용료 최대 80% 지원 (최대 1,550만원)",
            matchReason: "Google Apps Script 및 클라우드 연동 경량 ERP 도입 시 적격",
          },
        ],
        salesPitchingPoints: [
          "수천만 원대 무거운 ERP 대신, 현장 실무자가 이미 익숙한 구글 스프레드시트 기반으로 단 3일 만에 실무 가동",
          "정부지원 바우처를 활용하여 실제 기업 부담금을 100만 원대로 대폭 경감 가능",
          "단순 파일 관리가 아닌 실제 프린터/외주발주/문자발송까지 일원화된 원클릭 자동화 엔진 제공",
        ],
        riskFactors: [
          "현장 프린터 기종 및 네트워크 환경(로컬 프린터 vs 네트워크 프린터) 사전 확인 필요",
          "현재 사용 중인 기존 엑셀 서식 파일 샘플 수령 필요",
        ],
        analyzedAt,
      },
    };
  }

  if (type === "FDE_APPLICATION") {
    return {
      score: {
        tier: "S",
        score: 95,
        conversionProbability: 95,
        estimatedPriceRange: "파트너십 온보딩 (건당 30만~200만원 수익 쉐어)",
        urgency: "HIGH",
        summary: "시트봇 핵심 기술 이해도가 높고 현장 솔루션 구축 역량을 보유한 최우선 영입 대상 핵심 FDE 파트너입니다.",
        recommendedAction: "15분 1:1 온보딩 커피챗을 즉시 제안하여 핵심 프로젝트 배정 및 파트너 계약 체결",
      },
      analysis: {
        companyName: "FDE 파트너 지원",
        industry: "소프트웨어 엔지니어링 / 솔루션 아키텍트",
        industryInsight: "시트봇 생태계 확장을 위해 고난도 기업 맞춤 커스터마이징을 전담할 수 있는 핵심 개발 파트너가 필수적입니다.",
        automationScope: [
          "기업 맞춤 Google Apps Script 고급 매크로 구축",
          "외부 ERP / 레거시 시스템 및 이지데스크 터널 REST API 연동",
          "고객사 현장 방문 및 업무 프로세스 AX 컨설팅",
        ],
        matchedVouchers: [
          {
            name: "시트봇 공인 FDE 파트너 프로그램",
            agency: "SheetBot HQ",
            supportRatio: "프로젝트 수주 금액의 최대 70% 수익 배분",
            matchReason: "우수 파트너에게 프리미엄 기업 고객 안건 우선 배정",
          },
        ],
        salesPitchingPoints: [
          "시트봇 자동화 툴체인 및 표준 라이브러리(EgdeskClient)를 통한 개발 생산성 5배 향상",
          "영업/마케팅 부담 없이 순수 구축 업무에만 집중할 수 있는 파트너십 환경",
        ],
        riskFactors: ["주당 가용 작업 시간 및 선호 프로젝트 도메인(제조, 유통, 이커머스 등) 조율 필요"],
        analyzedAt,
      },
    };
  }

  // 일반 문의
  return {
    score: {
      tier: "B",
      score: 65,
      conversionProbability: 50,
      estimatedPriceRange: "100만 ~ 250만원 또는 표준 플랜",
      urgency: "MEDIUM",
      summary: `${companyName}의 기본 업무 문의 및 스프레드시트 활용 지원 요청 건입니다.`,
      recommendedAction: "신속한 1차 답변 발송 후 심화 기능 필요 시 엔터프라이즈 컨설팅 안내",
    },
    analysis: {
      companyName,
      industry,
      industryInsight: "기본 시트 활용 단계에서 자동화 기능이 고도화될수록 맞춤형 스크립트 연동 니즈가 발생합니다.",
      automationScope: [
        "기본 구글 시트 수식 및 템플릿 최적화",
        "주기적 데이터 정기 백업 및 이메일 리포팅",
      ],
      matchedVouchers: [
        {
          name: "비대면 서비스 바우처",
          agency: "중기부",
          supportRatio: "최대 70% 지원",
          matchReason: "클라우드 서비스 구독료 감면 혜택",
        },
      ],
      salesPitchingPoints: ["가장 쉽고 직관적인 구글 시트 기반의 클라우드 업무 환경 구축"],
      riskFactors: ["고객사의 구체적 요구사항 파악을 위한 추가 소통 필요"],
      analyzedAt,
    },
  };
}

/**
 * DB에 AI 리드 스코어 및 분석 결과 저장
 */
export async function saveLeadAnalysisToDb(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  result: LeadAnalysisResult
): Promise<void> {
  const now = new Date().toISOString();
  await updateRows(table, {
    filters: { id },
    updates: {
      ai_score: JSON.stringify(result.score),
      ai_company_analysis: JSON.stringify(result.analysis),
      updated_at: now,
      updated_by: "AI_LEAD_ANALYZER",
    },
  });
}

/**
 * 비동기 백그라운드 AI 리드 분석 및 DB 저장
 */
export function generateAndSaveLeadAnalysisAsync(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  input: LeadAnalysisInput
): void {
  (async () => {
    try {
      const result = await analyzeInquiryLead(input);
      if (result) {
        await saveLeadAnalysisToDb(table, id, result);
        console.log(`[AI Lead Analyzer] Successfully analyzed and saved lead for ${table}:${id} (Tier: ${result.score.tier})`);
      }
    } catch (err: any) {
      console.warn(`[AI Lead Analyzer] Background analysis failed for ${table}:${id}:`, err.message);
    }
  })();
}

/**
 * DB에 공공데이터 동명/유사 기업 후보군 저장
 */
export async function saveCandidatesToDb(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  candidates: RealCompanyProfile[]
): Promise<void> {
  const now = new Date().toISOString();
  await updateRows(table, {
    filters: { id },
    updates: {
      candidate_profiles: JSON.stringify(candidates),
      updated_at: now,
      updated_by: "CANDIDATE_COLLECTOR",
    },
  });
}

/**
 * 백그라운드로 공공데이터 후보군을 조회하여 DB에 저장 (Human-in-the-loop 대기용)
 */
export function collectAndSaveCandidatesAsync(
  table: "sheetbot_enterprise_inquiries" | "sheetbot_inquiries",
  id: string,
  companyName: string
): void {
  (async () => {
    try {
      const candidates = await searchCompanyCandidates(companyName, 5);
      if (candidates && candidates.length > 0) {
        await saveCandidatesToDb(table, id, candidates);
        console.log(
          `[AI Lead Analyzer] Successfully collected and saved ${candidates.length} candidates for ${table}:${id}`
        );
      }
    } catch (err: any) {
      console.warn(
        `[AI Lead Analyzer] Failed to collect candidates for ${table}:${id}:`,
        err.message
      );
    }
  })();
}
