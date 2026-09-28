"use client";

import { apiFetch } from '@/lib/api';
import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Sparkles,
  Plus,
  Minus,
  Check,
  ArrowRight,
  Calculator,
  Store,
  HelpCircle,
} from "lucide-react";

interface CatalogItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  discountPrice?: number;
  optionType: string;
  note?: string;
}

export default function QuoteSelectPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = String(params?.quoteId || "");

  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const [customerName, setCustomerName] = useState<string>("고객님");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [inquiryText, setInquiryText] = useState<string>("");

  // 품목별 선택 수량 맵: { [code]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/quote/catalog?quoteId=${encodeURIComponent(quoteId)}`);
        const data = await res.json();

        if (data.success) {
          setCatalog(data.catalog || []);
          setCategories(data.categories || []);
          if (data.customerName) setCustomerName(data.customerName);
          if (data.customerPhone) setCustomerPhone(data.customerPhone);
          if (data.inquiryText) setInquiryText(data.inquiryText);

          // 기본 첫 번째 메인 품목 1개 기본 선택
          const initialQuantities: Record<string, number> = {};
          if (data.catalog && data.catalog.length > 0) {
            initialQuantities[data.catalog[0].code] = 1;
          }
          setQuantities(initialQuantities);
        }
      } catch (err: any) {
        console.warn("[QuoteSelect] Catalog load failed:", err.message);
      } finally {
        setLoading(false);
      }
    }

    loadCatalog();
  }, [quoteId]);

  // 수량 증감 핸들러
  const handleQuantityChange = (code: string, delta: number) => {
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

  // 옵션 단일 토글 (0 <-> 1)
  const handleToggleOption = (code: string) => {
    setQuantities((prev) => {
      const current = prev[code] || 0;
      const updated = { ...prev };
      if (current > 0) {
        delete updated[code];
      } else {
        updated[code] = 1;
      }
      return updated;
    });
  };

  // 필터링된 품목 목록
  const filteredCatalog = useMemo(() => {
    if (activeCategory === "전체") return catalog;
    return catalog.filter((item) => item.category === activeCategory);
  }, [catalog, activeCategory]);

  // 선택된 품목 리스트 및 합계 계산
  const selectedItems = useMemo(() => {
    return Object.entries(quantities)
      .map(([code, qty]) => {
        const item = catalog.find((c) => c.code === code);
        if (!item || qty <= 0) return null;
        return {
          code: item.code,
          category: item.category,
          name: item.name,
          spec: item.spec,
          unitPrice: item.unitPrice,
          quantity: qty,
          amount: item.unitPrice * qty,
        };
      })
      .filter(Boolean) as any[];
  }, [catalog, quantities]);

  const supplyAmount = useMemo(() => {
    return selectedItems.reduce((acc, cur) => acc + cur.amount, 0);
  }, [selectedItems]);

  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;
  const totalCount = selectedItems.reduce((acc, cur) => acc + cur.quantity, 0);

  // 최종 견적서 생성 및 이동
  const handleSubmitQuote = async () => {
    if (selectedItems.length === 0) {
      alert("최소 1개 이상의 품목을 선택해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/user/quote/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          customerName,
          customerPhone,
          inquiryText,
          items: selectedItems,
          autoAppendSheet: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.quoteId) {
        // 정식 견적서 뷰어로 이동
        router.push(`/q/${data.quoteId}`);
      } else {
        alert("견적서 생성 중 오류가 발생했습니다: " + (data.error || "다시 시도해 주세요."));
      }
    } catch (err: any) {
      alert("네트워크 오류가 발생했습니다: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium text-sm">실시간 단가표 및 선택 폼을 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-28 pt-4 px-3 sm:px-6 flex flex-col items-center justify-start text-slate-100">
      <div className="w-full max-w-xl">
        {/* 상단 헤더 */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 mb-4 backdrop-blur-md shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Calculator className="w-3.5 h-3.5" />
              10초 스마트 셀프 견적기
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-1.5">
            {customerName} 맞춤 견적 선택
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            문의하신 서비스의 모델과 수량을 터치하시면 실시간 총액이 자동 계산되며, 공식 견적서가 즉시 발급됩니다.
          </p>

          {inquiryText && (
            <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-start gap-2 text-xs text-slate-400">
              <HelpCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span className="line-clamp-2">
                고객 문의: <strong className="text-slate-200">"{inquiryText}"</strong>
              </span>
            </div>
          )}
        </div>

        {/* 카테고리 칩 필터 */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-3 scrollbar-none">
            <button
              onClick={() => setActiveCategory("전체")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                activeCategory === "전체"
                  ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
              }`}
            >
              전체 보기
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                  activeCategory === cat
                    ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* 품목 선택 카드 리스트 */}
        <div className="space-y-3">
          {filteredCatalog.map((item) => {
            const qty = quantities[item.code] || 0;
            const isSelected = qty > 0;
            const isOption = item.optionType === "옵션" || item.category === "추가 옵션";

            return (
              <div
                key={item.code}
                className={`p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? "bg-slate-900/90 border-teal-500/60 shadow-lg shadow-teal-950/40"
                    : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-bold text-sm text-white">
                        {item.name}
                      </span>
                      {isOption && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                          추가옵션
                        </span>
                      )}
                    </div>
                    {item.note && (
                      <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                        {item.note}
                      </p>
                    )}
                    <div className="flex items-baseline gap-1 text-sm font-extrabold text-teal-400">
                      {item.unitPrice === 0 ? (
                        <span className="text-emerald-400 font-bold text-xs bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          무료 서비스
                        </span>
                      ) : (
                        <>
                          <span>{item.unitPrice.toLocaleString()}</span>
                          <span className="text-xs font-semibold text-slate-400">원 / {item.spec}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 수량 조절 버튼 영역 */}
                  <div className="flex items-center gap-2 shrink-0 self-center">
                    {isOption && item.unitPrice === 0 ? (
                      <button
                        onClick={() => handleToggleOption(item.code)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                          isSelected
                            ? "bg-emerald-500 text-slate-950 border-emerald-400"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {isSelected ? "선택됨 ✓" : "+ 선택"}
                      </button>
                    ) : (
                      <div className="flex items-center bg-slate-800/90 rounded-xl border border-slate-700 p-0.5">
                        <button
                          onClick={() => handleQuantityChange(item.code, -1)}
                          disabled={qty === 0}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-white">
                          {qty}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(item.code, 1)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-teal-600 hover:text-white transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 고정 실시간 합계 바 (Sticky Footer) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 border-t border-slate-800 p-3 sm:p-4 backdrop-blur-lg flex justify-center">
        <div className="w-full max-w-xl flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span>선택 품목 <strong className="text-teal-400">{totalCount}건</strong></span>
              <span>•</span>
              <span>VAT 10% 포함</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white flex items-baseline">
              <span className="text-teal-400">{totalAmount.toLocaleString()}</span>
              <span className="text-sm font-bold text-slate-400 ml-1">원</span>
            </div>
          </div>

          <button
            onClick={handleSubmitQuote}
            disabled={submitting || selectedItems.length === 0}
            className="flex-1 max-w-[240px] py-3.5 px-4 bg-teal-500 hover:bg-teal-400 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black rounded-2xl shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 text-sm transition-all"
          >
            {submitting ? (
              <span className="animate-spin w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full" />
            ) : (
              <>
                <span>맞춤 견적서 발급</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
