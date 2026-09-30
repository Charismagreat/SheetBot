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
} from "lucide-react";

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

// 이미지 URL 상대경로 정규화 (터널/도메인/로컬 환경 무관 100% 로드 보장)
function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/user\/quote\/image\?file=[^&]+/);
  if (match) {
    return match[0];
  }
  return url;
}

export default function OrderClientPage({ userKey: propUserKey }: { userKey?: string }) {
  const params = useParams();
  const router = useRouter();
  const userKey = propUserKey || (params?.userKey as string) || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<MerchantInfo>({
    businessName: "스마트 간편 주문 센터",
    phone: "",
    email: "",
    imageUrl: "",
  });
  const [logoError, setLogoError] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({});
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
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

  // 1. 단가표(품목 목록), 상호 및 시트 사업자정보 로드
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
          if (data.businessInfo) {
            setBusinessInfo(data.businessInfo);
          }
        } else {
          setError(data.error || "품목 정보를 불러올 수 없습니다.");
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

  // 상호명 표시 안전화 (시트 사업자정보 1순위 반영, 이메일 노출 방지)
  const displayBusinessName = useMemo(() => {
    if (businessInfo.companyName && businessInfo.companyName.trim()) {
      return businessInfo.companyName.trim();
    }
    const raw = merchant.businessName?.trim();
    const emailPrefix = merchant.email?.split("@")[0]?.toLowerCase();
    if (!raw || (emailPrefix && raw.toLowerCase() === emailPrefix)) {
      return "스마트 간편 주문 센터";
    }
    return raw;
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
      ...orderResult.items.map(
        (it: any) => `• ${it.name} (${it.quantity}${it.spec}) - ${it.amount.toLocaleString()}원`
      ),
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
        <p className="text-sm font-medium text-slate-400">실시간 품목 및 주문 정보를 불러오는 중...</p>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-36">
      {/* 1. 상단 브랜드 헤더 */}
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {merchant.imageUrl && merchant.imageUrl !== "https://sheetbot.cloud/favicon.svg" && !logoError ? (
              <img
                src={normalizeImageUrl(merchant.imageUrl) || merchant.imageUrl}
                alt={displayBusinessName}
                onError={() => setLogoError(true)}
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
                    {it.name} × {it.quantity}{it.spec}
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
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  희망 수령 / 방문 일시
                </label>
                <input
                  type="text"
                  placeholder="예: 10월 5일 오후 2시 이후 / 빠른 배송"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">배송/주문 요청사항</label>
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
