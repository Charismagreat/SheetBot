/**
 * SheetBot Enterprise AX 맞춤 구축 제안서 & 견적서 생성 유틸리티
 */

export interface ProposalItem {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface ProposalData {
  docNumber: string; // 예: SB-20260916-042
  issueDate: string; // YYYY.MM.DD
  validUntil: string; // YYYY.MM.DD (발행일 + 30일)
  provider: {
    companyName: string;
    ceoName: string;
    bizNumber: string;
    address: string;
    contactPhone: string;
    contactEmail: string;
    department: string;
  };
  client: {
    companyName: string;
    contactName: string;
    phone: string;
    email: string;
    bizNumber?: string;
    address?: string;
    industry?: string;
    subscriberCount?: string;
  };
  project: {
    title: string;
    objective: string;
    targetAreas: string[];
    timeline: Array<{ stage: string; period: string; details: string }>;
  };
  quotation: {
    items: ProposalItem[];
    subtotal: number;
    vat: number;
    total: number;
  };
  voucherDiscount?: {
    voucherName: string;
    supportRatio: number; // e.g. 80 (80%)
    governmentSupportAmount: number;
    clientSelfPayAmount: number;
  };
  customerRequestInfo?: {
    userRequirement?: string;
    customerNotes?: string;
    sheetUrl?: string;
    sheetSchema?: string;
  };
  adminNotes?: string;
}

/**
 * 텍스트 견적 범위("450만 ~ 650만원", "300만원 등")에서 기준 정수 금액을 추출
 */
export function parseEstimatedPrice(priceRangeStr?: string, defaultPrice: number = 4500000): number {
  if (!priceRangeStr) return defaultPrice;

  const matches = priceRangeStr.match(/(\d+(?:\.\d+)?)\s*만/g);
  if (matches && matches.length > 0) {
    const numbers = matches.map((m) => parseFloat(m.replace(/[^\d.]/g, "")));
    if (numbers.length >= 2) {
      const avg = Math.round((numbers[0] + numbers[1]) / 2);
      return avg * 10000;
    } else {
      return numbers[0] * 10000;
    }
  }

  return defaultPrice;
}

/**
 * 맞춤 제작 문의 및 일반 문의 본문(content)에서 섹션별 텍스트 파싱
 */
export function parseInquiryContent(content?: string): {
  userRequirement?: string;
  customerNotes?: string;
  sheetUrl?: string;
  sheetSchema?: string;
  rawText: string;
} {
  if (!content) return { rawText: "" };

  const extractSection = (tag: string): string | undefined => {
    const regex = new RegExp(`\\[${tag}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`, "i");
    const match = content.match(regex);
    return match ? match[1].trim() : undefined;
  };

  const userRequirement = extractSection("사용자 원본 요구사항") || extractSection("의뢰 내용") || extractSection("요구사항");
  const customerNotes = extractSection("고객 추가 메모") || extractSection("추가 메모") || extractSection("비고");
  const sheetUrl = extractSection("대상 구글 스프레드시트") || extractSection("스프레드시트");
  const sheetSchema = extractSection("AI 시트 분석 스키마") || extractSection("시트 분석");

  return {
    userRequirement,
    customerNotes,
    sheetUrl,
    sheetSchema,
    rawText: content.trim(),
  };
}

/**
 * 고객 문의 및 AI 분석 데이터로부터 공식 제안·견적서 데이터 조립
 */
export function buildProposalData(inquiry: any): ProposalData {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}.${mm}.${dd}`;

  // 유효기간: 발행일 + 30일
  const validDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const validStr = `${validDate.getFullYear()}.${String(validDate.getMonth() + 1).padStart(2, "0")}.${String(
    validDate.getDate()
  ).padStart(2, "0")}`;

  const inqId = String(inquiry.id || 1).replace(/[^0-9]/g, "").slice(-4) || "0001";
  const docNumber = `SB-${yyyy}${mm}${dd}-${inqId}`;

  // 1. 고객사 정보 추출 및 기업 유효성 검사
  const applicantName = inquiry.contact_name || inquiry.user_name || inquiry.user_email?.split("@")[0] || "담당자 귀하";
  const hasValidCompany = Boolean(
    inquiry.company_name &&
    inquiry.company_name.trim() &&
    inquiry.company_name !== "미기재 기업" &&
    inquiry.company_name !== "귀사"
  );

  const compName = hasValidCompany
    ? inquiry.company_name
    : inquiry.ai_company_analysis?.realCompanyProfile?.workplaceName ||
      (applicantName !== "담당자 귀하" ? `${applicantName} (개인 의뢰)` : "개인 의뢰 고객");

  const realProfile = inquiry.ai_company_analysis?.realCompanyProfile;

  // 2. 문의 본문 구조화 파싱 (사용자 원본 요구사항, 고객 추가 메모 등)
  const parsed = parseInquiryContent(inquiry.content);
  const isCustomDev =
    inquiry.category === "AUTOMATION_REQUEST" ||
    inquiry.category === "FDE_REQUEST" ||
    (inquiry.title && (inquiry.title.includes("맞춤 제작") || inquiry.title.includes("맞춤 구축")));

  // 3. 프로젝트 제목, 목적, 구축 범위 동적 결정
  let projectTitle: string;
  let projectObjective: string;
  let projectScopes: string[];

  if (isCustomDev && (parsed.userRequirement || parsed.customerNotes)) {
    // 맞춤 제작 문의 특화 반영
    const reqText = parsed.userRequirement || "맞춤형 업무 자동화";
    projectTitle = `${compName} 맞춤 제작 구축: ${reqText}`;
    
    const notesClause = parsed.customerNotes ? `고객사 요청사항("${parsed.customerNotes}")을 완벽히 수렴하여, ` : "";
    const sheetClause = parsed.sheetSchema ? `대상 스프레드시트(${parsed.sheetSchema})와 ` : "기존 업무 스프레드시트와 ";
    
    projectObjective = `본 제안은 ${compName}에서 의뢰하신 '${reqText}' 구현을 목적으로 합니다. ${notesClause}${sheetClause}안전하고 유연하게 연동되는 맞춤 자동화 파이프라인을 구축하여 반복적인 수작업을 제거하고 업무 효율을 극대화합니다.`;

    projectScopes = [
      `[핵심 기능 개발] ${reqText}`,
      parsed.customerNotes
        ? `[특수 업무 로직] ${parsed.customerNotes}`
        : `[데이터 파이프라인] 시트 데이터 자동 검증 및 누적 기록 체계 구축`,
      `[사용자 인터페이스] 스프레드시트 전용 사이드바 UI 및 원클릭 대화형 입력 폼 연동`,
      `[검증 및 사후 지원] 실무자 파일럿 테스트, 안정화 온보딩 및 12개월 무상 기술지원`,
    ];
  } else if (inquiry.source === "ENTERPRISE_INQUIRY" || inquiry.category === "ENTERPRISE_AX") {
    // 기업 AX 엔터프라이즈 특화 반영
    projectTitle = `${compName} 업무 효율 극대화를 위한 맞춤형 SheetBot Enterprise AX 도입 제안`;
    projectObjective = `${compName}의 반복적인 수작업 및 분산된 데이터를 구글 시트 기반 완전 자동화 시스템으로 일원화하여, 부서 간 업무 처리 시간을 80% 이상 단축하고 데이터 무결성을 보장합니다.`;
    
    projectScopes =
      inquiry.ai_company_analysis?.automationScope && inquiry.ai_company_analysis.automationScope.length > 0
        ? inquiry.ai_company_analysis.automationScope
        : inquiry.target_areas
        ? inquiry.target_areas.split(",").map((s: string) => s.trim())
        : [
            "구글 스프레드시트-사내 시스템(ERP/DB) 양방향 자동 연동",
            "대용량 비즈니스 로직 처리 및 실시간 결재/알림 파이프라인",
            "현업 전용 사이드바 입력 UI 및 경영진 맞춤형 KPI 대시보드",
            "클라우드 보안 감사 준수 및 1년 무상 기술지원",
          ];
  } else {
    // 일반 문의
    const mainReq = parsed.userRequirement || inquiry.title || "업무 자동화 솔루션";
    projectTitle = `${compName} 맞춤형 스프레드시트 자동화 솔루션 제안`;
    projectObjective = `${compName}의 의뢰 내용('${mainReq}')을 최적화된 구글 시트 솔루션으로 구현하여 실무자의 생산성을 향상시킵니다.`;
    projectScopes = [
      `[맞춤 개발] ${mainReq}`,
      parsed.customerNotes ? `[추가 요구] ${parsed.customerNotes}` : "스프레드시트 연동 자동화",
      "사용자 편의 인터페이스 구축",
      "안정화 검증 및 기술지원",
    ];
  }

  // 4. 기준 공급가액 및 세부 품목 산출
  const defaultPrice = isCustomDev ? 2800000 : 4500000;
  const basePrice = parseEstimatedPrice(inquiry.ai_score?.estimatedPriceRange, defaultPrice);

  const ratioCore = 0.35; // 35% 코어 엔진 / 맞춤 로직
  const ratioLogic = 0.3; // 30% 특수 규칙 / 시스템 연동
  const ratioUi = 0.2; // 20% 맞춤 UI / 사이드바
  const ratioMaint = 0.15; // 15% 검증 및 유지보수

  const priceCore = Math.round((basePrice * ratioCore) / 10000) * 10000;
  const priceLogic = Math.round((basePrice * ratioLogic) / 10000) * 10000;
  const priceUi = Math.round((basePrice * ratioUi) / 10000) * 10000;
  const priceMaint = basePrice - (priceCore + priceLogic + priceUi);

  let items: ProposalItem[];

  if (isCustomDev && (parsed.userRequirement || parsed.customerNotes)) {
    const reqSummary = parsed.userRequirement || "맞춤 자동화 로직";
    items = [
      {
        name: `맞춤 자동화 코어 엔진 (${reqSummary})`,
        description: `고객 원본 요구사항인 '${reqSummary}' 전용 Google Workspace 자동화 스크립트 및 데이터 처리 파이프라인 개발`,
        quantity: 1,
        unit: "식",
        unitPrice: priceCore,
        amount: priceCore,
      },
      {
        name: `특수 업무 규칙 및 데이터 가공 모듈 ${parsed.customerNotes ? `(${parsed.customerNotes.slice(0, 20)}...)` : ""}`,
        description: parsed.customerNotes
          ? `요청하신 고객 추가 메모("${parsed.customerNotes}")에 따른 채번/검증/분리 비즈니스 로직 구현`
          : "스프레드시트 데이터 누적, 스키마 유효성 검증 및 예외 처리 로직 구현",
        quantity: 1,
        unit: "식",
        unitPrice: priceLogic,
        amount: priceLogic,
      },
      {
        name: "스프레드시트 사이드바 대화형 UI 인터페이스",
        description: "현업 실무자가 시트 화면에서 바로 사용하는 전용 사이드바 입력 폼 및 실시간 상태 알림 모듈",
        quantity: 1,
        unit: "식",
        unitPrice: priceUi,
        amount: priceUi,
      },
      {
        name: "통합 기능 검증, 실무자 온보딩 및 12개월 기술지원",
        description: "파일럿 데이터 검증, 시트 양식 최적화 가이드 및 오픈 후 1년간 무상 하자보수/기술지원",
        quantity: 1,
        unit: "식",
        unitPrice: priceMaint,
        amount: priceMaint,
      },
    ];
  } else {
    items = [
      {
        name: "SheetBot Enterprise 코어 엔진 & 클라우드 배포",
        description: "Google Workspace / Apps Script 기반 엔터프라이즈 자동화 코어 및 데이터 무결성 파이프라인 구축",
        quantity: 1,
        unit: "식",
        unitPrice: priceCore,
        amount: priceCore,
      },
      {
        name: "맞춤형 비즈니스 로직 & 외부 시스템(ERP/DB) 연동",
        description: "기존 사내 업무 데이터(더존, 이카운트, 영림원, MES 등) 및 공공데이터 실시간 API 연계",
        quantity: 1,
        unit: "식",
        unitPrice: priceLogic,
        amount: priceLogic,
      },
      {
        name: "사이드바 맞춤 인터페이스 & 경영진 대시보드 UI",
        description: "현업 실무자를 위한 직관적 입력 사이드바 및 실시간 KPI/VOC 통계 시각화 화면 구축",
        quantity: 1,
        unit: "식",
        unitPrice: priceUi,
        amount: priceUi,
      },
      {
        name: "테스트 검증, 실무자 교육 및 1년 무상 기술지원",
        description: "파일럿 안정화 검증, 부서별 사용 가이드 교육 및 전담 엔지니어 12개월 유지보수 보장",
        quantity: 1,
        unit: "식",
        unitPrice: priceMaint,
        amount: priceMaint,
      },
    ];
  }

  const subtotal = items.reduce((acc, cur) => acc + cur.amount, 0);
  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  // 5. 정부지원사업(바우처) 매칭 여부 확인 (기업 정보가 있는 경우에만 국비 지원 연계 산출)
  let voucherDiscount: ProposalData["voucherDiscount"] = undefined;
  const matchedVouchers = inquiry.ai_company_analysis?.matchedVouchers;
  if (
    hasValidCompany &&
    (inquiry.use_voucher === "YES" ||
      inquiry.use_voucher === "CONSULT" ||
      (matchedVouchers && matchedVouchers.length > 0))
  ) {
    const voucherName = matchedVouchers?.[0]?.name || "중소기업 맞춤형 비대면·스마트 기술보급 바우처";
    const ratio = 80; // 통상 80% 지원
    const govAmt = Math.round((subtotal * (ratio / 100)) / 10000) * 10000;
    const clientAmt = subtotal - govAmt;

    voucherDiscount = {
      voucherName,
      supportRatio: ratio,
      governmentSupportAmount: govAmt,
      clientSelfPayAmount: clientAmt,
    };
  }

  return {
    docNumber,
    issueDate: dateStr,
    validUntil: validStr,
    provider: {
      companyName: "SheetBot Enterprise AX 솔루션 사업부",
      ceoName: "대표이사 이지데스크",
      bizNumber: "123-86-45678",
      address: "서울특별시 강남구 테헤란로 152 강남파이낸스센터 19층",
      contactPhone: "02-555-8900",
      contactEmail: "contact@sheetbot.cloud",
      department: "Enterprise 솔루션 기술개발팀",
    },
    client: {
      companyName: compName,
      contactName: applicantName,
      phone: inquiry.phone || inquiry.user_phone || "-",
      email: inquiry.user_email || inquiry.email || "-",
      bizNumber: hasValidCompany ? (inquiry.biz_number || realProfile?.businessNumberPrefix || "-") : "- (개인 의뢰)",
      address: realProfile?.address || "-",
      industry: hasValidCompany ? (inquiry.industry || realProfile?.industryName || "일반 기업") : "개인/일반 의뢰",
      subscriberCount: realProfile?.subscriberCount ? `${realProfile.subscriberCount}명` : undefined,
    },
    project: {
      title: projectTitle,
      objective: projectObjective,
      targetAreas: projectScopes,
      timeline: [
        { stage: "1단계 (1주차)", period: "착수 후 7일", details: "현업 워크플로우 정밀 실사, 데이터 스키마 확정 및 요구사항 정의" },
        { stage: "2단계 (2~3주차)", period: "착수 후 14일", details: "Enterprise 코어 엔진 개발, 특수 로직/API 연동 및 맞춤 UI 사이드바 구축" },
        { stage: "3단계 (3~4주차)", period: "착수 후 21일", details: "통합 테스트, 파일럿 부서 시범 운영 및 실무자 온보딩 교육" },
        { stage: "4단계 (4주차~)", period: "오픈 이후", details: "최종 정식 오픈 전환 및 1년 무상 기술지원/유지보수 개시" },
      ],
    },
    quotation: {
      items,
      subtotal,
      vat,
      total,
    },
    voucherDiscount,
    customerRequestInfo:
      parsed.userRequirement || parsed.customerNotes || parsed.sheetUrl || parsed.sheetSchema
        ? {
            userRequirement: parsed.userRequirement,
            customerNotes: parsed.customerNotes,
            sheetUrl: parsed.sheetUrl,
            sheetSchema: parsed.sheetSchema,
          }
        : undefined,
    adminNotes: inquiry.answer || undefined,
  };
}
