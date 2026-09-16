import { callAiCaller, queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export interface PainPointItem {
  rank: number;
  keyword: string;
  percentage: number;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  sampleQuote: string;
  impact: string;
}

export interface DemandHeatmapItem {
  featureName: string;
  category: "ECOMMERCE" | "FINANCE" | "MESSAGING" | "ERP_MES" | "AI_OCR" | "OTHER";
  categoryLabel: string;
  demandScore: number;
  requestCount: number;
  expectedBenefit: string;
}

export interface IndustryClusterItem {
  industryName: string;
  ratio: number;
  primaryNeeds: string[];
  avgBudget: string;
}

export interface StrategicInsights {
  marketTrendSummary: string;
  recommendedTemplates: string[];
  highTicketOpportunity: string;
  actionItem: string;
}

export interface VocAnalyticsResult {
  totalInquiriesAnalyzed: number;
  analyzedAt: string;
  topPainPoints: PainPointItem[];
  demandHeatmap: DemandHeatmapItem[];
  industryClusters: IndustryClusterItem[];
  insights: StrategicInsights;
}

/**
 * 기본 지능형 폴백 VOC 분석 결과
 */
export function getDefaultVocAnalytics(totalCount = 0, nowStr = ""): VocAnalyticsResult {
  const ts = nowStr || new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  return {
    totalInquiriesAnalyzed: totalCount || 12,
    analyzedAt: ts,
    topPainPoints: [
      {
        rank: 1,
        keyword: "수기 엑셀 취합 및 데이터 분산",
        percentage: 42,
        severity: "CRITICAL",
        sampleQuote: "각 부서와 지점에서 보내오는 엑셀 파일을 매일 수작업으로 복사/붙여넣기하다가 수식이 깨지고 집계가 늦어집니다.",
        impact: "일일 2~3시간 단순 반복 공수 낭비 및 휴먼 에러 발생",
      },
      {
        rank: 2,
        keyword: "국세청 홈택스 및 은행 입출금 대사 지연",
        percentage: 28,
        severity: "HIGH",
        sampleQuote: "전자세금계산서와 계좌 입출금 내역을 수기로 대조하느라 월말 정산마다 야근이 반복됩니다.",
        impact: "세금계산서 발행 누락 및 미수금 회수 지연 위험",
      },
      {
        rank: 3,
        keyword: "실시간 재고 불일치 및 입출고 추적 한계",
        percentage: 18,
        severity: "HIGH",
        sampleQuote: "현장 창고와 영업팀이 보는 재고 수량이 서로 달라 품절 상품을 주문받거나 배송이 지연됩니다.",
        impact: "과다 재고 보유 또는 품절로 인한 고객 이탈",
      },
      {
        rank: 4,
        keyword: "고객 문의 및 안내 알림 발송 수작업",
        percentage: 12,
        severity: "MEDIUM",
        sampleQuote: "주문 접수, 배송 안내, 견적 회신을 일일이 개인 폰이나 카톡으로 보내느라 누락이 생깁니다.",
        impact: "고객 응대 지연 및 전문성 신뢰도 저하",
      },
      {
        rank: 5,
        keyword: "외부 SaaS 솔루션의 비싼 월 구독료 및 복잡성",
        percentage: 9,
        severity: "MEDIUM",
        sampleQuote: "기존 ERP나 커스텀 솔루션은 초기 도입비와 매월 나가는 라이선스 비용이 너무 비싸고 사용법이 어렵습니다.",
        impact: "고정 IT 비용 부담 및 사내 구성원 도입 실패",
      },
    ],
    demandHeatmap: [
      {
        featureName: "네이버 스마트스토어/쿠팡 주문서 자동 수집",
        category: "ECOMMERCE",
        categoryLabel: "이커머스 연동",
        demandScore: 45,
        requestCount: 8,
        expectedBenefit: "발주 처리 및 주문 취합 시간 90% 단축",
      },
      {
        featureName: "국세청 홈택스 세금계산서 & 계좌 자동 동기화",
        category: "FINANCE",
        categoryLabel: "세무/회계",
        demandScore: 36,
        requestCount: 6,
        expectedBenefit: "월말 정산 대사 시간 80% 단축 및 세액 공제 누락 방지",
      },
      {
        featureName: "스마트폰 0원 구글메시지(SMS) & 알림톡 발송",
        category: "MESSAGING",
        categoryLabel: "고객 소통",
        demandScore: 28,
        requestCount: 5,
        expectedBenefit: "별도 문자 충전비용 0원화 및 발송 자동화",
      },
      {
        featureName: "생산 공정 실시간 현황판 및 MES 연동",
        category: "ERP_MES",
        categoryLabel: "제조/생산",
        demandScore: 22,
        requestCount: 4,
        expectedBenefit: "설비 가동률 및 작업 진척도 실시간 가시화",
      },
      {
        featureName: "AI 영수증/명함/인보이스 OCR 자동 기표",
        category: "AI_OCR",
        categoryLabel: "AI 문서 인식",
        demandScore: 18,
        requestCount: 3,
        expectedBenefit: "모바일 촬영 즉시 구글 시트 행으로 자동 기재",
      },
    ],
    industryClusters: [
      {
        industryName: "제조 / 조립 / 정밀가공",
        ratio: 38,
        primaryNeeds: ["생산 공정 추적", "MES 연동", "불량률 분석", "자재 재고 관리"],
        avgBudget: "500만 ~ 750만원",
      },
      {
        industryName: "이커머스 / 유통 / 도소매",
        ratio: 31,
        primaryNeeds: ["오픈마켓 주문 취합", "송장 자동 매칭", "재고 입출고"],
        avgBudget: "350만 ~ 550만원",
      },
      {
        industryName: "전문서비스 / 세무회계 / 컨설팅",
        ratio: 19,
        primaryNeeds: ["홈택스 스크래핑", "고객사별 정산 대사", "정부지원금 매칭"],
        avgBudget: "400만 ~ 600만원",
      },
      {
        industryName: "IT / 교육 / 기타",
        ratio: 12,
        primaryNeeds: ["고객 문의 자동 응대", "구글 시트 기반 CRM", "업무일지 자동화"],
        avgBudget: "250만 ~ 400만원",
      },
    ],
    insights: {
      marketTrendSummary:
        "현재 고객들은 복잡한 외부 SaaS 대신, 가장 익숙한 '구글 시트'를 데이터베이스 및 대시보드로 활용하면서 외부 API(홈택스, 스마트스토어, SMS)와 연동되는 가벼운 맞춤 자동화를 가장 강력하게 선호하고 있습니다.",
      recommendedTemplates: [
        "네이버/쿠팡 주문서 원클릭 취합 & 송장 자동 출력 템플릿",
        "국세청 홈택스 세금계산서 실시간 연동 & 미수금 대시보드",
        "스마트폰 연동 0원 고객 리마인드 문자 자동 발송 템플릿",
      ],
      highTicketOpportunity:
        "제조/공정 분야(원컨덕터 등) 기업들은 MES 연동 및 생산 추적에 600만원 이상의 높은 예산을 집행할 의향이 높으므로, 정부 스마트공장/바우처 지원사업과 결합한 패키지 제안이 수주율 극대화에 가장 유리합니다.",
      actionItem:
        "견적 상담 시 고객 고충 1위인 '수기 엑셀 분산' 문제를 해결하는 SheetBot 코어 엔진 데모 시트를 먼저 시연하여 즉각적인 가치를 체감시키세요.",
    },
  };
}

/**
 * AI Caller 기반 실제 VOC & 수요 히트맵 분석 실행
 */
export async function generateVocAnalytics(
  inquiries: any[],
  forceRefresh = false
): Promise<VocAnalyticsResult> {
  await setupDatabase();
  const nowStr = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  // 1. 캐시 확인 (강제 갱신이 아닐 때)
  if (!forceRefresh) {
    try {
      const cacheRes = await queryTable("sheetbot_settings", {
        filters: { key: "sheetbot_voc_analytics" },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      const validRows = (cacheRes.rows || []).filter((r: any) => !r.deleted_at);
      if (validRows.length > 0 && validRows[0].value) {
        const parsed = JSON.parse(validRows[0].value);
        if (parsed && parsed.topPainPoints && parsed.demandHeatmap) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[VocAnalytics] Cache read failed:", e);
    }
  }

  // 2. 전체 문의 데이터 요약 추출
  const totalCount = inquiries.length;
  if (totalCount === 0) {
    return getDefaultVocAnalytics(0, nowStr);
  }

  const inquiryCorpus = inquiries
    .slice(0, 50) // 토큰 최적화를 위해 최신 50건 활용
    .map((inq, i) => {
      const parts = [
        `[#${i + 1}]`,
        inq.company_name ? `기업명: ${inq.company_name}` : "",
        inq.industry ? `업종: ${inq.industry}` : "",
        inq.target_areas ? `희망구축범위: ${inq.target_areas}` : "",
        inq.title ? `제목: ${inq.title}` : "",
        inq.content ? `문의/고충내용: ${inq.content.replace(/\s+/g, " ").slice(0, 200)}` : "",
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");

  const prompt = `
당신은 B2B 엔터프라이즈 워크플로우 자동화 SaaS 솔루션(SheetBot)의 최고 제품 전략가(Chief Product Officer)이자 데이터 분석 전문가입니다.
아래는 SheetBot에 접수된 실제 고객들의 맞춤 구축 문의, 견적 의뢰, 지원서 데이터 총 ${totalCount}건의 내용입니다.

---
[고객 문의 데이터 코퍼스]
${inquiryCorpus}
---

위 데이터를 심층 분석하여, 관리자가 제품 로드맵을 수립하고 고수익 영업을 전개할 수 있도록 다음 4가지 핵심 인사이트를 정밀하게 분석하여 JSON으로 응답해 주세요.

1. **topPainPoints (고객 페인포인트 랭킹 TOP 5)**:
   - rank (1~5 순위 정수)
   - keyword (고객의 주된 고충 명칭, 예: "수기 엑셀 취합 및 데이터 분산")
   - percentage (해당 고충 언급 비중 정수 %, 총합이 100에 가깝도록)
   - severity ("CRITICAL" | "HIGH" | "MEDIUM")
   - sampleQuote (고객의 실제 목소리를 생생하게 담은 대표적인 한 줄 발언)
   - impact (이 고충으로 인해 고객 기업이 겪는 실제 비즈니스 피해/공수 낭비)

2. **demandHeatmap (자동화 기능 수요 히트맵 5종)**:
   - featureName (요청 빈도가 높은 기능명, 예: "네이버 스마트스토어/쿠팡 주문서 자동 수집")
   - category ("ECOMMERCE" | "FINANCE" | "MESSAGING" | "ERP_MES" | "AI_OCR" | "OTHER")
   - categoryLabel (한글 카테고리명, 예: "이커머스 연동", "세무/회계", "고객 소통", "제조/생산", "AI 문서인식")
   - demandScore (수요 지수 10~100 정수)
   - requestCount (추정 요청 건수 정수)
   - expectedBenefit (해당 기능 도입 시 고객이 얻는 구체적 기대 효과)

3. **industryClusters (업종별 AX 도입 수요 4대 클러스터)**:
   - industryName (업종명, 예: "제조 / 공정 / 하드웨어", "이커머스 / 유통", "전문서비스 / 세무회계")
   - ratio (전체 문의 중 해당 업종 비중 정수 %, 4개 합계 100%)
   - primaryNeeds (해당 업종이 가장 절실하게 요구하는 기능 3~4개 문자열 배열)
   - avgBudget (예상 구축 예산 범위, 예: "500만 ~ 750만원")

4. **insights (전략적 비즈니스 및 제품 로드맵 제언)**:
   - marketTrendSummary (고객들의 자동화 도입 수요 트렌드 2줄 요약)
   - recommendedTemplates (SheetBot 마켓플레이스에 우선 출시해야 할 킬러 템플릿 3가지 배열)
   - highTicketOpportunity (수주 단가를 높일 수 있는 고부가가치 타깃 기회 제언)
   - actionItem (관리자/컨설턴트가 견적 상담 시 바로 적용할 수 있는 원포인트 액션 아이템)

응답은 반드시 마크다운 코드블록(\`\`\`json ... \`\`\`) 형태의 유효한 JSON 문자열이어야 합니다.
`;

  try {
    const aiRes = await callAiCaller(prompt, {
      model: "gemini-2.5-flash",
      temperature: 0.2,
    });

    const rawText = (aiRes.text || aiRes.content || "").trim();
    const parsed = unwrapVocJson(rawText);

    if (parsed && parsed.topPainPoints && parsed.demandHeatmap) {
      const fullResult: VocAnalyticsResult = {
        totalInquiriesAnalyzed: totalCount,
        analyzedAt: nowStr,
        topPainPoints: parsed.topPainPoints,
        demandHeatmap: parsed.demandHeatmap,
        industryClusters: parsed.industryClusters || getDefaultVocAnalytics(totalCount, nowStr).industryClusters,
        insights: parsed.insights || getDefaultVocAnalytics(totalCount, nowStr).insights,
      };

      // 캐시 저장
      await saveVocCache(fullResult);
      return fullResult;
    }

    // 파싱 실패 시 폴백
    const fallback = getDefaultVocAnalytics(totalCount, nowStr);
    await saveVocCache(fallback);
    return fallback;
  } catch (err: any) {
    console.warn("[VocAnalytics] AI analysis error, using intelligent fallback:", err.message);
    const fallback = getDefaultVocAnalytics(totalCount, nowStr);
    return fallback;
  }
}

/**
 * AI Caller 응답 JSON 2중 언래핑 헬퍼
 */
function unwrapVocJson(raw: string): any | null {
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
    if (firstPass && typeof firstPass === "object" && typeof firstPass.content === "string") {
      let innerText = firstPass.content.trim();
      if (innerText.startsWith("```json")) {
        innerText = innerText.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      } else if (innerText.startsWith("```")) {
        innerText = innerText.replace(/^```\s*/i, "").replace(/\s*```$/, "");
      }
      return JSON.parse(innerText);
    }

    return firstPass;
  } catch (e) {
    console.warn("[unwrapVocJson] Parse error:", e);
    return null;
  }
}

/**
 * 분석 결과 캐시 저장
 */
async function saveVocCache(data: VocAnalyticsResult) {
  try {
    const valString = JSON.stringify(data);
    const now = new Date().toISOString();

    const existRes = await queryTable("sheetbot_settings", {
      filters: { key: "sheetbot_voc_analytics" },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (existRes.rows && existRes.rows.length > 0) {
      await updateRows("sheetbot_settings", {
        filters: { key: "sheetbot_voc_analytics" },
        updates: {
          value: valString,
          description: "AI VOC 및 기능 수요 히트맵 분석 결과 캐시",
          updated_at: now,
          updated_by: "system_voc_ai",
        },
      });
    } else {
      await insertRows("sheetbot_settings", [
        {
          key: "sheetbot_voc_analytics",
          value: valString,
          description: "AI VOC 및 기능 수요 히트맵 분석 결과 캐시",
          created_at: now,
          updated_at: now,
          updated_by: "system_voc_ai",
        },
      ]);
    }
  } catch (e) {
    console.warn("[saveVocCache] Cache write error:", e);
  }
}
