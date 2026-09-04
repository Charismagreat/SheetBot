"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Coins,
  CreditCard,
  Sparkles,
  Zap,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Flame,
  Clock,
  History,
  AlertCircle,
  ChevronRight,
  X,
  Lock,
  Loader2,
  Check,
  Smartphone,
} from "lucide-react";

interface UserWallet {
  balanceTokens: number;
  totalPurchasedTokens: number;
  totalUsedTokens: number;
  tier: string;
}

interface PaymentPackage {
  id: string;
  name: string;
  priceKrw: number;
  tokens: number;
  bonusTokens: number;
  totalTokens: number;
  tag?: string;
  isPopular?: boolean;
}

interface PaymentOrder {
  id: string;
  order_id: string;
  package_name: string;
  amount_krw: number;
  tokens_credited: number;
  payment_method: string;
  created_at: string;
}

const DEFAULT_PACKAGES: PaymentPackage[] = [
  {
    id: "pkg_starter",
    name: "Starter (체험형)",
    priceKrw: 5000,
    tokens: 50000,
    bonusTokens: 0,
    totalTokens: 50000,
    tag: "약 25회 생성 가능",
  },
  {
    id: "pkg_standard",
    name: "Standard (인기 추천)",
    priceKrw: 12000,
    tokens: 120000,
    bonusTokens: 30000,
    totalTokens: 150000,
    tag: "+25% 보너스 토큰",
    isPopular: true,
  },
  {
    id: "pkg_pro",
    name: "Pro Automation",
    priceKrw: 30000,
    tokens: 300000,
    bonusTokens: 150000,
    totalTokens: 450000,
    tag: "+50% 대용량 보너스",
  },
];

export default function PricingWalletPage() {
  const [wallet, setWallet] = useState<UserWallet>({
    balanceTokens: 20000,
    totalPurchasedTokens: 0,
    totalUsedTokens: 0,
    tier: "FREE",
  });
  const [packages, setPackages] = useState<PaymentPackage[]>(DEFAULT_PACKAGES);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("간편결제 (카카오/네이버/토스)");

  const fetchWallet = async () => {
    try {
      const res = await fetch("/api/wallet");
      const data = await res.json();
      if (data.success) {
        if (data.wallet) setWallet(data.wallet);
        if (data.packages && data.packages.length > 0) setPackages(data.packages);
        if (data.orders) setOrders(data.orders);
        setIsLoggedIn(!!data.isLoggedIn);
      }
    } catch (err) {
      console.error("지갑 정보 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  // PG 결제 시뮬레이터 모달 상태
  const [activeModalPackage, setActiveModalPackage] = useState<PaymentPackage | null>(null);
  const [modalStep, setModalStep] = useState<"select" | "processing" | "done">("select");
  const [pgAgency, setPgAgency] = useState("토스페이"); // 카카오페이, 네이버페이, 신용카드 등

  const openPaymentModal = (pkg: PaymentPackage) => {
    setActiveModalPackage(pkg);
    setModalStep("select");
    setPgAgency(selectedMethod.includes("간편") ? "토스페이" : "신용/체크카드");
  };

  const closePaymentModal = () => {
    if (modalStep === "processing") return;
    setActiveModalPackage(null);
    setModalStep("select");
  };

  const executeSimulatedPayment = async () => {
    if (!activeModalPackage) return;
    try {
      setModalStep("processing");
      // 1.5초간 실제 PG사 암호화 통신 및 카드사 승인 대기 시뮬레이션
      await new Promise((resolve) => setTimeout(resolve, 1600));

      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: activeModalPackage.id,
          paymentMethod: `${selectedMethod} (${pgAgency})`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setModalStep("done");
        await fetchWallet();
        setTimeout(() => {
          closePaymentModal();
          setPurchaseSuccess(data.message);
          setTimeout(() => setPurchaseSuccess(null), 5000);
        }, 1200);
      } else {
        alert(data.error || "결제 승인에 실패했습니다.");
        setModalStep("select");
      }
    } catch (err: any) {
      alert("결제 처리 중 오류 발생: " + err.message);
      setModalStep("select");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      {/* 상단 헤더 */}
      <div className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              title="대시보드로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-lg text-white shadow-xs">
                  <Coins className="w-4 h-4" />
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  토큰 충전 및 결제 센터
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                  선불형 종량제 지갑
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                안전한 실시간 토큰 지갑을 통해 원하는 만큼만 충전하고 역마진 걱정 없이 시트를 자동화하세요.
              </p>
            </div>
          </div>

          {/* 내 잔여 토큰 뱃지 카드 */}
          {wallet && (
            <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500/10 to-indigo-500/10 border border-amber-300/60 rounded-2xl px-4 py-2.5 shadow-xs">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  현재 보유 토큰
                </div>
                <div className="text-base font-black text-slate-900 leading-tight flex items-baseline gap-1">
                  <span>{wallet.balanceTokens.toLocaleString()}</span>
                  <span className="text-xs font-bold text-amber-600">Tokens</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* 성공 알림 배너 */}
        {purchaseSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-100" />
            <div className="text-sm font-bold">{purchaseSuccess}</div>
          </div>
        )}

        {/* 결제 수단 선택 바 */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">결제 수단 지정</div>
              <div className="text-[11px] text-slate-400">국내 모든 간편결제 및 신용카드 1초 승인</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[
              "간편결제 (카카오/네이버/토스)",
              "신용/체크카드",
              "가상계좌 / 무통장",
            ].map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setSelectedMethod(method)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedMethod === method
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* 패키지 상품 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-3xl bg-white border transition-all relative overflow-hidden flex flex-col justify-between p-6 ${
                pkg.isPopular
                  ? "border-amber-400 shadow-xl ring-2 ring-amber-400/20"
                  : "border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-md"
              }`}
            >
              {pkg.isPopular && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-white text-[10px] font-black px-3.5 py-1 rounded-bl-xl shadow-xs flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-200 fill-amber-200" />
                  <span>가장 많은 회원이 선택</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold px-2.5 py-0.8 bg-slate-100 text-slate-600 rounded-full">
                    {pkg.tag || "기본 패키지"}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-2">{pkg.name}</h3>
                </div>

                {/* 가격 정보 */}
                <div className="pt-2 pb-4 border-b border-slate-100">
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 flex items-baseline gap-1">
                    <span>{pkg.priceKrw.toLocaleString()}</span>
                    <span className="text-sm font-bold text-slate-500">원</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">부가가치세(VAT) 포함가</div>
                </div>

                {/* 제공 토큰 및 혜택 */}
                <div className="space-y-2.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-500">지급 토큰</span>
                    <span className="text-slate-900 font-extrabold text-sm">
                      {pkg.totalTokens.toLocaleString()} Tokens
                    </span>
                  </div>

                  {pkg.bonusTokens > 0 && (
                    <div className="flex items-center justify-between text-amber-600 font-bold bg-amber-50/70 p-2 rounded-xl">
                      <span>보너스 추가 토큰</span>
                      <span>+{pkg.bonusTokens.toLocaleString()} Tokens</span>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Apps Script 자동 생성 약 {Math.round(pkg.totalTokens / 1500)}회 지원</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>최신 Gemini 3.8 Flash 엔진 풀 지원</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>유효기간 없는 영구 보유 크레딧</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 충전 결제 버튼 */}
              <div className="pt-6">
                <button
                  onClick={() => openPaymentModal(pkg)}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${
                    pkg.isPopular
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-md shadow-amber-500/20"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>토큰 충전 결제하기</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 하단 안내 및 결제 이력 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          {/* 안심 결제 보장 안내 */}
          <div className="md:col-span-1 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>안심 충전 보장 안내</span>
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              미사용 토큰은 언제든 안전하게 보관됩니다
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              SheetBot의 토큰은 사용자가 수식을 생성하거나 Apps Script를 배포할 때만 소모되며, 정기 구독과 달리 만료일 없이 평생 유지됩니다.
            </p>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>신규 회원에게는 가입 축하 20,000 토큰이 기본 제공됩니다.</span>
            </div>
          </div>

          {/* 최근 충전 이력 테이블 */}
          <div className="md:col-span-2 p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <History className="w-4 h-4" />
                <span>내 최근 충전/결제 대장</span>
              </div>
              <span className="text-[11px] text-slate-400">최근 10건</span>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                아직 결제 충전 내역이 없습니다. (웰컴 무료 토큰 사용 중)
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] text-slate-400">
                      <th className="pb-2">일시</th>
                      <th className="pb-2">패키지</th>
                      <th className="pb-2">결제 금액</th>
                      <th className="pb-2">충전 토큰</th>
                      <th className="pb-2">수단</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="text-slate-700">
                        <td className="py-2.5 text-slate-400 text-[11px]">
                          {o.created_at ? o.created_at.replace("T", " ").substring(0, 16) : "-"}
                        </td>
                        <td className="py-2.5 font-bold text-slate-900">{o.package_name}</td>
                        <td className="py-2.5 font-extrabold">{o.amount_krw.toLocaleString()}원</td>
                        <td className="py-2.5 font-bold text-amber-600">
                          +{o.tokens_credited.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-slate-500">{o.payment_method}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 💳 실제 PG 결제창 시뮬레이터 모달 */}
      {activeModalPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative animate-scale-up">
            {/* PG사 헤더 */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-amber-500 rounded-lg text-slate-900">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm tracking-tight">안전 결제 PG 시뮬레이터</span>
                    <span className="text-[10px] px-2 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full font-bold border border-emerald-500/30">
                      TEST MODE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">256-bit SSL 암호화 안전 결제</p>
                </div>
              </div>

              <button
                onClick={closePaymentModal}
                disabled={modalStep === "processing"}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 주문 요약 정보 */}
            <div className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>결제 상품</span>
                  <span className="font-bold text-slate-800">{activeModalPackage.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>충전 토큰 수량</span>
                  <span className="font-bold text-amber-600">
                    +{activeModalPackage.totalTokens.toLocaleString()} Tokens
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-extrabold text-slate-800">최종 결제 금액</span>
                  <span className="text-xl font-black text-slate-900">
                    {activeModalPackage.priceKrw.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* 시뮬레이터 상태에 따른 본문 */}
              {modalStep === "select" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>결제 대행사 / 간편결제사 선택</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {["토스페이", "카카오페이", "네이버페이", "KB국민카드", "신한카드", "삼성카드"].map((agency) => (
                        <button
                          key={agency}
                          type="button"
                          onClick={() => setPgAgency(agency)}
                          className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                            pgAgency === agency
                              ? "border-amber-500 bg-amber-50/60 text-amber-900 shadow-xs"
                              : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <span>{agency}</span>
                          {pgAgency === agency && <Check className="w-4 h-4 text-amber-600" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 결제 약관 동의 */}
                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/60 text-[11px] text-amber-800 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>실제 결제 승인 통신 흐름을 안전하게 검증하는 테스트 환경입니다.</span>
                  </div>

                  <button
                    onClick={executeSimulatedPayment}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>{pgAgency}로 {activeModalPackage.priceKrw.toLocaleString()}원 결제 승인하기</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {modalStep === "processing" && (
                <div className="py-10 text-center space-y-4">
                  <div className="relative w-16 h-16 mx-auto">
                    <Loader2 className="w-16 h-16 animate-spin text-amber-500" />
                    <CreditCard className="w-7 h-7 text-slate-700 absolute inset-0 m-auto" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-slate-900">
                      {pgAgency} 결제 승인 진행 중...
                    </h4>
                    <p className="text-xs text-slate-400">
                      금융 결제원 및 카드사 통신망과 안전하게 연동 중입니다. 잠시만 기다려 주세요.
                    </p>
                  </div>
                </div>
              )}

              {modalStep === "done" && (
                <div className="py-10 text-center space-y-4 animate-fade-in">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-900">결제 및 토큰 충전 완료!</h4>
                    <p className="text-xs text-emerald-600 font-bold">
                      +{activeModalPackage.totalTokens.toLocaleString()} 토큰이 지갑에 즉시 반영되었습니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
