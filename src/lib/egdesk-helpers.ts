// Central re-export of root egdesk-helpers
export * from '../../egdesk-helpers';

export interface AiCallerOptions {
  caller?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

export interface AiCallerResponse {
  text: string;
  content?: string;
  usage?: any;
  raw?: any;
}

/**
 * 이지데스크 표준 AI Caller 호출 함수
 * http://localhost:8080/ai-caller/tools/call 경유
 */
export async function callAiCaller(
  prompt: string,
  options: AiCallerOptions = {}
): Promise<AiCallerResponse> {
  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  const args: Record<string, any> = {
    prompt,
    ...(options.model ? { model: options.model } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
  };

  const response = await fetch(`${apiUrl}/ai-caller/tools/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool: 'ai_caller_call',
      arguments: args,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI Caller HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  let innerText = '';
  if (json?.result?.content?.[0]?.text) {
    try {
      const parsed = JSON.parse(json.result.content[0].text);
      innerText = parsed.content || parsed.text || json.result.content[0].text;
    } catch {
      innerText = json.result.content[0].text;
    }
  } else if (json?.content) {
    innerText = json.content;
  } else if (json?.text) {
    innerText = json.text;
  }

  return {
    text: innerText,
    content: innerText,
    usage: json?.result?.usage,
    raw: json,
  };
}

/** Run company research search with options */
export async function runCompanyResearch(
  query: string,
  options?: { companyName?: string; clientBusinessNumber?: string; bypassCache?: boolean }
) {
  const { callCompanyResearchTool } = await import('../../egdesk-helpers');
  return callCompanyResearchTool('companyresearch_search', {
    searchText: query,
    ...(options || {})
  });
}

/**
 * 서버 사이드에서 유저 방문자 세션으로 Google Workspace MCP 도구(sheets, drive, apps-script)를 호출할 때
 * X-Visitor-Origin 헤더를 반드시 동봉하여 안전하게 실행하는 헬퍼
 */
export async function callVisitorWorkspaceTool(
  service: 'sheets' | 'drive' | 'apps-script',
  toolName: string,
  args: Record<string, any> = {},
  visitorSessionId?: string | null,
  siteOrigin: string = 'http://localhost:4003'
) {
  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const payloadArgs = { ...args };

  if (visitorSessionId) {
    headers['Authorization'] = `Bearer ${visitorSessionId}`;
    headers['X-EGDesk-As-Visitor'] = 'true';
    headers['X-Visitor-Origin'] = siteOrigin;
    payloadArgs.asVisitor = true;
  }

  const response = await fetch(`${apiUrl}/${service}/tools/call`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tool: toolName,
      arguments: payloadArgs,
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.success === false) {
    const msg = json?.error || json?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(msg);
  }

  const textContent = json.result?.content?.[0]?.text;
  if (!textContent) return json.result || json;
  try {
    return JSON.parse(textContent);
  } catch {
    return textContent;
  }
}

export interface BizinfoGrantItem {
  id: string;
  title: string;
  agency: string;
  executor: string;
  category: string;
  period: string;
  summary: string;
  postUrl: string;
  applyUrl?: string;
}

export interface RealCompanyProfile {
  workplaceName: string;
  businessNumberPrefix?: string;
  address?: string;
  status?: string;
  form?: string;
  subscriberCount?: number | null;
  monthlyNoticeAmount?: number | null;
  industryName?: string;
  industryCode?: string;
  establishedDate?: string;
}

/**
 * 한국 17개 시·도 행정구역 매핑 테이블 (지역 필터링용)
 */
const KOREAN_REGIONS = [
  { code: '서울', names: ['서울', '서울특별시'] },
  { code: '경기', names: ['경기', '경기도'] },
  { code: '인천', names: ['인천', '인천광역시'] },
  { code: '부산', names: ['부산', '부산광역시'] },
  { code: '대구', names: ['대구', '대구광역시'] },
  { code: '대전', names: ['대전', '대전광역시'] },
  { code: '광주', names: ['광주', '광주광역시', '전남광주'] },
  { code: '울산', names: ['울산', '울산광역시'] },
  { code: '세종', names: ['세종', '세종특별자치시'] },
  { code: '강원', names: ['강원', '강원도', '강원특별자치도'] },
  { code: '충북', names: ['충북', '충청북도'] },
  { code: '충남', names: ['충남', '충청남도'] },
  { code: '전북', names: ['전북', '전라북도', '전북특별자치도'] },
  { code: '전남', names: ['전남', '전라남도'] },
  { code: '경북', names: ['경북', '경상북도'] },
  { code: '경남', names: ['경남', '경상남도'] },
  { code: '제주', names: ['제주', '제주특별자치도'] },
];

/**
 * 주소 텍스트에서 광역 자치단체 코드 추출
 */
export function extractRegionCodeFromAddress(address?: string | null): string | null {
  if (!address) return null;
  for (const reg of KOREAN_REGIONS) {
    if (reg.names.some((name) => address.includes(name))) {
      return reg.code;
    }
  }
  return null;
}

/**
 * 주요 기초 시/군/구 목록 (동일 도 내 타 시군 전용 공고 필터링용)
 */
const GYEONGGI_CITIES = [
  '수원', '성남', '고양', '용인', '부천', '안산', '평택', '안양', '화성', '의정부',
  '파주', '김포', '광명', '광주', '군포', '이천', '오산', '하남', '양주', '구리',
  '안성', '포천', '의왕', '여주', '양평', '동두천', '과천', '가평', '연천', '시흥'
];

/**
 * 이지데스크 egdesk-bizinfo MCP 호출: 기업마당 실시간 정부지원사업 공고 조회
 * (시/군 단위 정밀 지역 매칭, 네거티브 업종 배제, 기업 규모 검증 지원)
 */
export async function searchBizinfoGrants(options: {
  category?: 'tech' | 'management' | 'finance' | 'startup' | 'talent' | 'export';
  query?: string;
  display?: number;
  region?: string;
  companyAddress?: string;
  companyIndustry?: string;
  subscriberCount?: number | null;
} = {}): Promise<BizinfoGrantItem[]> {
  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  const targetRegionCode =
    options.region || extractRegionCodeFromAddress(options.companyAddress);

  // 기업 주소에서 기초 시/군/구 추출 (예: '시흥시')
  const address = options.companyAddress || '';
  const myCityMatch = address.match(/([가-힣]+시|[가-힣]+군|[가-힣]+구)/);
  const myCity = myCityMatch ? myCityMatch[1] : '';

  try {
    const res = await fetch(`${apiUrl}/bizinfo/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'bizinfo_search',
        arguments: {
          category: options.category || 'tech',
          display: 100, // 최대치로 넉넉하게 수집 후 정밀 필터링
          ...(options.query ? { query: options.query } : {}),
        },
      }),
    });

    if (!res.ok) return [];
    const json = await res.json();
    const rawText = json?.result?.content?.[0]?.text;
    if (!rawText) return [];

    const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    const rawItems: any[] = parsed.items || [];
    if (rawItems.length === 0) return [];

    // 1단계: 타 광역 지자체 및 타 시/군/구 전용 공고 원천 배제
    const otherRegionNames = KOREAN_REGIONS
      .filter((r) => r.code !== targetRegionCode)
      .flatMap((r) => r.names);
    const myRegionNames =
      KOREAN_REGIONS.find((r) => r.code === targetRegionCode)?.names || [];

    // 동일 광역 내 다른 시/군 목록 (예: 시흥시 기업인 경우 용인, 부천 등 제외)
    const otherCitiesInProvince = myCity
      ? GYEONGGI_CITIES.filter((c) => !myCity.includes(c))
      : [];

    // 2단계: 네거티브 업종 키워드 (제조/하드웨어 기업에 무관한 타 산업 배제)
    const industry = options.companyIndustry || '';
    const isManufacturing = /제조|생산|가공|금속|조명|부품|기계|운송/.test(industry);

    const negativeKeywordsForMfg = [
      '에스테틱', '의료기기', '바이오', '화장품', '뷰티', '식품', '농업',
      '수산', '해양', '조선', '농산물', '축산', '어촌', '슬립테크', '의료바이오',
      '바이오글로벌', '생명공학', '의약품', 'HACCP', '해썹', '외식'
    ];

    // 3단계: 기업 고용 규모 검증 (10인 이상 기업은 '소공인' 전용 사업 배제)
    const employeeCount = options.subscriberCount ?? 0;
    const isScaleOver10 = employeeCount >= 10;

    const qualifiedItems: { item: any; score: number }[] = [];

    for (const item of rawItems) {
      const title = item.title || '';
      const summary = item.summary || '';
      const agency = item.agency || '';
      const executor = item.executor || '';
      const fullText = `${title} ${summary} ${agency} ${executor}`;

      // A. 타 광역 지자체 전용 공고 배제
      // 제목의 [지자체] 태그 검사
      const matchPrefix = title.match(/^\[(.*?)\]/);
      if (matchPrefix) {
        const tagContent = matchPrefix[1];
        const isOtherProvince = otherRegionNames.some((n) => tagContent.includes(n));
        const isMyProvince = myRegionNames.some((n) => tagContent.includes(n));
        if (isOtherProvince && !isMyProvince) continue;
      }

      // 소관/수행기관이 타 광역 지자체인 경우 배제 (중앙부처 제외)
      const isOtherAgency = otherRegionNames.some(
        (n) => (agency && agency.includes(n)) || (executor && executor.includes(n))
      );
      if (isOtherAgency) continue;

      // B. 동일 도 내 타 시/군/구 전용 공고 배제 (내 시/군이 아닌 경우)
      if (myCity && otherCitiesInProvince.length > 0) {
        const hasOtherCity = otherCitiesInProvince.some(
          (c) => title.includes(`${c}시`) || title.includes(`${c}특례시`) || title.includes(`${c}군`)
        );
        const hasMyCity = myCity && (title.includes(myCity) || title.includes(myCity.replace('시', '')));
        if (hasOtherCity && !hasMyCity) continue;
      }

      // C. 규모 불일치 배제 (10인 이상 기업인데 10인 미만 소공인 전용인 경우)
      if (isScaleOver10 && title.includes('소공인')) continue;

      // D. 네거티브 업종 배제
      if (isManufacturing) {
        const hasNegative = negativeKeywordsForMfg.some((nk) => title.includes(nk));
        if (hasNegative) continue;
      }

      // E. 포지티브 연관도 점수 산출
      let score = 10;

      // 우리 시/군 직접 지원사업은 최우선 (+50점)
      if (myCity && (title.includes(myCity) || fullText.includes(myCity))) {
        score += 50;
      }

      // 기업의 세부 업종 및 제조/하드웨어 일치도 (+30점)
      if (/제조|자율제조|스마트|공정|설비|시제품|온디바이스/.test(title)) {
        score += 30;
      }
      if (/부품|전기|전자|조명|운송|장비|기계|해외인증|규격인증/.test(fullText)) {
        score += 20;
      }
      if (/AI|인공지능|Multi AI Agent|클라우드|소프트웨어|ERP|데이터|DX|디지털전환/.test(fullText)) {
        score += 15;
      }

      // 소관 부처 가산점 (중기부, 산업부 등 국가 공인 지원사업)
      if (agency.includes('중소벤처기업부') || agency.includes('산업통상') || agency.includes('중소벤처기업진흥공단')) {
        score += 10;
      }

      qualifiedItems.push({ item, score });
    }

    // 필터링 결과가 부족할 경우 전체 풀에서 네거티브만 걸러 보충
    let finalItems = qualifiedItems;
    if (finalItems.length < 4) {
      finalItems = rawItems
        .filter((item: any) => {
          if (isManufacturing && negativeKeywordsForMfg.some((nk) => (item.title || '').includes(nk))) {
            return false;
          }
          return true;
        })
        .map((item: any) => ({ item, score: 5 }));
    }

    finalItems.sort((a, b) => b.score - a.score);

    const targetDisplay = options.display || 4;
    return finalItems.slice(0, targetDisplay).map(({ item }) => ({
      id: item.id || '',
      title: item.title || '',
      agency: item.agency || '',
      executor: item.executor || '',
      category: item.category || '',
      period: item.period || '',
      summary: item.summary || '',
      postUrl: item.postUrl || '',
      applyUrl: item.applyUrl || '',
    }));
  } catch (err: any) {
    console.warn('[EGDesk Bizinfo] Failed to search grants:', err.message);
    return [];
  }
}

/**
 * 이지데스크 egdesk-company-research MCP 호출: 국민연금 공공데이터 사업장 후보군 검색 (동명/유사 상호 복수 조회)
 */
export async function searchCompanyCandidates(companyName: string, display: number = 5): Promise<RealCompanyProfile[]> {
  if (!companyName || companyName.trim().length < 2) return [];

  const apiUrl =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_EGDESK_API_URL) ||
    'http://localhost:8080';

  try {
    const cleanName = companyName.replace(/주식회사|\(주\)|（주）/g, '').trim();
    const searchRes = await fetch(`${apiUrl}/company-research/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'nps_search',
        arguments: {
          workplaceName: cleanName || companyName,
          display,
        },
      }),
    });

    if (!searchRes.ok) return [];
    const searchJson = await searchRes.json();
    const rawSearch = searchJson?.result?.content?.[0]?.text;
    if (!rawSearch) return [];

    const parsedSearch = typeof rawSearch === 'string' ? JSON.parse(rawSearch) : rawSearch;
    const rawItems: any[] = parsedSearch.items || [];
    if (rawItems.length === 0) return [];

    // 사업자등록번호 앞자리 및 상호명 기준 중복 정제 (동일 사업장의 이전 연도 내역 필터링)
    const seenKeys = new Set<string>();
    const items = rawItems.filter((item: any) => {
      const key = `${item.workplaceName}_${item.businessNumberPrefix || item.address}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    // 각 후보 사업장의 상세 정보 병렬 수집
    const detailedCandidates = await Promise.all(
      items.map(async (item: any) => {
        if (!item.seq) {
          return {
            workplaceName: item.workplaceName || companyName,
            businessNumberPrefix: item.businessNumberPrefix,
            address: item.address,
            status: item.status,
            form: item.form,
            subscriberCount: item.subscriberCount ?? null,
            monthlyNoticeAmount: item.monthlyNoticeAmount ?? null,
          } as RealCompanyProfile;
        }

        try {
          const detailRes = await fetch(`${apiUrl}/company-research/tools/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool: 'nps_detail',
              arguments: { seq: item.seq },
            }),
          });

          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const rawDetail = detailJson?.result?.content?.[0]?.text;
            if (rawDetail) {
              const parsedDetail = typeof rawDetail === 'string' ? JSON.parse(rawDetail) : rawDetail;
              const d = parsedDetail.items?.[0] || item;
              return {
                workplaceName: d.workplaceName || item.workplaceName || companyName,
                businessNumberPrefix: d.businessNumberPrefix || item.businessNumberPrefix,
                address: d.address || item.address,
                status: d.status || item.status,
                form: d.form || item.form,
                subscriberCount: d.subscriberCount ?? item.subscriberCount ?? null,
                monthlyNoticeAmount: d.monthlyNoticeAmount ?? item.monthlyNoticeAmount ?? null,
                industryName: d.industryName || '',
                industryCode: d.industryCode || '',
                establishedDate: d.establishedDate || '',
              } as RealCompanyProfile;
            }
          }
        } catch {
          // 실패 시 기본 검색 정보 활용
        }

        return {
          workplaceName: item.workplaceName || companyName,
          businessNumberPrefix: item.businessNumberPrefix,
          address: item.address,
          status: item.status,
          form: item.form,
          subscriberCount: item.subscriberCount ?? null,
        } as RealCompanyProfile;
      })
    );

    return detailedCandidates;
  } catch (err: any) {
    console.warn('[EGDesk Company Research] Failed to search candidates:', err.message);
    return [];
  }
}

/**
 * 이지데스크 egdesk-company-research MCP 호출: 국민연금 공공데이터 단일 사업장 정밀 조회
 * 사업자등록번호(bizNumber)가 주어지면 일치하는 사업장을 최우선으로 특정합니다.
 */
export async function lookupCompanyProfile(companyName: string, bizNumber?: string): Promise<RealCompanyProfile | null> {
  if (!companyName || companyName.trim().length < 2) return null;

  try {
    const candidates = await searchCompanyCandidates(companyName, 5);
    if (candidates.length === 0) return null;

    // 사업자등록번호가 제공된 경우: 앞자리(3~6자리) 대조하여 정확한 기업 특정
    if (bizNumber) {
      const cleanInputDigits = bizNumber.replace(/[^0-9]/g, '');
      if (cleanInputDigits.length >= 3) {
        const matched = candidates.find((c) => {
          if (!c.businessNumberPrefix) return false;
          const cleanPrefixDigits = c.businessNumberPrefix.replace(/[^0-9]/g, '');
          return (
            cleanInputDigits.startsWith(cleanPrefixDigits) ||
            cleanPrefixDigits.startsWith(cleanInputDigits.slice(0, 3))
          );
        });
        if (matched) return matched;
      }
    }

    // 사업자번호가 없거나 일치 항목이 없는 경우 첫 번째 후보 반환
    return candidates[0] || null;
  } catch (err: any) {
    console.warn('[EGDesk Company Research] Failed to lookup profile:', err.message);
    return null;
  }
}
