"use client";

import { apiFetch } from "@/lib/api";
import React, { useState } from "react";
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
  Building2,
  RotateCcw,
} from "lucide-react";
import type { EstimateCatalogResult, EstimateCatalogItem } from "@/lib/estimate-catalog-helper";

interface SelectedItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

interface Props {
  userKey: string;
  initialData: EstimateCatalogResult;
}

export default function EstimateIssueClientPage({ userKey, initialData }: Props) {
  const [catalog] = useState<EstimateCatalogItem[]>(initialData.catalog || []);
  const [categories] = useState<string[]>(initialData.categories || ["전체"]);
  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const [merchantName] = useState<string>(initialData.merchant?.businessName || "스마트 견적센터");
  const [isKakaoTalk, setIsKakaoTalk] = useState(false);

  // 🚀 [카카오톡 인앱 브라우저 대응] 카카오톡 감지 시 스마트폰 기본 브라우저(크롬/삼성인터넷/사파리)로 자동 전환
  React.useEffect(() => {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      if (/KAKAOTALK/i.test(ua)) {
        setIsKakaoTalk(true);
        // 카카오톡 외부 브라우저 호출 스킴 실행 (0.05초)
        const targetUrl = window.location.href;
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`;
      }
    }
  }, []);

  // 고객 입력 폼
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [validDays, setValidDays] = useState<number>(initialData.businessInfo?.defaultValidDays || 14);
  const [notes, setNotes] = useState("");

  // 선택된 견적 품목 목록
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  // 발행 완료 결과 상태
  const [submitting, setSubmitting] = useState(false);
  const [issuedResult, setIssuedResult] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // 단가표에서 품목 추가
  const handleAddItem = (item: EstimateCatalogItem) => {
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

  // 품목 제거
  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  // 공급가액, 부가세, 합계금액 자동 계산
  const supplyAmount = selectedItems.reduce((acc, cur) => acc + cur.amount, 0);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  // 견적서 즉시 발행 제출
  const handleIssueEstimate = async () => {
    if (!customerName.trim()) {
      alert("고객명(상호)을 입력해 주세요.");
      return;
    }
    if (!customerPhone.trim()) {
      alert("고객 휴대전화번호를 입력해 주세요.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("최소 1개 이상의 견적 품목을 선택해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/user/estimate/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userKey,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          validDays,
          notes: notes.trim(),
          items: selectedItems,
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
        {/* 카카오톡 인앱 브라우저 감지 시 외부 브라우저(Chrome/Safari) 열기 안내 배너 */}
        {isKakaoTalk && (
          <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🌐</span>
              <div className="text-xs sm:text-sm">
                <span className="font-bold">원활한 견적서 발행 및 파일 저장을 위해</span>
                <span className="block opacity-90 text-[11px] sm:text-xs">스마트폰 기본 브라우저(크롬/삼성인터넷/사파리)로 이용해 주세요.</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-white text-amber-700 font-extrabold text-xs whitespace-nowrap shadow-sm hover:bg-amber-50 active:scale-95 transition-all"
            >
              기본 브라우저로 열기
            </button>
          </div>
        )}

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
            <div className="flex flex-col sm:items-end">
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

              {/* 품목 리스트 (0초 즉시 렌더링 - 로딩 스피너 없음!) */}
              {filteredCatalog.length === 0 ? (
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
                          <span className={`text-xs px-2 py-0.5 rounded-lg font-bold flex items-center gap-0.5 ${
                            isAdded ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                          }`}>
                            <Plus className="w-3 h-3" /> 추가
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 고객 정보 입력 및 견적서 발행 요약 (5열) */}
          <div className="lg:col-span-5 space-y-4">
            {/* 1. 고객 정보 입력 카드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-600" />
                공급받는 자 (고객 정보)
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    고객명 / 상호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="예: 홍길동 (또는 주식회사 OO)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    휴대전화번호 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      placeholder="010-0000-0000"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    시공 / 납품지 주소 (선택)
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="예: 서울시 서초구 반포대로 10, 3층"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      견적 유효기간
                    </label>
                    <select
                      value={validDays}
                      onChange={(e) => setValidDays(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={7}>발행일로부터 7일</option>
                      <option value={14}>발행일로부터 14일</option>
                      <option value={30}>발행일로부터 30일</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      특약 / 비고
                    </label>
                    <input
                      type="text"
                      placeholder="특약 메모"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 선택된 품목 및 금액 합계 카드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  견적서 구성 품목 ({selectedItems.length}건)
                </h2>
                {selectedItems.length > 0 && (
                  <button
                    onClick={() => setSelectedItems([])}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold"
                  >
                    <RotateCcw className="w-3 h-3" /> 초기화
                  </button>
                )}
              </div>

              {selectedItems.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-xl">
                  좌측 단가표에서 품목을 터치하여 추가하세요.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {selectedItems.map((item, idx) => (
                    <div
                      key={item.code}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-indigo-600">[{item.category}]</span>
                          <h4 className="text-xs font-bold text-slate-900 truncate">{item.name}</h4>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {item.unitPrice.toLocaleString()}원 × {item.quantity}{item.spec}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 font-mono">
                          {item.amount.toLocaleString()}원
                        </span>
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                          <button
                            onClick={() => handleUpdateQty(idx, -1)}
                            className="p-1 hover:bg-slate-100 text-slate-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-bold font-mono">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateQty(idx, 1)}
                            className="p-1 hover:bg-slate-100 text-slate-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 금액 정산 요약 */}
              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>공급가액</span>
                  <span className="font-mono">{supplyAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>부가가치세 (10%)</span>
                  <span className="font-mono">{vatAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-indigo-900 pt-2 border-t border-slate-200">
                  <span>총 견적금액</span>
                  <span className="font-mono text-lg text-indigo-600">
                    {totalAmount.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 발행 버튼 */}
              <button
                disabled={submitting || selectedItems.length === 0}
                onClick={handleIssueEstimate}
                className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-extrabold shadow-md hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    공인 전자 견적서 발행 중...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    공인 전자 견적서 즉시 발행 (구글 시트 적재)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 3. 발행 완료 모달 / 결과 카드 */}
        {issuedResult && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  전자 견적서 발행 완료!
                </h3>
                <p className="text-xs text-slate-500">
                  구글 스프레드시트 <b>[견적발행대장]</b>에 안전하게 실시간 기록되었습니다.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">견적번호</span>
                  <span className="font-bold font-mono text-indigo-600">{issuedResult.estimateId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">고객명</span>
                  <span className="font-bold">{issuedResult.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">총 견적금액</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {issuedResult.totalAmount?.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 고객 발송용 링크 복사 & 문자 복사 */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    고객 열람 및 원터치 승인 전용 URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={issuedResult.viewUrl}
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-100 border border-slate-200 font-mono text-slate-600 truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(issuedResult.viewUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold flex items-center gap-1 hover:bg-slate-900"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedLink ? "복사됨!" : "링크 복사"}
                    </button>
                    <a
                      href={issuedResult.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700"
                      title="견적서 열기"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    고객 안내 문자 템플릿
                  </label>
                  <textarea
                    readOnly
                    rows={4}
                    value={getSmsGuideText()}
                    className="w-full p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 font-sans resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getSmsGuideText());
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 2000);
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedText ? "문자 텍스트 복사됨!" : "문자 내용 전체 복사"}
                    </button>
                    <a
                      href={`sms:${customerPhone}?body=${encodeURIComponent(getSmsGuideText())}`}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 flex items-center justify-center gap-1.5 text-center"
                    >
                      <Send className="w-3.5 h-3.5" />
                      문자 앱으로 열기
                    </a>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => {
                    setIssuedResult(null);
                    setSelectedItems([]);
                    setCustomerName("");
                    setCustomerPhone("");
                    setCustomerAddress("");
                    setNotes("");
                  }}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  새로운 견적서 계속 발행하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
