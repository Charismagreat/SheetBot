"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calculator,
  CheckCircle,
  Phone,
  ShoppingCart,
  Plus,
  Minus,
  Sparkles,
  Calendar,
  MapPin,
  FileText,
  X,
  ArrowRight,
} from "lucide-react";

interface CatalogItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  discountPrice: number;
  optionType: string;
  note: string;
}

interface MerchantInfo {
  businessName: string;
  phone: string;
  email: string;
}

export default function OrderClientPage({ userKey: propUserKey }: { userKey?: string }) {
  const params = useParams();
  const router = useRouter();
  const userKey = propUserKey || (params?.userKey as string) || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<MerchantInfo>({
    businessName: "스마트 견적 & 주문 센터",
    phone: "",
    email: "",
  });
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // 품목별 선택 수량: { [code]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 주문 접수 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 주문 완료 상태
  const [orderResult, setOrderResult] = useState<any>(null);

  // 1. 단가표 및 사장님 정보 로드
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/quote/catalog?userKey=${encodeURIComponent(userKey)}`);
        const data = await res.json();
        if (data.success) {
          setCatalog(data.catalog || []);
          setCategories(data.categories || []);
          if (data.merchant) {
            setMerchant(data.merchant);
          }
        } else {
          setError(data.error || "단가표를 불러올 수 없습니다.");
        }
      } catch (err: any) {
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    if (userKey) {
      loadCatalog();
    }
  }, [userKey]);

  // 2. 수량 증감 핸들러
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

  // 상호명 표시 안전화 (이메일 아이디 노출 원천 차단)
  const displayBusinessName = useMemo(() => {
    const raw = merchant.businessName?.trim();
    const emailPrefix = merchant.email?.split("@")[0]?.toLowerCase();
    if (!raw || (emailPrefix && raw.toLowerCase() === emailPrefix)) {
      return "스마트 견적 & 주문 센터";
    }
    return raw;
  }, [merchant.businessName, merchant.email]);

  // 4. 필터링된 카탈로그 목록
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
      alert("선택된 품목이 없습니다.");
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
        setIsModalOpen(false);
      } else {
        alert(data.error || "주문 접수에 실패했습니다.");
      }
    } catch (err: any) {
      alert("주문 처리 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-sm font-medium text-slate-400">실시간 단가표 및 견적기를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <X className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">견적기를 열 수 없습니다</h2>
        <p className="text-slate-400 text-sm max-w-sm mb-6">{error}</p>
      </div>
    );
  }

  // 주문 완료 화면
  if (orderResult) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12" />
          </div>
          <span className="inline-block px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold mb-2">
            접수 완료 • 구글 시트 실시간 연동
          </span>
          <h1 className="text-2xl font-bold text-white mb-2">주문 및 견적 신청 완료</h1>
          <p className="text-slate-400 text-sm mb-6">
            <strong className="text-slate-200">{orderResult.customerName}</strong>님, 요청하신 견적과 주문이 사장님께 실시간 전달되었습니다.
          </p>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 text-left space-y-2.5 mb-6 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>접수 번호</span>
              <span className="font-mono text-slate-200 font-semibold">{orderResult.orderId}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>담당 업체</span>
              <span className="text-slate-200 font-medium">{displayBusinessName}</span>
            </div>
            {orderResult.preferredDate && (
              <div className="flex justify-between text-slate-400">
                <span>희망 일시</span>
                <span className="text-slate-200">{orderResult.preferredDate}</span>
              </div>
            )}
            <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
              <span className="font-medium text-slate-300">총 예상 견적 (VAT포함)</span>
              <span className="text-lg font-bold text-emerald-400">
                {orderResult.totalAmount.toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={orderResult.viewUrl}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
            >
              <FileText className="w-5 h-5" />
              공식 디지털 견적서 확인하기
            </a>
            {merchant.phone && (
              <a
                href={`tel:${merchant.phone}`}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium flex items-center justify-center gap-2 transition"
              >
                <Phone className="w-4 h-4 text-slate-400" />
                업체로 직접 전화 문의 ({merchant.phone})
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-36">
      {/* 1. 상단 브랜드 헤더 */}
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">{displayBusinessName}</h1>
              <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                실시간 셀프 견적 & 간편 주문
              </p>
            </div>
          </div>
          {merchant.phone && (
            <a
              href={`tel:${merchant.phone}`}
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
              전체 보기 ({catalog.length})
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

      {/* 3. 메인 상품 카탈로그 카드 리스트 */}
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-3.5">
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-white font-semibold">장바구니 담듯 수량을 선택해 보세요!</strong>
            <p className="text-slate-400 mt-0.5">
              원하시는 품목의 <span className="text-emerald-400 font-semibold">[+] 버튼</span>을 누르면 견적 금액이 실시간으로 자동 계산됩니다.
            </p>
          </div>
        </div>

        {filteredCatalog.map((item) => {
          const qty = quantities[item.code] || 0;
          const isSelected = qty > 0;
          const isDiscounted = item.discountPrice > 0 && item.discountPrice < item.unitPrice;
          const price = isDiscounted ? item.discountPrice : item.unitPrice;

          return (
            <div
              key={item.code}
              className={`p-4 rounded-2xl border transition-all ${
                isSelected
                  ? "bg-slate-900/90 border-emerald-500/60 shadow-lg shadow-emerald-950/30"
                  : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-semibold text-slate-400">
                      {item.category}
                    </span>
                    {item.optionType === "옵션" && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px] font-semibold border border-purple-500/20">
                        선택옵션
                      </span>
                    )}
                    {isDiscounted && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px] font-bold">
                        할인특가
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white tracking-tight">{item.name}</h3>
                  {item.note && <p className="text-xs text-slate-400">{item.note}</p>}
                  <p className="text-xs text-slate-500">기준: {item.spec}</p>
                </div>

                {/* 가격 정보 */}
                <div className="text-right shrink-0">
                  {isDiscounted && (
                    <div className="text-xs text-slate-500 line-through">
                      {item.unitPrice.toLocaleString()}원
                    </div>
                  )}
                  <div className="text-base font-extrabold text-emerald-400">
                    {price.toLocaleString()}원
                  </div>
                </div>
              </div>

              {/* 하단 수량 컨트롤러 */}
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  {isSelected ? (
                    <span className="text-emerald-400 font-semibold">
                      소계: {(price * qty).toLocaleString()}원
                    </span>
                  ) : (
                    "수량 선택"
                  )}
                </span>

                <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl p-1">
                  <button
                    onClick={() => handleQuantityChange(item.code, -1)}
                    disabled={qty === 0}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                      qty > 0
                        ? "bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95"
                        : "text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-7 text-center font-bold text-sm text-white font-mono">{qty}</span>
                  <button
                    onClick={() => handleQuantityChange(item.code, 1)}
                    className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* 4. 하단 고정 실시간 견적 플로팅 바 */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-4 shadow-2xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>선택 품목:</span>
              <strong className="text-white font-bold">{totalItemCount}개</strong>
              <span className="text-slate-600">|</span>
              <span>VAT 10% 포함</span>
            </div>
            <div className="text-xl font-extrabold text-emerald-400 tracking-tight">
              {totalAmount.toLocaleString()}
              <span className="text-xs font-semibold text-slate-300 ml-1">원</span>
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
            <span>예약/주문 신청하기</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 5. 간편 주문/예약 신청 모달 (바텀 시트) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div>
                <h2 className="text-lg font-bold text-white">견적 확정 및 예약/주문 신청</h2>
                <p className="text-xs text-slate-400 mt-0.5">사장님의 구글 시트로 실시간 안전하게 접수됩니다.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 선택 내역 요약 박스 */}
            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 mb-5 space-y-2 text-xs">
              <span className="text-slate-400 font-semibold block mb-1">선택하신 견적 내역 ({totalItemCount}건)</span>
              {selectedItems.map((it) => (
                <div key={it.code} className="flex justify-between text-slate-300">
                  <span>
                    {it.name} × {it.quantity}{it.spec}
                  </span>
                  <span className="font-mono">{it.amount.toLocaleString()}원</span>
                </div>
              ))}
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm text-white">
                <span>총 견적 합계 (VAT 포함)</span>
                <span className="text-emerald-400">{totalAmount.toLocaleString()}원</span>
              </div>
            </div>

            {/* 주문자 정보 입력 폼 */}
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  고객 성함 <span className="text-rose-400">*</span>
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
                  서비스 방문지 주소 (또는 설치 주소)
                </label>
                <input
                  type="text"
                  placeholder="예: 서울 강남구 테헤란로 123 101동 202호"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  희망 방문/시공 일시
                </label>
                <input
                  type="text"
                  placeholder="예: 10월 5일 오후 2시 이후"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">요청사항 및 메모</label>
                <textarea
                  rows={2}
                  placeholder="현장 특이사항이나 추가 문의사항을 적어주세요."
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
                      <span>구글 시트 접수 처리 중...</span>
                    </>
                  ) : (
                    <span>이 견적으로 주문 및 예약 확정 접수</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
