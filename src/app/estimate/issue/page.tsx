"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Minus,
  Trash2,
  Calendar,
  User,
  Phone,
  MapPin,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
  Sparkles,
  HelpCircle,
  Building2,
  RotateCcw,
} from "lucide-react";

interface CatalogItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  discountPrice: number;
  description?: string;
}

interface SelectedItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

export default function EstimateIssuePage() {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const [merchantName, setMerchantName] = useState<string>("스마트 견적센터");

  // 고객 입력 폼
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [validDays, setValidDays] = useState<number>(14);
  const [notes, setNotes] = useState("");

  // 선택된 견적 품목 목록
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // 발행 완료 결과 상태
  const [submitting, setSubmitting] = useState(false);
  const [issuedResult, setIssuedResult] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        const res = await apiFetch("/api/user/estimate/catalog");
        const data = await res.json();
        if (data.success) {
          setCatalog(data.catalog || []);
          setCategories(data.categories || ["전체"]);
          if (data.merchant?.businessName) {
            setMerchantName(data.merchant.businessName);
          }
          if (data.businessInfo?.defaultValidDays) {
            setValidDays(data.businessInfo.defaultValidDays);
          }
        }
      } catch (err: any) {
        console.warn("[EstimateIssuePage] Load catalog failed:", err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  // 단가표에서 품목 추가
  const handleAddItem = (item: CatalogItem) => {
    const existingIndex = selectedItems.findIndex((i) => i.code === item.code);
    const price = item.discountPrice > 0 ? item.discountPrice : item.unitPrice;

    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      updated[existingIndex].amount = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
      setSelectedItems(updated);
    } else {
      setSelectedItems([
        ...selectedItems,
        {
          code: item.code,
          category: item.category,
          name: item.name,
          spec: item.spec,
          unitPrice: price,
          quantity: 1,
          amount: price,
        },
      ]);
    }
  };

  // 수량 조절
  const handleUpdateQty = (index: number, delta: number) => {
    const updated = [...selectedItems];
    const newQty = updated[index].quantity + delta;
    if (newQty <= 0) {
      handleRemoveItem(index);
    } else {
      updated[index].quantity = newQty;
      updated[index].amount = newQty * updated[index].unitPrice;
      setSelectedItems(updated);
    }
  };

  // 단가 직접 변경
  const handleUpdatePrice = (index: number, newPrice: number) => {
    const updated = [...selectedItems];
    updated[index].unitPrice = Math.max(0, newPrice);
    updated[index].amount = updated[index].quantity * updated[index].unitPrice;
    setSelectedItems(updated);
  };

  // 품목 삭제
  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  // 실시간 합계 계산
  const supplyAmount = selectedItems.reduce((acc, cur) => acc + cur.amount, 0);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  // 견적서 즉시 발행
  const handleIssueEstimate = async () => {
    if (!customerName.trim()) {
      alert("고객명을 입력해 주세요.");
      return;
    }
    if (!customerPhone.trim()) {
      alert("고객 휴대전화번호를 입력해 주세요.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("견적에 포함할 품목을 1개 이상 추가해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/user/estimate/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          validDays: Number(validDays) || 14,
          notes: notes.trim(),
          items: selectedItems,
          source: "DIRECT_ISSUE",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIssuedResult(data);
      } else {
        alert(data.error || "견적서 발행 중 오류가 발생했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  // 안내 문자 텍스트
  const getSmsGuideText = () => {
    if (!issuedResult) return "";
    return `[${merchantName}] ${issuedResult.customerName}님, 요청하신 전자 견적서가 발행되었습니다.\n\n▶ 견적 확인 및 승인하기:\n${issuedResult.viewUrl}\n\n문의사항은 언제든 편하게 연락 주시기 바랍니다.`;
  };

  // 필터된 카탈로그
  const filteredCatalog = activeCategory === "전체"
    ? catalog
    : catalog.filter((item) => item.category === activeCategory);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 상단 타이틀 배너 */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 mb-2">
                <Sparkles className="w-3.5 h-3.5" /> 0초 구글 시트 실시간 연동
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                스마트 간편 견적서 발행
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                품목과 수량을 터치하여 30초 만에 공인 전자 견적서를 발행하고 고객에게 문자로 전송합니다.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">발행 공급자</span>
              <span className="text-base sm:text-lg font-bold text-amber-300">{merchantName}</span>
            </div>
          </div>
        </div>

        {/* 메인 2단 레이아웃: 좌측(품목 선택) vs 우측(고객 정보 & 견적서 미리보기) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 좌측: 단가표 품목 선택기 (7열) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  단가표 품목 선택
                </h2>
                <span className="text-xs text-slate-400">구글 시트 '단가표' 탭 실시간 반영</span>
              </div>

              {/* 카테고리 탭 */}
              {categories.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        activeCategory === cat
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* 품목 리스트 */}
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  단가표를 불러오는 중...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  등록된 단가표 품목이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {filteredCatalog.map((item) => {
                    const price = item.discountPrice > 0 ? item.discountPrice : item.unitPrice;
                    const isAdded = selectedItems.some((i) => i.code === item.code);

                    return (
                      <div
                        key={item.code}
                        onClick={() => handleAddItem(item)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isAdded
                            ? "border-indigo-500 bg-indigo-50/40 shadow-sm"
                            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50/60"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {item.category}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{item.spec || "1식"}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{item.name}</h3>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{item.description}</p>
                          )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-indigo-700 font-mono">
                            {price.toLocaleString()}원
                          </span>
                          <span className="text-xs font-bold text-indigo-600 inline-flex items-center gap-0.5">
                            <Plus className="w-3.5 h-3.5" /> 추가
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 고객 정보 & 선택 품목 견적서 발행기 (5열) */}
          <div className="lg:col-span-5 space-y-4">
            {/* 고객 정보 입력 카드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-indigo-600" /> 공급받는 자 (고객 정보)
              </h2>

              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">고객명 / 상호 *</label>
                  <input
                    type="text"
                    placeholder="예: 홍길동 (또는 주식회사 OO)"
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

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">시공 / 납품지 주소 (선택)</label>
                  <input
                    type="text"
                    placeholder="예: 서울시 서초구 반포대로 10, 3층"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">견적 유효기간</label>
                    <select
                      value={validDays}
                      onChange={(e) => setValidDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 bg-white"
                    >
                      <option value={7}>발행일로부터 7일</option>
                      <option value={14}>발행일로부터 14일</option>
                      <option value={30}>발행일로부터 30일</option>
                      <option value={60}>발행일로부터 60일</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">특약 / 비고</label>
                    <input
                      type="text"
                      placeholder="특약 메모"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 견적 명세 및 발행 실행 카드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" /> 견적 품목 명세 ({selectedItems.length}건)
                </h2>
                {selectedItems.length > 0 && (
                  <button
                    onClick={() => setSelectedItems([])}
                    className="text-xs text-rose-500 hover:underline flex items-center gap-0.5"
                  >
                    <RotateCcw className="w-3 h-3" /> 초기화
                  </button>
                )}
              </div>

              {selectedItems.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  좌측 단가표에서 품목을 선택해 주세요.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {selectedItems.map((item, idx) => (
                    <div
                      key={item.code}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{item.name}</span>
                        <div className="flex items-center gap-2 text-slate-500 mt-0.5">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => handleUpdatePrice(idx, parseInt(e.target.value, 10) || 0)}
                            className="w-20 px-1.5 py-0.5 rounded border border-slate-300 font-mono text-right"
                          />
                          <span>원 × {item.quantity}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleUpdateQty(idx, -1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-slate-800">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateQty(idx, 1)}
                          className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-rose-500 ml-1 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 금액 집계표 */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>공급가액:</span>
                  <span className="font-mono font-semibold">{supplyAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span>부가가치세 (10%):</span>
                  <span className="font-mono font-semibold">{vatAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between items-center text-sm font-extrabold text-slate-900 pt-1 border-t border-slate-100">
                  <span>총 견적금액:</span>
                  <span className="text-base text-indigo-700 font-mono">
                    ₩{totalAmount.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 발행 실행 버튼 */}
              <button
                onClick={handleIssueEstimate}
                disabled={submitting || selectedItems.length === 0}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-300 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    시트 기록 및 견적서 발행 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    전자 견적서 즉시 발행하기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 견적서 발행 완료 모달 */}
      {issuedResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">
                전자 견적서가 발행되었습니다!
              </h3>
              <p className="text-xs text-slate-500">
                구글 시트 '견적발행대장'에 실시간 기록되었으며 정식 링크가 생성되었습니다.
              </p>
            </div>

            {/* 견적 기본 정보 요약 박스 */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">견적번호:</span>
                <span className="font-mono font-bold text-slate-800">{issuedResult.estimateId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">고객명:</span>
                <span className="font-bold text-slate-800">{issuedResult.customerName} ({issuedResult.customerPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">총 견적금액:</span>
                <span className="font-bold text-indigo-700 font-mono text-sm">
                  {issuedResult.totalAmount.toLocaleString()}원 (VAT 포함)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">견적 유효기간:</span>
                <span className="font-bold text-slate-800">{issuedResult.validUntil}까지</span>
              </div>
            </div>

            {/* 안내 문자 미리보기 및 원터치 복사 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>고객 발송용 안내 문자:</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(getSmsGuideText());
                    setCopiedText(true);
                    setTimeout(() => setCopiedText(false), 2000);
                  }}
                  className="text-indigo-600 hover:underline flex items-center gap-1 font-bold"
                >
                  <Copy className="w-3 h-3" /> {copiedText ? "복사됨!" : "문구 복사"}
                </button>
              </div>
              <textarea
                readOnly
                rows={4}
                value={getSmsGuideText()}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 font-sans resize-none focus:outline-none"
              />
            </div>

            {/* 버튼 그룹 */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(issuedResult.viewUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedLink ? "링크 복사됨!" : "견적서 링크 복사"}
              </button>

              <a
                href={issuedResult.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all text-center"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                견적서 직접 보기
              </a>
            </div>

            <button
              onClick={() => {
                setIssuedResult(null);
                setSelectedItems([]);
                setCustomerName("");
                setCustomerPhone("");
                setCustomerAddress("");
                setNotes("");
              }}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 font-bold text-xs"
            >
              닫기 및 새 견적서 작성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
