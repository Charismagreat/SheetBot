import { queryTable, callSheetsTool } from "@/lib/egdesk-helpers";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";

export interface EstimateCatalogItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  discountPrice: number;
  photoUrl?: string;
  description?: string;
  minQty: number;
  note?: string;
}

export interface EstimateMerchantInfo {
  businessName: string;
  phone: string;
  email: string;
  imageUrl?: string;
}

export interface EstimateBusinessInfo {
  companyName?: string;
  ownerName?: string;
  bizNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  sealImageUrl?: string;
  defaultValidDays?: number;
  paymentNotice?: string;
  extraNotice?: string;
}

export interface EstimateCatalogResult {
  success: boolean;
  merchant: EstimateMerchantInfo;
  businessInfo: EstimateBusinessInfo;
  categories: string[];
  catalog: EstimateCatalogItem[];
  cached?: boolean;
  cachedAt?: string;
}

export const DEFAULT_ESTIMATE_CATALOG: EstimateCatalogItem[] = [
  {
    code: "EST-AC01",
    category: "에어컨 세척",
    name: "스탠드 에어컨 분해세척",
    spec: "1대",
    unitPrice: 150000,
    discountPrice: 140000,
    photoUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500",
    description: "필터 및 열교환기 고압 살균 분해세척",
    minQty: 1,
    note: "가정/사무실",
  },
  {
    code: "EST-AC02",
    category: "에어컨 세척",
    name: "천장형 시스템 에어컨 (4WAY)",
    spec: "1대",
    unitPrice: 130000,
    discountPrice: 120000,
    photoUrl: "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=500",
    description: "드레인판 세척 및 친환경 핀세정",
    minQty: 1,
    note: "사업장/매장",
  },
  {
    code: "EST-AC03",
    category: "에어컨 세척",
    name: "벽걸이 에어컨 고압세척",
    spec: "1대",
    unitPrice: 80000,
    discountPrice: 80000,
    photoUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500",
    description: "완전 분해 살균 세척",
    minQty: 1,
    note: "원룸/오피스텔",
  },
  {
    code: "EST-OPT01",
    category: "추가 시공",
    name: "실외기 고압 세척",
    spec: "1대",
    unitPrice: 30000,
    discountPrice: 30000,
    photoUrl: "",
    description: "실외기 방열판 이물질 및 먼지 제거",
    minQty: 1,
    note: "선택 옵션",
  },
  {
    code: "EST-OPT02",
    category: "서비스/방역",
    name: "공간 피톤치드 연무 살균",
    spec: "1식",
    unitPrice: 30000,
    discountPrice: 0,
    photoUrl: "",
    description: "실내 전체 항균 탈취 연무 시공",
    minQty: 1,
    note: "프로모션 무료 제공",
  },
];

// 초고속 인메모리 캐시 (TTL: 5분)
interface EstimateCacheEntry {
  data: EstimateCatalogResult;
  timestamp: number;
}
const estimateCache = new Map<string, EstimateCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearEstimateCatalogCache(targetEmail?: string) {
  if (targetEmail) {
    for (const key of estimateCache.keys()) {
      if (key.startsWith(targetEmail)) {
        estimateCache.delete(key);
      }
    }
  } else {
    estimateCache.clear();
  }
}

async function safeSheetCall<T>(fn: () => Promise<T>, timeoutMs = 3000): Promise<T | null> {
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/**
 * 사장님의 간편 견적 단가표 및 사업자 정보 고속 조회
 */
export async function getEstimateCatalogData(options: {
  userKey?: string | null;
  directEmail?: string | null;
  isRefresh?: boolean;
}): Promise<EstimateCatalogResult> {
  const { userKey, directEmail, isRefresh } = options;

  let targetEmail = "chachogreat@gmail.com";
  if (userKey) {
    const resolvedEmail = await resolveUserEmailFromKey(userKey);
    if (resolvedEmail) {
      targetEmail = resolvedEmail;
    }
  } else if (directEmail) {
    targetEmail = directEmail.toLowerCase().trim();
  }

  const cacheKey = `${targetEmail}_estimate_catalog`;
  if (!isRefresh && estimateCache.has(cacheKey)) {
    const entry = estimateCache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return { ...entry.data, cached: true };
    }
  }

  let businessName = "스마트 간편 견적 센터";
  let phone = "";
  let merchantImageUrl = "";

  // 1. 프로필 세팅 조회
  try {
    const settingRes = await queryTable("sheetbot_settings", {
      filters: { key: `quote_profile_${targetEmail}` },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (settingRes.rows && settingRes.rows.length > 0) {
      const val = JSON.parse(settingRes.rows[0].value || "{}");
      if (val.businessName && val.businessName.trim()) businessName = val.businessName.trim();
      if (val.phone && val.phone.trim()) phone = val.phone.trim();
      if (val.imageUrl) merchantImageUrl = val.imageUrl;
    }
  } catch (_) {}

  let catalog: EstimateCatalogItem[] = [...DEFAULT_ESTIMATE_CATALOG];
  const businessInfo: EstimateBusinessInfo = {
    companyName: businessName,
    ownerName: "대표자",
    bizNumber: "",
    address: "",
    phone: phone,
    email: targetEmail,
    website: "https://sheetbot.cloud",
    sealImageUrl: "https://sheetbot.cloud/seal.png",
    defaultValidDays: 14,
    paymentNotice: "견적 승인 후 작업 일정이 조율됩니다.",
    extraNotice: "현장 상황에 따라 추가 작업 비용이 발생할 수 있습니다.",
  };

  // 2. 구글 시트 바인딩 확인
  let spreadsheetId = "";
  try {
    const resolved = await resolveUserSpreadsheet({
      userEmail: targetEmail,
      sheetType: "ESTIMATE",
      defaultTitle: "[SheetBot] 스마트 간편 견적 및 단가 대장",
    });
    spreadsheetId = resolved.spreadsheetId;
  } catch (err: any) {
    console.warn("[EstimateCatalog] resolveUserSpreadsheet warning:", err.message);
  }

  if (spreadsheetId) {
    // 3. 단가표 탭 조회
    try {
      const rangeRes = await safeSheetCall(async () => {
        let res = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId,
            range: "단가표!A2:J100",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);

        if (!res?.values || res.values.length === 0) {
          res = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId,
              range: "시트1!A2:J100",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch(() => null);
        }
        return res;
      }, 4000);

      if (rangeRes?.values && rangeRes.values.length > 0) {
        const parsedCatalog: EstimateCatalogItem[] = [];
        rangeRes.values.forEach((row: any[], idx: number) => {
          if (!row || !row[2]) return; // 품목명이 없으면 건너뜀
          const category = String(row[0] || "기본").trim();
          const code = String(row[1] || `EST-${idx + 1}`).trim();
          const name = String(row[2]).trim();
          const spec = String(row[3] || "1식").trim();
          const rawPrice = String(row[4] || "0").replace(/[^0-9]/g, "");
          const unitPrice = parseInt(rawPrice, 10) || 0;
          const rawDiscount = String(row[5] || "").replace(/[^0-9]/g, "");
          const discountPrice = rawDiscount ? parseInt(rawDiscount, 10) || unitPrice : unitPrice;
          const photoUrl = String(row[6] || "").trim();
          const description = String(row[7] || "").trim();
          const rawMinQty = String(row[8] || "1").replace(/[^0-9]/g, "");
          const minQty = Math.max(1, parseInt(rawMinQty, 10) || 1);
          const note = String(row[9] || "").trim();

          parsedCatalog.push({
            code,
            category,
            name,
            spec,
            unitPrice,
            discountPrice,
            photoUrl,
            description,
            minQty,
            note,
          });
        });

        if (parsedCatalog.length > 0) {
          catalog = parsedCatalog;
        }
      }
    } catch (sheetErr: any) {
      console.warn("[EstimateCatalog] 단가표 탭 읽기 실패:", sheetErr.message);
    }

    // 4. 사업자정보 탭 조회
    try {
      const bizRes = await safeSheetCall(async () => {
        return await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId,
            range: "사업자정보!A1:B15",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);
      }, 3000);

      if (bizRes?.values && bizRes.values.length > 0) {
        for (const row of bizRes.values) {
          if (!row || !row[0]) continue;
          const k = String(row[0]).trim();
          const v = String(row[1] || "").trim();
          if (k.includes("회사명") || k.includes("상호")) businessInfo.companyName = v;
          else if (k.includes("대표자")) businessInfo.ownerName = v;
          else if (k.includes("사업자등록번호") || k.includes("사업자번호")) businessInfo.bizNumber = v;
          else if (k.includes("주소")) businessInfo.address = v;
          else if (k.includes("연락처") || k.includes("전화")) businessInfo.phone = v;
          else if (k.includes("메일")) businessInfo.email = v;
          else if (k.includes("홈페이지") || k.includes("SNS")) businessInfo.website = v;
          else if (k.includes("직인") || k.includes("도장")) businessInfo.sealImageUrl = v;
          else if (k.includes("유효기간")) businessInfo.defaultValidDays = parseInt(v.replace(/[^0-9]/g, ""), 10) || 14;
          else if (k.includes("결제") || k.includes("시공")) businessInfo.paymentNotice = v;
          else if (k.includes("특약") || k.includes("주의사항")) businessInfo.extraNotice = v;
        }
      }
    } catch (bizErr: any) {
      console.warn("[EstimateCatalog] 사업자정보 탭 읽기 실패:", bizErr.message);
    }
  }

  // 상호 및 전화번호 시트값 우선 반영
  if (businessInfo.companyName) {
    businessName = businessInfo.companyName;
  }
  if (businessInfo.phone) {
    phone = businessInfo.phone;
  }

  // 카테고리 목록 추출
  const categorySet = new Set<string>();
  catalog.forEach((item) => {
    if (item.category) categorySet.add(item.category);
  });
  const categories = ["전체", ...Array.from(categorySet)];

  const result: EstimateCatalogResult = {
    success: true,
    merchant: {
      businessName,
      phone,
      email: targetEmail,
      imageUrl: merchantImageUrl,
    },
    businessInfo,
    categories,
    catalog,
    cached: false,
    cachedAt: new Date().toISOString(),
  };

  estimateCache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}
