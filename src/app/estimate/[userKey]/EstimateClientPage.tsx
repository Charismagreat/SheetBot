"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Minus,
  Check,
  Calendar,
  MapPin,
  Sparkles,
  Phone,
  HelpCircle,
  Building2,
  Share2,
  Copy,
  ArrowRight,
  Info,
} from "lucide-react";
import type { EstimateCatalogResult, EstimateCatalogItem } from "@/lib/estimate-catalog-helper";

interface Props {
  userKey: string;
  initialData: EstimateCatalogResult;
}

const QUICK_REQUEST_NOTES = [
  "방문 실측 및 상세 상담 희망합니다",
  "최대한 빠른 시공 희망합니다",
  "주말/공휴일 작업 가능한지 확인 부탁드립니다",
  "세금계산서 발행 요청합니다",
];

export default function EstimateClientPage({ userKey, initialData }: Props) {
  const router = useRouter();

  const [catalog] = useState<EstimateCatalogItem[]>(initialData.catalog || []);
  const [categories] = useState<string[]>(initialData.categories || ["전체"]);
  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const [merchant] = useState(initialData.merchant);
  const [businessInfo] = useState(initialData.businessInfo);

  // 품목별 선택 수량 맵: { [code]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 고객 입력 정보
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 수량 조절
  const handleUpdateQty = (code: string, delta: number) => {
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

  // 선택된 품목 목록
  const selectedItems = useMemo(() => {
    return catalog
      .filter((item) => (quantities[item.code] || 0) > 0)
      .map((item) => {
        const qty = quantities[item.code];
        const price = item.discountPrice > 0 ? item.discountPrice : item.unitPrice;
        return {
          ...item,
          quantity: qty,
          amount: price * qty,
        };
      });
  }, [catalog, quantities]);

  // 금액 계산
  const supplyAmount = useMemo(() => {
    return selectedItems.reduce((acc, cur) => acc + cur.amount, 0);
  }, [selectedItems]);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;
  const totalQuantity = useMemo(() => {
    return selectedItems.reduce((acc, cur) => acc + cur.quantity, 0);
  }, [selectedItems]);

  // 견적서 발행 실행
  const handleSubmitEstimate = async () => {
    if (!customerName.trim()) {
      alert("고객명을 입력해 주세요.");
      return;
    }
    if (!customerPhone.trim()) {
      alert("연락 가능한 휴대전화번호를 입력해 주세요.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("견적 품목을 1개 이상 선택해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const fullNotes = [
        notes ? `요청: ${notes}` : "",
        preferredDate ? `희망일정: ${preferredDate}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const res = await apiFetch("/api/user/estimate/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userKey,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          validDays: businessInfo.defaultValidDays || 14,
          notes: fullNotes,
          items: selectedItems,
          source: "SELF_ESTIMATE",
        }),
      });

      const data = await res.json();
      if (data.success && data.estimateId) {
        // 즉시 정식 전자 견적서 뷰어로 이동
        router.push(`/estimate/view/${data.estimateId}`);
      } else {
        alert(data.error || "견적서 발행 중 오류가 발생했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCatalog = activeCategory === "전체"
    ? catalog
    : catalog.filter((item) => item.category === activeCategory);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-36">
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {merchant.imageUrl ? (
              <img
                src={merchant.imageUrl}
                alt={merchant.businessName}
                className="w-8 h-8 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                {merchant.businessName.slice(0, 1)}
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">{merchant.businessName}</h1>
              <p className="text-[11px] text-slate-500">실시간 모바일 간편 견적</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  navigator.clipboard.writeText(window.location.href);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 text-xs font-semibold flex items-center gap-1"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
            </button>
            {merchant.phone && (
              <a
                href={`tel:${merchant.phone}`}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5" /> 문의
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 안내 배너 */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white shadow-sm">
          <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-bold mb-1">
            <Sparkles className="w-3.5 h-3.5" /> 비대면 셀프 견적 산출
          </div>
          <h2 className="text-base font-extrabold tracking-tight">
            원하시는 품목을 담아 즉시 견적서를 확인해 보세요
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            구글 시트 단가표를 기반으로 정식 전자 견적서(직인 날인, 인쇄/PDF 가능)가 0초 만에 무료 발행됩니다.
          </p>
        </div>
      </div>

      {/* 카테고리 탭 바 */}
      {categories.length > 1 && (
        <div className="sticky top-[57px] z-30 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200/80 mt-3">
          <div className="max-w-2xl mx-auto px-4 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 품목 리스트 */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {filteredCatalog.map((item) => {
          const qty = quantities[item.code] || 0;
          const price = item.discountPrice > 0 ? item.discountPrice : item.unitPrice;
          const hasDiscount = item.discountPrice > 0 && item.discountPrice < item.unitPrice;

          return (
            <div
              key={item.code}
              className={`p-4 rounded-2xl border transition-all bg-white ${
                qty > 0 ? "border-indigo-500 shadow-sm" : "border-slate-200"
              }`}
            >
              <div className="flex gap-3">
                {/* 썸네일 사진 */}
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="w-20 h-20 rounded-xl object-cover border border-slate-100 shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">{item.spec || "1식"}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{item.description}</p>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      {hasDiscount && (
                        <span className="text-[11px] text-slate-400 line-through mr-1.5 font-mono">
                          {item.unitPrice.toLocaleString()}원
                        </span>
                      )}
                      <span className="text-sm font-extrabold text-indigo-700 font-mono">
                        {price.toLocaleString()}원
                      </span>
                    </div>

                    {/* 수량 조작 버튼 */}
                    {qty === 0 ? (
                      <button
                        onClick={() => handleUpdateQty(item.code, 1)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> 담기
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                        <button
                          onClick={() => handleUpdateQty(item.code, -1)}
                          className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-slate-50 active:scale-95 text-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs text-indigo-700">{qty}</span>
                        <button
                          onClick={() => handleUpdateQty(item.code, 1)}
                          className="w-6 h-6 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-slate-50 active:scale-95 text-slate-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 견적 신청 고객 정보 입력 카드 */}
        {selectedItems.length > 0 && (
          <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <FileText className="w-4 h-4 text-indigo-600" /> 견적서 발급 정보 입력
            </h3>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">성함 / 상호 *</label>
                  <input
                    type="text"
                    placeholder="홍길동"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">휴대전화번호 *</label>
                  <input
                    type="tel"
                    placeholder="010-0000-0000"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">시공 / 납품지 주소 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 서울시 서초구 반포대로 10"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">시공 / 방문 희망일정 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 다음 주 화요일 오후 2시경"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">추가 요청사항</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {QUICK_REQUEST_NOTES.map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setNotes((prev) => (prev ? `${prev}, ${quick}` : quick))}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px]"
                    >
                      + {quick}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  placeholder="현장 특이사항이나 문의사항을 자유롭게 입력해 주세요."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* 사업자 정보 및 견적 조건 */}
        <div className="p-4 rounded-2xl bg-slate-100/80 border border-slate-200 text-[11px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">{businessInfo.companyName || merchant.businessName}</p>
          {businessInfo.bizNumber && <p>사업자등록번호: {businessInfo.bizNumber}</p>}
          {businessInfo.address && <p>소재지: {businessInfo.address}</p>}
          <p>고객센터: {businessInfo.phone || merchant.phone || "문의"}</p>
          <p className="text-slate-400 pt-1">
            • 본 견적서는 전자 방식으로 즉시 발행되며, 인쇄 및 PDF 저장을 지원합니다.
          </p>
        </div>
      </main>

      {/* 하단 고정 금액 합계 및 견적서 발행 바 */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 sm:p-4 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <span>총 {totalQuantity}개 품목 선택</span>
              <span>•</span>
              <span>VAT 10% 포함</span>
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-slate-900 font-mono">
              ₩{totalAmount.toLocaleString()}
              <span className="text-xs font-normal text-slate-500 ml-1">원</span>
            </div>
          </div>

          <button
            onClick={handleSubmitEstimate}
            disabled={submitting || selectedItems.length === 0}
            className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                발행 중...
              </>
            ) : (
              <>
                <span>실시간 전자 견적서 발행</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
