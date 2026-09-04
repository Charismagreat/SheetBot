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
  Printer,
  FileText,
  Download,
  Building2,
  Receipt,
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

  // 한국 표준시(KST) 포맷팅 헬퍼
  const formatKstDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      // 이미 'YYYY-MM-DD HH:mm:ss' 형식이거나 ISO 문자열인 경우 처리
      const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
      if (isNaN(d.getTime())) {
        return dateStr.replace("T", " ").substring(0, 16);
      }
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(d)
        .replace(/\. /g, "-")
        .replace(".", "");
    } catch {
      return dateStr.replace("T", " ").substring(0, 16);
    }
  };

  // 결제 수단 명칭 간결화 헬퍼
  const formatPaymentBadge = (method: string) => {
    if (!method) return "일반결제";
    // 예: "간편결제 (카카오/네이버/토스) (카카오페이)" -> "카카오페이"
    const match = method.match(/\(([^)]+)\)$/);
    if (match && match[1]) return match[1];
    if (method.includes("토스")) return "토스페이";
    if (method.includes("카카오")) return "카카오페이";
    if (method.includes("네이버")) return "네이버페이";
    if (method.includes("카드")) return "신용카드";
    if (method.includes("이니시스")) return "KG이니시스";
    return method.length > 12 ? method.substring(0, 12) + "…" : method;
  };

  // PG 결제 시뮬레이터 모달 상태
  const [activeModalPackage, setActiveModalPackage] = useState<PaymentPackage | null>(null);
  const [modalStep, setModalStep] = useState<"select" | "processing" | "done">("select");
  const [pgAgency, setPgAgency] = useState("토스페이"); // 카카오페이, 네이버페이, 신용카드 등

  // 영수증 모달 & 세금계산서 신청 모달 상태
  const [receiptOrder, setReceiptOrder] = useState<PaymentOrder | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<PaymentOrder | null>(null);
  const [taxForm, setTaxForm] = useState({
    type: "TAX_INVOICE",
    companyName: "",
    bizNumber: "",
    ceoName: "",
    managerEmail: "",
  });
  const [taxSubmitting, setTaxSubmitting] = useState(false);

  // 포트원(PortOne v1/v2) 브라우저 SDK 동적 로드
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as any).IMP) {
      const script = document.createElement("script");
      script.src = "https://cdn.iamport.kr/v1/iamport.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

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

  // 포트원 가맹점 식별코드 및 PG사 설정
  const [paymentMode, setPaymentMode] = useState<"simulation" | "portone">("simulation");
  const [portoneCode, setPortoneCode] = useState("");
  const [portonePg, setPortonePg] = useState("html5_inicis");
  const [showPortoneConfig, setShowPortoneConfig] = useState(false);

  // 실제 포트원(PortOne) 결제창 호출 함수
  const executePortOnePayment = () => {
    if (!activeModalPackage) return;
    const IMP = (window as any).IMP;
    if (!IMP) {
      alert("포트원 결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const targetCode = portoneCode.trim();
    if (!targetCode) {
      alert(
        "⚠️ [포트원 가맹점 식별코드 필요]\n\n" +
        "실제 결제창을 브라우저에 팝업하려면 포트원 관리자 콘솔(admin.portone.io)에서 발급받은 본인의 '가맹점 식별코드(imp_xxxx)'를 입력해야 합니다.\n\n" +
        "별도의 포트원 가입 없이 결제 및 토큰 충전 프로세스를 확인하시려면 상단의 [⚡ 일반 결제 시뮬레이션] 탭을 이용해 주세요!"
      );
      return;
    }

    try {
      // 입력된 가맹점 식별코드로 초기화
      IMP.init(targetCode);

      const merchantUid = `mid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      IMP.request_pay(
        {
          pg: portonePg, // 사용자 선택 PG사 (기본값: html5_inicis)
          pay_method: "card",
          merchant_uid: merchantUid,
          name: `SheetBot ${activeModalPackage.name}`,
          amount: activeModalPackage.priceKrw,
          buyer_email: "test_customer@gmail.com",
          buyer_name: "시트봇 테스트 회원",
          buyer_tel: "010-1234-5678",
        },
        async (rsp: any) => {
          if (rsp.success) {
            // 결제 성공 시 서버 지갑 충전 반영
            setModalStep("processing");
            try {
              const res = await fetch("/api/wallet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  packageId: activeModalPackage.id,
                  paymentMethod: `포트원 이니시스 (승인번호: ${rsp.imp_uid || "IMP_TEST"})`,
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
              }
            } catch (err: any) {
              alert("지갑 충전 반영 오류: " + err.message);
            }
          } else {
            const errMsg = rsp.error_msg || "";
            if (errMsg.includes("PG") && (errMsg.includes("등록") || errMsg.includes("설정") || errMsg.includes("찾을 수 없습니다"))) {
              alert(
                "⚠️ [포트원 안내]\n" +
                "현재 가맹점 식별코드에 해당 PG 채널이 등록되어 있지 않습니다.\n\n" +
                "👉 1. 실제 테스트를 원하시면 결제창 아래 [⚙️ 내 포트원 가맹점 식별코드 직접 입력하기]에서 본인의 imp_xxxx 코드를 입력해 주세요.\n" +
                "👉 2. 또는 상단의 주황색 [결제 승인하기] 버튼을 누르시면 별도 설정 없이도 즉시 충전/승인/영수증 테스트가 가능합니다!"
              );
              setShowPortoneConfig(true);
            } else {
              alert(`결제 결과: ${errMsg || "사용자가 결제를 취소했습니다."}`);
            }
          }
        }
      );
    } catch (e: any) {
      alert("포트원 호출 오류: " + e.message);
    }
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

        {/* 하단 안내 및 결제 이력 (1열 전체 너비 배치) */}
        <div className="space-y-6 pt-4">
          {/* 최근 충전 이력 테이블 (전체 너비 1열) */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-700 font-bold text-xs">
                <History className="w-4 h-4 text-indigo-600" />
                <span>내 최근 충전/결제 대장</span>
              </div>
              <span className="text-[11px] text-slate-400">최근 10건</span>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                아직 결제 충전 내역이 없습니다. (웰컴 무료 토큰 사용 중)
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto pr-1">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="sticky top-0 bg-white shadow-xs z-10">
                    <tr className="border-b border-slate-100 text-[11px] text-slate-400 font-bold">
                      <th className="pb-2.5 pr-3">결제 일시</th>
                      <th className="pb-2.5 px-3">패키지</th>
                      <th className="pb-2.5 px-3 text-right">결제 금액</th>
                      <th className="pb-2.5 px-3 text-right">충전 토큰</th>
                      <th className="pb-2.5 px-3">수단</th>
                      <th className="pb-2.5 pl-3 text-right">적격증빙 / 영수증</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="text-slate-700 hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 pr-3 text-slate-500 text-[11.5px] font-mono whitespace-nowrap">
                          {formatKstDate(o.created_at)}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {o.package_name.replace(/ \(인기 추천\)| \(체험형\)| Automation/g, "")}
                        </td>
                        <td className="py-3 px-3 font-black text-slate-900 text-right whitespace-nowrap">
                          {o.amount_krw.toLocaleString()}원
                        </td>
                        <td className="py-3 px-3 font-extrabold text-amber-600 text-right whitespace-nowrap">
                          +{o.tokens_credited.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10.5px] font-semibold border border-slate-200">
                            {formatPaymentBadge(o.payment_method)}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <button
                              onClick={() => setReceiptOrder(o)}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                              title="신용카드/결제 영수증(매출전표) 출력"
                            >
                              <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                              <span>영수증</span>
                            </button>
                            <button
                              onClick={() => {
                                setInvoiceOrder(o);
                                setTaxForm({
                                  type: "TAX_INVOICE",
                                  companyName: "",
                                  bizNumber: "",
                                  ceoName: "",
                                  managerEmail: "",
                                });
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:bg-amber-100 bg-amber-50 border border-amber-200 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                              title="전자세금계산서 또는 지출증빙 현금영수증 신청"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-600" />
                              <span>계산서 / 현금영수증</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 안심 충전 보장 안내 (1열 가로 배너) */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>안심 충전 및 평생 보장 안내</span>
              </div>
              <p className="text-xs text-slate-600">
                SheetBot의 토큰은 사용자가 수식을 생성하거나 Apps Script를 배포할 때만 소모되며, 정기 구독과 달리 만료일 없이 평생 보관됩니다.
              </p>
            </div>
            <div className="shrink-0 px-3.5 py-2 bg-amber-50 rounded-xl border border-amber-200/60 text-[11px] text-amber-800 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>신규 가입 시 20,000 웰컴 토큰 평생 무료 제공</span>
            </div>
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

              {/* 모달 탭 선택 (내장 시뮬레이터 vs 실제 포트원 연동) */}
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setPaymentMode("simulation")}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    paymentMode === "simulation"
                      ? "bg-white text-amber-600 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ⚡ 일반 결제 시뮬레이션 (추천)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("portone")}
                  className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    paymentMode === "portone"
                      ? "bg-white text-indigo-600 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  🔌 포트원 실제 PG창 연동
                </button>
              </div>

              {/* 시뮬레이터 상태에 따른 본문 */}
              {modalStep === "select" && (
                <div className="space-y-4">
                  {paymentMode === "simulation" ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>결제 대행사 / 간편결제사 선택</span>
                          <span className="text-[10px] text-emerald-600 font-semibold">설정 없이 즉시 테스트 가능</span>
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

                      {/* 결제 안내 */}
                      <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/60 text-[11px] text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>별도 PG 가입 없이 카드사 승인/토큰 충전/영수증 출력을 즉시 검증할 수 있습니다.</span>
                      </div>

                      <button
                        onClick={executeSimulatedPayment}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <span>{pgAgency}로 {activeModalPackage.priceKrw.toLocaleString()}원 결제 승인하기</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    /* 포트원 실제 연동 모드 */
                    <div className="space-y-3.5">
                      <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/60 text-[11px] text-indigo-900 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4 text-indigo-600" />
                          포트원(PortOne) 실 브라우저 결제창 팝업
                        </p>
                        <p className="text-slate-600 text-[10.5px]">
                          포트원 관리자 콘솔(<a href="https://admin.portone.io" target="_blank" rel="noreferrer" className="underline font-bold text-indigo-600">admin.portone.io</a>)에서 발급받은 본인의 가맹점 식별코드와 연동 PG를 지정해야 팝업창이 열립니다.
                        </p>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          1. 포트원 가맹점 식별코드 (User Code) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={portoneCode}
                          onChange={(e) => setPortoneCode(e.target.value)}
                          placeholder="imp12345678 (내 콘솔의 식별코드)"
                          className="w-full p-2.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">
                          2. 테스트할 PG 채널 모듈 <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={portonePg}
                          onChange={(e) => setPortonePg(e.target.value)}
                          className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="html5_inicis">KG이니시스 웹표준 (html5_inicis)</option>
                          <option value="kakaopay.TC0ONETIME">카카오페이 테스트 (kakaopay.TC0ONETIME)</option>
                          <option value="tosspay">토스페이 (tosspay)</option>
                          <option value="nice_v2">나이스페이 v2 (nice_v2)</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={executePortOnePayment}
                        className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>포트원 실제 결제창 띄우기</span>
                      </button>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => setPaymentMode("simulation")}
                          className="text-[11px] text-slate-500 hover:text-amber-600 underline cursor-pointer"
                        >
                          👈 복잡한 설정 없이 즉시 승인 시뮬레이션으로 테스트하기
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* 🧾 신용카드 / 결제 영수증(매출전표) 출력 모달 */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative print:border-none print:shadow-none">
            {/* 영수증 헤더 */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">신용카드 매출전표 (영수증)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>인쇄 / PDF 저장</span>
                </button>
                <button
                  onClick={() => setReceiptOrder(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 영수증 본문 (공식 양식) */}
            <div className="p-8 space-y-6 text-slate-800 font-sans text-xs bg-slate-50/40">
              <div className="text-center pb-4 border-b border-slate-300">
                <div className="text-xl font-black text-slate-900 tracking-tight">신용카드(간편결제) 매출전표</div>
                <p className="text-[11px] text-slate-400 mt-0.5">부가가치세법 시행령 제57조에 의한 영수증 겸용</p>
              </div>

              {/* 가맹점 & 주문자 정보 */}
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-dashed border-slate-300">
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">[공급자 / 가맹점]</div>
                  <div>상호: SheetBot (이지데스크 SaaS)</div>
                  <div>사업자등록번호: 123-45-67890</div>
                  <div>대표자: 관리자</div>
                  <div>고객센터: support@sheetbot.io</div>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">[주문 및 결제 정보]</div>
                  <div>주문번호: {receiptOrder.order_id}</div>
                  <div>결제일시: {receiptOrder.created_at ? receiptOrder.created_at.replace("T", " ").substring(0, 19) : "-"}</div>
                  <div>회원계정: {wallet.tier} 회원</div>
                  <div>결제수단: {receiptOrder.payment_method}</div>
                </div>
              </div>

              {/* 금액 상세 */}
              <div className="space-y-2 py-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">품명 (상품명)</span>
                  <span className="font-bold text-slate-900">{receiptOrder.package_name} (+{receiptOrder.tokens_credited.toLocaleString()} Tokens)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">공급가액</span>
                  <span>{Math.round(receiptOrder.amount_krw / 1.1).toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">부가가치세 (VAT 10%)</span>
                  <span>{(receiptOrder.amount_krw - Math.round(receiptOrder.amount_krw / 1.1)).toLocaleString()}원</span>
                </div>
                <div className="pt-3 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black">
                  <span>합계 결제 금액</span>
                  <span className="text-base text-indigo-600">{receiptOrder.amount_krw.toLocaleString()}원</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
                본 영수증은 전자상거래 등에서의 소비자보호에 관한 법률 및 부가가치세법에 따라 매입세액공제용 영수증으로 활용 가능합니다.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📑 세금계산서 / 현금영수증 신청 접수 모달 */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative">
            <div className="p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-100" />
                <h3 className="text-sm font-extrabold">세금계산서 / 현금영수증 신청</h3>
              </div>
              <button
                onClick={() => setInvoiceOrder(null)}
                className="p-1.5 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  setTaxSubmitting(true);
                  const res = await fetch("/api/wallet/tax-invoice", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      orderId: invoiceOrder.order_id,
                      type: taxForm.type,
                      companyName: taxForm.companyName,
                      bizNumber: taxForm.bizNumber,
                      ceoName: taxForm.ceoName,
                      managerEmail: taxForm.managerEmail,
                      amountKrw: invoiceOrder.amount_krw,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    alert(data.message);
                    setInvoiceOrder(null);
                  } else {
                    alert(data.error || "신청에 실패했습니다.");
                  }
                } catch (err: any) {
                  alert("신청 오류: " + err.message);
                } finally {
                  setTaxSubmitting(false);
                }
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>신청 대상 주문</span>
                  <span className="font-bold text-slate-800">{invoiceOrder.order_id}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>결제 금액</span>
                  <span className="font-black text-amber-600">{invoiceOrder.amount_krw.toLocaleString()}원</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">발행 구분</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTaxForm({ ...taxForm, type: "TAX_INVOICE" })}
                    className={`p-2.5 rounded-xl border font-bold transition-all ${
                      taxForm.type === "TAX_INVOICE"
                        ? "border-amber-500 bg-amber-50 text-amber-900"
                        : "border-slate-200 text-slate-600 bg-white"
                    }`}
                  >
                    전자세금계산서 (사업자)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxForm({ ...taxForm, type: "CASH_RECEIPT" })}
                    className={`p-2.5 rounded-xl border font-bold transition-all ${
                      taxForm.type === "CASH_RECEIPT"
                        ? "border-amber-500 bg-amber-50 text-amber-900"
                        : "border-slate-200 text-slate-600 bg-white"
                    }`}
                  >
                    현금영수증 (지출증빙)
                  </button>
                </div>
              </div>

              {taxForm.type === "TAX_INVOICE" ? (
                <>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">사업자등록번호</label>
                    <input
                      type="text"
                      required
                      placeholder="000-00-00000"
                      value={taxForm.bizNumber}
                      onChange={(e) => setTaxForm({ ...taxForm, bizNumber: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">상호 (법인명)</label>
                      <input
                        type="text"
                        required
                        placeholder="(주)회사명"
                        value={taxForm.companyName}
                        onChange={(e) => setTaxForm({ ...taxForm, companyName: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700">대표자명</label>
                      <input
                        type="text"
                        placeholder="대표자 성함"
                        value={taxForm.ceoName}
                        onChange={(e) => setTaxForm({ ...taxForm, ceoName: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">휴대폰번호 또는 지출증빙 사업자번호</label>
                  <input
                    type="text"
                    required
                    placeholder="010-0000-0000 또는 사업자번호"
                    value={taxForm.bizNumber}
                    onChange={(e) => setTaxForm({ ...taxForm, bizNumber: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-700">계산서 수신 이메일</label>
                <input
                  type="email"
                  required
                  placeholder="accounting@company.com"
                  value={taxForm.managerEmail}
                  onChange={(e) => setTaxForm({ ...taxForm, managerEmail: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={taxSubmitting}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {taxSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span>{taxSubmitting ? "신청 접수 중..." : "발행 신청 완료하기"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
