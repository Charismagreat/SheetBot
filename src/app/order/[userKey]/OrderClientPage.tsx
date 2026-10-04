"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  Minus,
  Sparkles,
  Calendar,
  MapPin,
  FileText,
  X,
  ArrowRight,
  Phone,
  Printer,
  Copy,
  Check,
  PackageCheck,
  AlertCircle,
  Eye,
  Store,
  CreditCard,
  Truck,
  RotateCcw,
  Building2,
  Globe,
  Mail,
  HelpCircle,
  Clock,
} from "lucide-react";

/** 배송/주문 요청사항 원터치 퀵 선택 문구 목록 */
const QUICK_REQUEST_NOTES = [
  "방문 전 미리 연락 부탁드립니다",
  "부재 시 문 앞에 놓아주세요",
  "경비실에 맡겨주세요",
  "당일 방문 30분 전 전화 주세요",
  "최대한 빠른 방문 희망합니다",
];

interface CatalogItem {
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

interface MerchantInfo {
  businessName: string;
  phone: string;
  email: string;
  imageUrl?: string;
}

interface BusinessInfo {
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

// 이미지 URL 정규화 (글로벌 초고속 CDN 1순위 및 터널 로컬 API 2순위 지원)
function getCdnOrLocalImageUrl(url?: string | null, useLocalOnly = false): string | null {
  if (!url) return null;
  const match = url.match(/quote_[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif)/i);
  if (match) {
    if (useLocalOnly) {
      return `https://sheetbot.cloud/api/user/quote/image?file=${match[0]}`;
    }
    return `https://cdn.jsdelivr.net/gh/Charismagreat/SheetBot@main/public/uploads/quote-images/${match[0]}`;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return url;
}

const DEFAULT_FALLBACK_CATALOG: CatalogItem[] = [
  {
    code: "AC-001",
    category: "에어컨 세척",
    name: "스탠드 에어컨 분해세척",
    spec: "1대",
    unitPrice: 150000,
    discountPrice: 140000,
    photoUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500",
    isSoldOut: false,
    optionType: "메인",
    note: "필터 및 열교환기 고압 살균",
  },
  {
    code: "AC-002",
    category: "에어컨 세척",
    name: "벽걸이 에어컨 분해세척",
    spec: "1대",
    unitPrice: 80000,
    discountPrice: 80000,
    photoUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500",
    isSoldOut: false,
    optionType: "메인",
    note: "가정용/원룸 기준",
  },
  {
    code: "AC-003",
    category: "에어컨 세척",
    name: "천장형 시스템 에어컨 (4WAY)",
    spec: "1대",
    unitPrice: 130000,
    discountPrice: 120000,
    photoUrl: "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=500",
    isSoldOut: false,
    optionType: "메인",
    note: "사무실/상가 천장형",
  },
  {
    code: "OPT-001",
    category: "추가 옵션",
    name: "실외기 고압 세척",
    spec: "1대",
    unitPrice: 30000,
    discountPrice: 30000,
    photoUrl: "",
    isSoldOut: false,
    optionType: "옵션",
    note: "실외기 오염물 및 이물질 제거",
  },
];

export default function OrderClientPage({ 
  userKey: propUserKey,
  initialData,
}: { 
  userKey?: string;
  initialData?: any;
}) {
  const params = useParams();
  const router = useRouter();
  const userKey = propUserKey || (params?.userKey as string) || "";

  // 🚀 [초고속 0초 렌더링]: SSR initialData가 있으면 첫 렌더부터 완성된 실제 데이터 노출
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<MerchantInfo>(() => {
    if (initialData?.merchant) {
      return initialData.merchant;
    }
    return {
      businessName: "스마트 간편 주문 센터",
      phone: "",
      email: "",
      imageUrl: "",
    };
  });
  const [logoFallbackLocal, setLogoFallbackLocal] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(() => initialData?.businessInfo || {});
  const [catalog, setCatalog] = useState<CatalogItem[]>(() => {
    if (initialData?.catalog && initialData.catalog.length > 0) {
      return initialData.catalog;
    }
    return DEFAULT_FALLBACK_CATALOG;
  });
  const [categories, setCategories] = useState<string[]>(() => {
    if (initialData?.categories && initialData.categories.length > 0) {
      return initialData.categories;
    }
    return ["에어컨 세척", "추가 옵션"];
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // 품목별 선택 수량: { [code]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 상세 이미지 모달 팝업
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // 주문 접수 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 주문 완료 상태 (전자 주문확인서 렌더링용)
  const [orderResult, setOrderResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [accountCopied, setAccountCopied] = useState(false);

  // 💾 [실시간 임시저장 및 복원]: 다른 앱 전환/새로고침 시 입력 내용 100% 무손실 복원
  const [draftLoaded, setDraftLoaded] = useState(false);

  // 1-1. 마운트 시 저장된 임시 주문서 데이터 자동 복원
  useEffect(() => {
    if (!userKey || typeof window === "undefined") return;
    const draftKey = `sheetbot_order_draft_${userKey}`;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.quantities && Object.keys(draft.quantities).length > 0) {
          setQuantities(draft.quantities);
        }
        if (draft.customerName) setCustomerName(draft.customerName);
        if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
        if (draft.customerAddress) setCustomerAddress(draft.customerAddress);
        if (draft.preferredDate) setPreferredDate(draft.preferredDate);
        if (draft.notes) setNotes(draft.notes);
        if (draft.isModalOpen) setIsModalOpen(true);
      }
    } catch (_) {}
    setDraftLoaded(true);
  }, [userKey]);

  // 1-2. 입력 내용 변경 시 localStorage 실시간 자동 백업 (Autosave)
  useEffect(() => {
    if (!userKey || !draftLoaded || typeof window === "undefined") return;
    const draftKey = `sheetbot_order_draft_${userKey}`;

    if (orderResult) {
      localStorage.removeItem(draftKey);
      return;
    }

    const hasData =
      Object.keys(quantities).length > 0 ||
      customerName ||
      customerPhone ||
      customerAddress ||
      preferredDate ||
      notes ||
      isModalOpen;

    if (hasData) {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            quantities,
            customerName,
            customerPhone,
            customerAddress,
            preferredDate,
            notes,
            isModalOpen,
          })
        );
      } catch (_) {}
    } else {
      try {
        localStorage.removeItem(draftKey);
      } catch (_) {}
    }
  }, [
    userKey,
    draftLoaded,
    quantities,
    customerName,
    customerPhone,
    customerAddress,
    preferredDate,
    notes,
    isModalOpen,
    orderResult,
  ]);

  // 1. 단가표(품목 목록), 상호 및 시트 사업자정보 로드 (SWR 패턴: 0.00초 즉시 렌더링 + 백그라운드 동기화)
  useEffect(() => {
    if (!userKey) return;

    const storageKey = `sheetbot_order_cache_${userKey}`;

    // 🚀 [1] 마운트 즉시 로컬 캐시 확인 -> 저장된 데이터가 있으면 교체
    if (typeof window !== "undefined") {
      try {
        const cachedRaw = localStorage.getItem(storageKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.catalog && cached.catalog.length > 0) {
            setCatalog(cached.catalog);
            setCategories(cached.categories || []);
            if (cached.merchant) setMerchant(cached.merchant);
            if (cached.businessInfo) setBusinessInfo(cached.businessInfo);
          }
        }
      } catch (_) {}
    }

    async function loadCatalog() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃 가드

      try {
        setLogoError(false);
        const res = await apiFetch(`/api/user/quote/catalog?userKey=${encodeURIComponent(userKey)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        if (data && data.success) {
          if (data.catalog && data.catalog.length > 0) {
            setCatalog(data.catalog);
          }
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          }
          if (data.merchant) {
            setMerchant(data.merchant);
            setLogoError(false);
          }
          if (data.businessInfo) {
            setBusinessInfo(data.businessInfo);
          }
          // 최신 데이터를 로컬 캐시에 저장
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({
                catalog: data.catalog || [],
                categories: data.categories || [],
                merchant: data.merchant,
                businessInfo: data.businessInfo,
                savedAt: Date.now(),
              })
            );
          } catch (_) {}
        }
      } catch (err: any) {
        // 네트워크 지연/오류 시에도 기본 카탈로그가 이미 표시되고 있으므로 조용히 폴백 유지
        console.warn("[OrderClientPage] Background catalog sync note:", err?.name === "AbortError" ? "Timeout, using cached" : err?.message);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }

    loadCatalog();
  }, [userKey]);

  // 2. 수량 증감 핸들러
  const handleQuantityChange = (code: string, delta: number, isSoldOut?: boolean) => {
    if (isSoldOut && delta > 0) {
      alert("해당 품목은 현재 품절 상태입니다.");
      return;
    }
    setQuantities((prev) => {
      const current = prev[code] || 0;
      const next = Math.max(0, current + delta);
      const updated = { ...prev };
      if (next === 0) {
        delete updated[code];
      } else {
        updated[code] = next;
      }
      return updated;
    });
  };

  // 3. 선택된 품목 및 금액 실시간 계산
  const selectedItems = useMemo(() => {
    return catalog
      .filter((item) => (quantities[item.code] || 0) > 0)
      .map((item) => {
        const qty = quantities[item.code];
        const effectivePrice = item.discountPrice > 0 ? item.discountPrice : item.unitPrice;
        return {
          ...item,
          quantity: qty,
          effectivePrice,
          amount: effectivePrice * qty,
        };
      });
  }, [catalog, quantities]);

  const supplyAmount = useMemo(() => {
    return selectedItems.reduce((acc, cur) => acc + cur.amount, 0);
  }, [selectedItems]);

  const vatAmount = useMemo(() => {
    return Math.round(supplyAmount * 0.1);
  }, [supplyAmount]);

  const totalAmount = useMemo(() => {
    return supplyAmount + vatAmount;
  }, [supplyAmount, vatAmount]);

  const totalItemCount = useMemo(() => {
    return selectedItems.reduce((acc, cur) => acc + cur.quantity, 0);
  }, [selectedItems]);

  // 상호명 표시 안전화 (모바일 앱 설정값 1순위 반영, 시트 사업자정보 2순위, 이메일 노출 방지)
  const displayBusinessName = useMemo(() => {
    const raw = merchant.businessName?.trim();
    const emailPrefix = merchant.email?.split("@")[0]?.toLowerCase();
    const isDefaultSystemName =
      !raw ||
      raw === "스마트 간편 주문 센터" ||
      raw === "스마트 견적 & 주문 센터" ||
      (emailPrefix && raw.toLowerCase() === emailPrefix);

    // 1순위: 모바일 앱에서 직접 설정한 유효한 상호명이 있으면 최우선 반영
    if (!isDefaultSystemName && raw) {
      return raw;
    }

    // 2순위: 구글 시트 '사업자정보' 탭의 상호명 반영
    if (businessInfo.companyName && businessInfo.companyName.trim()) {
      return businessInfo.companyName.trim();
    }

    return raw || "스마트 간편 주문 센터";
  }, [businessInfo.companyName, merchant.businessName, merchant.email]);

  // 4. 카테고리 필터링
  const filteredCatalog = useMemo(() => {
    if (selectedCategory === "ALL") return catalog;
    return catalog.filter((item) => item.category === selectedCategory);
  }, [catalog, selectedCategory]);

  // 5. 최종 주문 제출
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      alert("성함과 연락처를 입력해 주세요.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("선택된 주문 품목이 없습니다.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        userKey,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        preferredDate: preferredDate.trim(),
        notes: notes.trim(),
        items: selectedItems.map((item) => ({
          code: item.code,
          category: item.category,
          name: item.name,
          spec: item.spec,
          unitPrice: item.unitPrice,
          discountPrice: item.discountPrice,
          quantity: item.quantity,
          amount: item.amount,
        })),
      };

      const res = await apiFetch("/api/user/quote/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setOrderResult(data);
        if (data.businessInfo) {
          setBusinessInfo(data.businessInfo);
        }
        setIsModalOpen(false);
        if (typeof window !== "undefined" && userKey) {
          try {
            localStorage.removeItem(`sheetbot_order_draft_${userKey}`);
          } catch (_) {}
        }
        setCustomerName("");
        setCustomerPhone("");
        setCustomerAddress("");
        setPreferredDate("");
        setNotes("");
        setQuantities({});
      } else {
        alert(data.error || "주문 접수에 실패했습니다.");
      }
    } catch (err: any) {
      alert("주문 처리 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // 주문내역 텍스트 클립보드 복사
  const handleCopyOrderSummary = () => {
    if (!orderResult) return;
    const info = orderResult.businessInfo || businessInfo;
    const lines = [
      `[${displayBusinessName}] 전자 주문확인서`,
      `주문번호: ${orderResult.orderId}`,
      `주문일시: ${orderResult.createdAt}`,
      `주문자명: ${orderResult.customerName} (${orderResult.customerPhone})`,
      orderResult.customerAddress ? `배송/주소: ${orderResult.customerAddress}` : "",
      orderResult.preferredDate ? `희망일시: ${orderResult.preferredDate}` : "",
      orderResult.notes ? `요청사항: ${orderResult.notes}` : "",
      `--------------------------`,
      `[주문 품목 내역]`,
      ...orderResult.items.map((it: any) => {
        const unit = (it.spec || "").trim().replace(/^\d+\s*/, "") || it.spec || "개";
        return `• ${it.name} (${it.quantity}${unit}) - ${it.amount.toLocaleString()}원`;
      }),
      `--------------------------`,
      `공급가액: ${orderResult.supplyAmount.toLocaleString()}원`,
      `부가세(10%): ${orderResult.vatAmount.toLocaleString()}원`,
      `총 결제금액: ${orderResult.totalAmount.toLocaleString()}원`,
      info.paymentNotice ? `--------------------------\n[결제/입금 안내]\n${info.paymentNotice}` : "",
      info.shippingNotice ? `[배송 안내]\n${info.shippingNotice}` : "",
      info.phone ? `고객센터: ${info.phone}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // 계좌번호 복사 헬퍼
  const handleCopyAccount = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setAccountCopied(true);
      setTimeout(() => setAccountCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
        {/* 상단 헤더 스켈레톤 */}
        <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-800 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 bg-slate-800 rounded animate-pulse" />
                <div className="h-3 w-16 bg-slate-800/60 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-7 w-20 bg-slate-800 rounded-lg animate-pulse" />
          </div>
        </header>

        {/* 카테고리 탭 스켈레톤 */}
        <div className="border-b border-slate-800/50 px-4 py-2.5 max-w-2xl mx-auto flex gap-2 overflow-hidden">
          <div className="h-7 w-16 bg-slate-800 rounded-full animate-pulse" />
          <div className="h-7 w-20 bg-slate-800/70 rounded-full animate-pulse" />
          <div className="h-7 w-20 bg-slate-800/50 rounded-full animate-pulse" />
        </div>

        {/* 품목 카드 리스트 스켈레톤 */}
        <main className="max-w-2xl mx-auto p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex gap-3.5 items-center animate-pulse"
            >
              <div className="w-20 h-20 bg-slate-800 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-slate-800 rounded" />
                <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
                <div className="h-4 w-24 bg-slate-800 rounded mt-2" />
              </div>
              <div className="h-9 w-24 bg-slate-800 rounded-xl shrink-0" />
            </div>
          ))}
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <X className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">주문 페이지를 열 수 없습니다</h2>
        <p className="text-slate-400 text-sm max-w-sm mb-6">{error}</p>
      </div>
    );
  }

  // ==========================================================
  // [주문 완료 화면: 모바일 전자 주문확인서 (HTML 영수증)]
  // ==========================================================
  if (orderResult) {
    const activeInfo = orderResult.businessInfo || businessInfo;
    const contactPhone = activeInfo.phone || merchant.phone;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-3 sm:px-6 flex flex-col items-center justify-center print:bg-white print:text-black print:p-0">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl print:border-none print:shadow-none print:bg-white print:p-4">
          {/* 상단 축하/안내 뱃지 */}
          <div className="text-center mb-6 print:mb-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 print:hidden">
              <PackageCheck className="w-10 h-10" />
            </div>
            <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold mb-2 print:border print:border-emerald-600">
              ✓ 주문 접수 완료 • 구글 시트 실시간 등록
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight print:text-black">
              전자 주문확인서
            </h1>
            <p className="text-xs text-slate-400 mt-1 print:text-gray-600">
              고객님의 주문이 사장님께 안전하게 전달되었습니다.
            </p>
          </div>

          {/* 영수증 카드 본체 */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 text-xs sm:text-sm print:bg-white print:border-gray-300 print:text-black">
            {/* 기본 주문 메타 정보 */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-800/80 print:border-gray-200">
              <div>
                <span className="text-[11px] text-slate-500 uppercase tracking-wider block">판매점</span>
                <span className="font-bold text-white text-sm sm:text-base print:text-black">{displayBusinessName}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider block">주문번호</span>
                <span className="font-mono text-emerald-400 font-bold print:text-black">{orderResult.orderId}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-400 print:text-gray-600 text-xs">
              <div>
                <span className="block text-[11px] text-slate-500">주문일시</span>
                <span className="text-slate-200 font-medium print:text-black">{orderResult.createdAt}</span>
              </div>
              <div>
                <span className="block text-[11px] text-slate-500">주문자 성함</span>
                <span className="text-slate-200 font-medium print:text-black">
                  {orderResult.customerName} ({orderResult.customerPhone})
                </span>
              </div>
              {orderResult.customerAddress && (
                <div className="col-span-2">
                  <span className="block text-[11px] text-slate-500">배송 / 방문 주소</span>
                  <span className="text-slate-200 font-medium print:text-black">{orderResult.customerAddress}</span>
                </div>
              )}
              {orderResult.preferredDate && (
                <div>
                  <span className="block text-[11px] text-slate-500">희망 일시</span>
                  <span className="text-slate-200 font-medium print:text-black">{orderResult.preferredDate}</span>
                </div>
              )}
              {orderResult.notes && (
                <div className="col-span-2">
                  <span className="block text-[11px] text-slate-500">배송/주문 요청사항</span>
                  <span className="text-slate-200 font-medium print:text-black">{orderResult.notes}</span>
                </div>
              )}
            </div>

            {/* 품목 내역 테이블 */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 print:text-black">
                주문 품목 내역 ({orderResult.items?.length || 0}종)
              </span>
              <div className="border border-slate-800 rounded-xl overflow-hidden print:border-gray-300">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold print:bg-gray-100 print:text-black">
                    <tr>
                      <th className="py-2 px-3">품목명</th>
                      <th className="py-2 px-2 text-center">수량</th>
                      <th className="py-2 px-3 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 print:divide-gray-200">
                    {orderResult.items?.map((it: any, idx: number) => (
                      <tr key={idx} className="text-slate-200 print:text-black">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-white print:text-black">{it.name}</div>
                          <div className="text-[10px] text-slate-400 print:text-gray-500">{it.spec} • {it.category}</div>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">
                          {it.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium">
                          {it.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 결제 금액 합계 요약 */}
            <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs print:border-gray-200">
              <div className="flex justify-between text-slate-400 print:text-gray-600">
                <span>공급가액</span>
                <span className="font-mono text-slate-200 print:text-black">{orderResult.supplyAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-slate-400 print:text-gray-600">
                <span>부가세 (10%)</span>
                <span className="font-mono text-slate-200 print:text-black">{orderResult.vatAmount.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 text-sm font-bold print:border-gray-300">
                <span className="text-white print:text-black">총 결제예정금액</span>
                <span className="text-emerald-400 text-lg font-black print:text-black">
                  {orderResult.totalAmount.toLocaleString()}원
                </span>
              </div>
            </div>

            {/* [1] 결제 및 입금 안내 (시트 '사업자정보' 탭 연동) */}
            {activeInfo.paymentNotice && (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 space-y-1.5 print:bg-gray-50 print:border-gray-300">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs print:text-black">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    결제 / 입금 계좌 안내
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyAccount(activeInfo.paymentNotice!)}
                    className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition print:hidden"
                  >
                    {accountCopied ? "복사됨!" : "계좌 복사"}
                  </button>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-medium print:text-black">
                  {activeInfo.paymentNotice}
                </p>
              </div>
            )}

            {/* [2] 배송 / 환불 및 기타 안내 (시트 '사업자정보' 탭 연동) */}
            <div className="bg-slate-900/80 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 border border-slate-800/80 print:border-gray-200 print:bg-gray-50 print:text-gray-800">
              {activeInfo.shippingNotice && (
                <div className="space-y-0.5">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider print:text-black">
                    <Truck className="w-3.5 h-3.5 text-teal-400" />
                    배송 관련 안내
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line pl-4 print:text-black">
                    {activeInfo.shippingNotice}
                  </p>
                </div>
              )}

              {activeInfo.refundNotice && (
                <div className="space-y-0.5 pt-1 border-t border-slate-800/60 print:border-gray-200">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider print:text-black">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    환불 / 취소 안내
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line pl-4 print:text-black">
                    {activeInfo.refundNotice}
                  </p>
                </div>
              )}

              {activeInfo.extraNotice && (
                <div className="space-y-0.5 pt-1 border-t border-slate-800/60 print:border-gray-200">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider print:text-black">
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                    기타 안내사항
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line pl-4 print:text-black">
                    {activeInfo.extraNotice}
                  </p>
                </div>
              )}

              {!activeInfo.shippingNotice && !activeInfo.refundNotice && (
                <p className="text-[11px] text-slate-400">
                  • 주문 내역이 사장님의 스프레드시트 대장에 실시간 기록되었습니다.<br />
                  • 배송 및 입금 관련 세부 안내는 기재해주신 연락처로 판매점에서 직접 안내드립니다.
                </p>
              )}
            </div>

            {/* [3] 사업자 정보 공식 푸터 (시트 '사업자정보' 탭 연동) */}
            <div className="pt-3 border-t border-slate-800 text-[10px] sm:text-[11px] text-slate-400 space-y-1 print:border-gray-300 print:text-gray-600">
              <div className="font-semibold text-slate-300 flex items-center gap-1 print:text-black">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>사업자 정보</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
                <div>상호(회사명): <span className="text-slate-300 font-medium print:text-black">{activeInfo.companyName || displayBusinessName}</span></div>
                {activeInfo.ownerName && <div>대표자: <span className="text-slate-300 font-medium print:text-black">{activeInfo.ownerName}</span></div>}
                {activeInfo.bizNumber && <div>사업자등록번호: <span className="text-slate-300 font-medium print:text-black">{activeInfo.bizNumber}</span></div>}
                {contactPhone && <div>고객센터: <span className="text-slate-300 font-medium print:text-black">{contactPhone}</span></div>}
                {activeInfo.address && <div className="sm:col-span-2">사업장 주소: <span className="text-slate-300 font-medium print:text-black">{activeInfo.address}</span></div>}
                {activeInfo.email && <div>대표 이메일: <span className="text-slate-300 font-medium print:text-black">{activeInfo.email}</span></div>}
                {activeInfo.website && (
                  <div>
                    홈페이지:{" "}
                    <a
                      href={activeInfo.website.startsWith("http") ? activeInfo.website : `https://${activeInfo.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline print:text-black"
                    >
                      {activeInfo.website}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 하단 제어 버튼 모음 (인쇄 모드에서는 숨김) */}
          <div className="mt-5 space-y-2.5 print:hidden">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => window.print()}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700/60"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                확인서 인쇄 / PDF
              </button>
              <button
                onClick={handleCopyOrderSummary}
                className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700/60"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">복사 완료!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    주문내역 복사
                  </>
                )}
              </button>
            </div>

            {contactPhone && (
              <a
                href={`tel:${contactPhone}`}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/40"
              >
                <Phone className="w-4 h-4" />
                사장님께 전화 문의 ({contactPhone})
              </a>
            )}

            <button
              onClick={() => {
                setOrderResult(null);
                setQuantities({});
                setCustomerName("");
                setCustomerPhone("");
                setCustomerAddress("");
                setPreferredDate("");
                setNotes("");
              }}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-300 font-medium transition text-center"
            >
              + 새로운 주문 작성하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // [메인 화면: 모바일 간편 주문 & 품목 목록]
  // ==========================================================
  const contactPhone = businessInfo.phone || merchant.phone;

  return (
    <div 
      className="min-h-screen bg-slate-950 text-slate-100 pb-36"
      style={{ backgroundColor: "#020617", color: "#f8fafc", minHeight: "100vh" }}
    >
      {/* 1. 상단 브랜드 헤더 */}
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {merchant.imageUrl && merchant.imageUrl !== "https://sheetbot.cloud/favicon.svg" && !logoError ? (
              <img
                src={getCdnOrLocalImageUrl(merchant.imageUrl, logoFallbackLocal) || merchant.imageUrl}
                alt={displayBusinessName}
                onError={() => {
                  if (!logoFallbackLocal) {
                    setLogoFallbackLocal(true);
                  } else {
                    setLogoError(true);
                  }
                }}
                className="w-9 h-9 rounded-xl object-cover border border-slate-700/80 shadow-md shadow-emerald-950/40"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <Store className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">{displayBusinessName}</h1>
              <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                실시간 간편 주문
              </p>
            </div>
          </div>
          {contactPhone && (
            <a
              href={`tel:${contactPhone}`}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              전화문의
            </a>
          )}
        </div>
      </header>

      {/* 2. 카테고리 필터 탭 */}
      {categories.length > 1 && (
        <div className="sticky top-[61px] z-10 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50 px-4 py-2.5">
          <div className="max-w-2xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSelectedCategory("ALL")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === "ALL"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              전체 ({catalog.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-900/40"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. 메인 품목 카드 리스트 */}
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-3.5">
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-white font-semibold">원하시는 품목을 골라 담아보세요!</strong>
            <p className="text-slate-400 mt-0.5">
              품목의 <span className="text-emerald-400 font-semibold">[+] 버튼</span>을 누르면 수량과 총 결제금액이 실시간 자동 계산됩니다.
            </p>
          </div>
        </div>

        {filteredCatalog.map((item) => {
          const qty = quantities[item.code] || 0;
          const isSelected = qty > 0;
          const isDiscounted = item.discountPrice > 0 && item.discountPrice < item.unitPrice;
          const price = isDiscounted ? item.discountPrice : item.unitPrice;
          const isSoldOut = Boolean(item.isSoldOut);

          return (
            <div
              key={item.code}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                isSoldOut
                  ? "bg-slate-900/20 border-slate-800/50 opacity-70"
                  : isSelected
                  ? "bg-slate-900/90 border-emerald-500/60 shadow-lg shadow-emerald-950/30"
                  : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* 대표 사진 썸네일 (있는 경우) */}
                {item.photoUrl ? (
                  <div className="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 group">
                    <img
                      src={item.photoUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e: any) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    {item.detailPhotoUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: item.detailPhotoUrl!, title: item.name })}
                        className="absolute bottom-1 right-1 p-1 bg-black/70 hover:bg-black text-white rounded-md text-[10px] flex items-center gap-0.5"
                        title="상세사진 보기"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : null}

                {/* 품목 정보 */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-semibold text-slate-400">
                      {item.category}
                    </span>
                    {isSoldOut && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                        품절
                      </span>
                    )}
                    {isDiscounted && !isSoldOut && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold">
                        할인특가
                      </span>
                    )}
                    {item.detailPhotoUrl && !item.photoUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ url: item.detailPhotoUrl!, title: item.name })}
                        className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                      >
                        <Eye className="w-3 h-3" /> 상세사진
                      </button>
                    )}
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                    {item.name}
                  </h3>

                  {item.note && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {item.note}
                    </p>
                  )}

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-xs text-slate-500 font-medium">단위: {item.spec}</span>
                    {isDiscounted && (
                      <span className="text-xs text-slate-500 line-through">
                        {item.unitPrice.toLocaleString()}원
                      </span>
                    )}
                    <span className="text-sm sm:text-base font-extrabold text-emerald-400 font-mono">
                      {price.toLocaleString()}원
                    </span>
                  </div>
                </div>
              </div>

              {/* 하단 수량 조절 컨트롤러 */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                <div>
                  {isSoldOut ? (
                    <span className="text-xs text-rose-400 font-medium">현재 품절된 상품입니다</span>
                  ) : isSelected ? (
                    <span className="text-xs font-semibold text-emerald-400">
                      소계: {(price * qty).toLocaleString()}원
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">수량을 선택해 주세요</span>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(item.code, -1, isSoldOut)}
                    disabled={qty === 0 || isSoldOut}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition ${
                      qty > 0 && !isSoldOut
                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                        : "text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-6 text-center font-bold text-xs sm:text-sm text-white font-mono">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(item.code, 1, isSoldOut)}
                    disabled={isSoldOut}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition shadow-sm ${
                      isSoldOut
                        ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                        : "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* 4. 하단 고정 실시간 주문 플로팅 바 */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 shadow-2xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>선택 품목:</span>
              <strong className="text-white font-bold">{totalItemCount}개</strong>
              <span className="text-slate-600">|</span>
              <span>VAT 10% 포함</span>
            </div>
            <div className="text-xl font-extrabold text-emerald-400 tracking-tight font-mono">
              {totalAmount.toLocaleString()}
              <span className="text-xs font-semibold text-slate-300 ml-1 font-sans">원</span>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            disabled={totalItemCount === 0}
            className={`px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg ${
              totalItemCount > 0
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-950/50 hover:brightness-110 active:scale-95"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            <span>주문서 작성하기</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. 주문서 작성 모달 (바텀 시트) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">주문서 작성 및 접수</h2>
                <p className="text-xs text-slate-400 mt-0.5">사장님의 구글 시트 주문접수대장으로 실시간 기록됩니다.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 주문 품목 요약 */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 mb-5 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold block mb-1">담으신 주문 품목 ({totalItemCount}개)</span>
              {selectedItems.map((it) => (
                <div key={it.code} className="flex justify-between text-slate-300">
                  <span className="truncate pr-2">
                    {it.name} × {it.quantity}{(it.spec || "").trim().replace(/^\d+\s*/, "") || it.spec || "개"}
                  </span>
                  <span className="font-mono shrink-0">{it.amount.toLocaleString()}원</span>
                </div>
              ))}
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm text-white">
                <span>총 결제금액 (VAT 포함)</span>
                <span className="text-emerald-400 font-mono">{totalAmount.toLocaleString()}원</span>
              </div>
            </div>

            {/* 주문자 정보 입력 폼 */}
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  주문자 성함 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 홍길동"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  휴대폰 번호 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="010-0000-0000"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  배송지 주소 (또는 방문 장소)
                </label>
                <input
                  type="text"
                  placeholder="예: 서울시 강남구 테헤란로 123 101동 202호"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    희망 수령 / 방문 일시
                  </label>
                  <label className="cursor-pointer text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30 transition">
                    <Clock className="w-3 h-3" />
                    📅 달력/시간 선택
                    <input
                      type="datetime-local"
                      className="sr-only"
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const d = new Date(val);
                          if (!isNaN(d.getTime())) {
                            const month = d.getMonth() + 1;
                            const date = d.getDate();
                            const hours = d.getHours();
                            const minutes = d.getMinutes().toString().padStart(2, "0");
                            const ampm = hours >= 12 ? "오후" : "오전";
                            const hour12 = hours % 12 || 12;
                            const formatted = `${month}월 ${date}일 ${ampm} ${hour12}:${minutes}`;
                            setPreferredDate(formatted);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="예: 10월 5일 오후 2시 이후 / 빠른 배송"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">배송/주문 요청사항</label>
                  <span className="text-[10px] text-slate-500">자주 쓰는 문구 탭 선택</span>
                </div>
                {/* 자주 쓰이는 요청사항 퀵 선택 칩 */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_REQUEST_NOTES.map((phrase) => {
                    const isSelected = notes.includes(phrase);
                    return (
                      <button
                        key={phrase}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            const updated = notes
                              .split(" / ")
                              .filter((p) => p.trim() !== phrase)
                              .join(" / ");
                            setNotes(updated);
                          } else {
                            setNotes(notes ? `${notes} / ${phrase}` : phrase);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition flex items-center gap-1 ${
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        {phrase}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  rows={2}
                  placeholder="문 앞 보관, 배송 전 연락 등 특이사항을 적어주세요."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>주문 접수 및 시트 기록 중...</span>
                    </>
                  ) : (
                    <span>총 {totalAmount.toLocaleString()}원 주문 접수하기</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. 상세 이미지 팝업 모달 */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-200 truncate">{previewImage.title} 상세 이미지</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2 bg-slate-950 flex items-center justify-center">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="w-full h-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
