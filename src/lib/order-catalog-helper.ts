import { queryTable, callSheetsTool } from "@/lib/egdesk-helpers";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";

export interface CatalogItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  discountPrice: number;
  photoUrl?: string;
  detailPhotoUrl?: string;
  isSoldOut?: boolean;
  optionType?: string;
  note?: string;
}

export interface MerchantInfo {
  businessName: string;
  phone: string;
  email: string;
  imageUrl?: string;
}

export interface BusinessInfo {
  companyName?: string;
  ownerName?: string;
  bizNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  paymentNotice?: string;
  shippingNotice?: string;
  refundNotice?: string;
  extraNotice?: string;
}

export interface OrderCatalogResult {
  success: boolean;
  quoteId?: string | null;
  customerName?: string;
  customerPhone?: string;
  inquiryText?: string;
  merchant: MerchantInfo;
  businessInfo: BusinessInfo;
  categories: string[];
  catalog: CatalogItem[];
  cached?: boolean;
  cachedAt?: string;
}

export const DEFAULT_CATALOG: CatalogItem[] = [
  {
    code: "AC-001",
    category: "에어컨 세척",
    name: "스탠드 에어컨 분해세척",
    spec: "1대",
    unitPrice: 150000,
    discountPrice: 140000,
    photoUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "필터 및 열교환기 고압 살균"
  },
  {
    code: "AC-002",
    category: "에어컨 세척",
    name: "벽걸이 에어컨 분해세척",
    spec: "1대",
    unitPrice: 80000,
    discountPrice: 80000,
    photoUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "가정용/원룸 기준"
  },
  {
    code: "AC-003",
    category: "에어컨 세척",
    name: "천장형 시스템 에어컨 (4WAY)",
    spec: "1대",
    unitPrice: 130000,
    discountPrice: 120000,
    photoUrl: "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "사무실/상가 천장형"
  },
  {
    code: "OPT-001",
    category: "추가 옵션",
    name: "실외기 고압 세척",
    spec: "1대",
    unitPrice: 30000,
    discountPrice: 30000,
    photoUrl: "",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "옵션",
    note: "실외기 오염물 제거"
  },
  {
    code: "OPT-002",
    category: "이벤트/서비스",
    name: "피톤치드 연무 살균 소독",
    spec: "1식",
    unitPrice: 10000,
    discountPrice: 0,
    photoUrl: "",
    detailPhotoUrl: "",
    isSoldOut: true,
    optionType: "옵션",
    note: "현재 피톤치드 용액 소진 (품절 예시)"
  },
];

// ----------------------------------------------------
// 초고속 전역 인메모리 캐시 (In-Memory SWR, TTL: 10분)
// ----------------------------------------------------
interface CatalogCacheEntry {
  data: OrderCatalogResult;
  timestamp: number;
}

const catalogCache = new Map<string, CatalogCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

export function clearCatalogCache(targetEmail?: string) {
  if (targetEmail) {
    for (const key of catalogCache.keys()) {
      if (key.startsWith(targetEmail)) {
        catalogCache.delete(key);
      }
    }
  } else {
    catalogCache.clear();
  }
}

// 구글 API 지연 대비 타임아웃 가드 (최대 ms)
async function safeSheetCall<T>(fn: () => Promise<T>, timeoutMs = 2000): Promise<T | null> {
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
 * 사장님의 주문 웹앱 카탈로그 및 상호 정보 고속 조회
 * SSR 및 API 양쪽에서 안전하게 사용
 * 🚀 isSsr: true 인 경우 구글 시트 원격 API를 블로킹하지 않고 0.01초 만에 즉시 반환!
 */
export async function getOrderCatalogData(options: {
  userKey?: string | null;
  quoteId?: string | null;
  directEmail?: string | null;
  isRefresh?: boolean;
  isSsr?: boolean;
}): Promise<OrderCatalogResult> {
  const { userKey, quoteId, directEmail, isRefresh, isSsr } = options;

  let targetEmail = "chachogreat@gmail.com";
  let customerName = "";
  let customerPhone = "";
  let inquiryText = "";

  if (userKey) {
    const resolvedEmail = await resolveUserEmailFromKey(userKey);
    if (resolvedEmail) {
      targetEmail = resolvedEmail;
    }
  } else if (directEmail) {
    targetEmail = directEmail.toLowerCase().trim();
  }

  const cacheKey = `${targetEmail}_${quoteId || "default"}`;

  // 🚀 [1] 캐시 확인: 유효한 캐시가 있으면 즉시(0.001초) 반환
  if (!isRefresh) {
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return {
        ...cached.data,
        cached: true,
        cachedAt: new Date(cached.timestamp).toISOString(),
      };
    }
  }

  // 1-1. 견적 ID가 있는 경우
  if (quoteId) {
    const qRes = await queryTable("sheetbot_quotes", {
      filters: { id: quoteId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (qRes.rows && qRes.rows.length > 0) {
      const q = qRes.rows[0];
      targetEmail = q.user_email || targetEmail;
      customerName = q.customer_name || customerName;
      customerPhone = q.customer_phone || customerPhone;
      inquiryText = q.inquiry_text || inquiryText;
    }
  }

  // 🚀 [2] 사장님 프로필/상호 정보 고속 조회 (SQLite - 0.002초)
  let businessName = "";
  let merchantPhone = "";
  let merchantImage = "";

  // 1순위: sheetbot_settings 키-값 저장소 우선 확인 (최신 등록 레코드 우선)
  try {
    const settingRes = await queryTable("sheetbot_settings", {
      filters: { key: `quote_profile_${targetEmail}` },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (settingRes.rows && settingRes.rows.length > 0) {
      const val = JSON.parse(settingRes.rows[0].value || "{}");
      if (val.businessName && val.businessName.trim()) {
        businessName = val.businessName.trim();
      }
      if (val.phone) merchantPhone = val.phone;
      if (val.ogImageUrl) merchantImage = val.ogImageUrl;
      else if (val.imageUrl) merchantImage = val.imageUrl;
    }
  } catch (_) {}

  // 2순위: sheetbot_users 테이블 확인
  if (!businessName || !merchantImage) {
    try {
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: targetEmail },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (userRes.rows && userRes.rows.length > 0) {
        const u = userRes.rows[0];
        if (!businessName && u.business_name && u.business_name.trim()) {
          businessName = u.business_name.trim();
        }
        if (!merchantPhone && u.phone) merchantPhone = u.phone;
        if (!merchantImage && u.quote_image_url) merchantImage = u.quote_image_url;
      }
    } catch (_) {}
  }

  if (merchantImage) {
    const match = merchantImage.match(/quote_[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif)/i);
    if (match) {
      merchantImage = `https://cdn.jsdelivr.net/gh/Charismagreat/SheetBot@main/public/uploads/quote-images/${match[0]}`;
    }
  } else {
    merchantImage = "https://sheetbot.cloud/favicon.svg";
  }

  if (!businessName) {
    businessName = "스마트 견적 & 주문 센터";
  }

  let catalogItems: CatalogItem[] = [];
  let businessInfo: BusinessInfo = {};

  // 🚀 [3] SSR 단계에서는 구글 시트 원격 API를 기다리지 않고 초고속(0.01초) 즉시 반환!
  // 클라이언트(OrderClientPage)가 마운트된 후 백그라운드 API 호출로 최신 구글 시트 동기화(SWR)
  if (!isSsr) {
    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail: targetEmail,
        sheetType: "QUOTE",
        defaultTitle: "[SheetBot] 스마트 간편 주문 및 품목 대장",
      });

      if (resolved.spreadsheetId) {
        // 1순위: '품목' 탭 조회
        let rangeRes = await safeSheetCall(() =>
          callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "품목!A2:J200",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ),
          1500
        );

        // 2순위: 기존 '단가표' 탭 폴백 조회
        if (!rangeRes?.values || rangeRes.values.length === 0) {
          rangeRes = await safeSheetCall(() =>
            callSheetsTool(
              "sheets_get_range",
              {
                spreadsheetId: resolved.spreadsheetId,
                range: "단가표!A2:J200",
                preferOAuth: true,
              },
              { preferOAuth: true }
            ),
            1200
          );
        }

        // 3순위: 기본 '시트1' 폴백 조회
        if (!rangeRes?.values || rangeRes.values.length === 0) {
          rangeRes = await safeSheetCall(() =>
            callSheetsTool(
              "sheets_get_range",
              {
                spreadsheetId: resolved.spreadsheetId,
                range: "시트1!A2:J200",
                preferOAuth: true,
              },
              { preferOAuth: true }
            ),
            1000
          );
        }

        if (rangeRes?.values && rangeRes.values.length > 0) {
          catalogItems = rangeRes.values
            .filter((row: any[]) => row && row[2])
            .map((row: any[], idx: number) => {
              const rawSoldOut = String(row[8] || "").trim().toUpperCase();
              const isSoldOut = ["Y", "YES", "품절", "TRUE", "1", "매진", "SOLDOUT"].includes(rawSoldOut);

              const col6 = String(row[6] || "").trim();
              const isCol6Image = col6.startsWith("http://") || col6.startsWith("https://") || col6.startsWith("data:image");
              const photoUrl = isCol6Image ? col6 : "";
              const optionType = !isCol6Image && col6 ? col6 : "메인";

              const col7 = String(row[7] || "").trim();
              const detailPhotoUrl = (col7.startsWith("http://") || col7.startsWith("https://")) ? col7 : "";

              return {
                category: String(row[0] || "기본").trim(),
                code: String(row[1] || `ITEM-${idx + 1}`).trim(),
                name: String(row[2] || "").trim(),
                spec: String(row[3] || "1개").trim(),
                unitPrice: parseInt(String(row[4] || "0").replace(/[^0-9]/g, ""), 10) || 0,
                discountPrice: parseInt(String(row[5] || "0").replace(/[^0-9]/g, ""), 10) || 0,
                photoUrl,
                detailPhotoUrl,
                isSoldOut,
                optionType,
                note: String(row[9] || (isCol6Image ? "" : row[7]) || "").trim(),
              };
            });
        }

        // 사업자정보 탭 조회 (10대 항목)
        const sheetBizInfo: Record<string, string> = {};
        const infoRes = await safeSheetCall(() =>
          callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "사업자정보!A1:B15",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ),
          1200
        );

        if (infoRes?.values && infoRes.values.length > 0) {
          for (const row of infoRes.values) {
            if (row && row[0]) {
              const k = String(row[0]).trim();
              const v = String(row[1] || "").trim();
              if (k.includes("회사명") || k.includes("상호")) sheetBizInfo.companyName = v;
              else if (k.includes("대표자")) sheetBizInfo.ownerName = v;
              else if (k.includes("사업자등록번호") || k.includes("사업자번호")) sheetBizInfo.bizNumber = v;
              else if (k.includes("주소")) sheetBizInfo.address = v;
              else if (k.includes("연락처") || k.includes("전화")) sheetBizInfo.phone = v;
              else if (k.includes("메일")) sheetBizInfo.email = v;
              else if (k.includes("홈페이지") || k.includes("SNS")) sheetBizInfo.website = v;
              else if (k.includes("결제")) sheetBizInfo.paymentNotice = v;
              else if (k.includes("배송")) sheetBizInfo.shippingNotice = v;
              else if (k.includes("환불") || k.includes("취소")) sheetBizInfo.refundNotice = v;
              else if (k.includes("기타")) sheetBizInfo.extraNotice = v;
            }
          }
        }

        const isDefaultAppName = !businessName || businessName === "스마트 견적 & 주문 센터" || businessName === "스마트 간편 주문 센터";
        if (isDefaultAppName && sheetBizInfo.companyName) {
          businessName = sheetBizInfo.companyName;
        }
        if (sheetBizInfo.phone && !merchantPhone) {
          merchantPhone = sheetBizInfo.phone;
        }
        businessInfo = sheetBizInfo;
      }
    } catch (err: any) {
      console.warn("[OrderCatalogHelper] Sheet fetch warning, using default:", err.message);
    }
  }

  if (catalogItems.length === 0) {
    catalogItems = DEFAULT_CATALOG;
  }

  const categories = Array.from(new Set(catalogItems.map((c: any) => c.category)));

  const result: OrderCatalogResult = {
    success: true,
    quoteId: quoteId || null,
    customerName,
    customerPhone,
    inquiryText,
    merchant: {
      businessName,
      phone: merchantPhone,
      email: targetEmail,
      imageUrl: merchantImage,
    },
    businessInfo,
    categories,
    catalog: catalogItems,
  };

  // 🚀 [4] 비-SSR 시에만 인메모리 캐시 저장 (완성된 구글 시트 데이터만 캐시)
  if (!isSsr && catalogItems !== DEFAULT_CATALOG) {
    catalogCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });
  }

  return result;
}
