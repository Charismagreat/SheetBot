"use client";

import { apiFetch, getEgdeskBasePath } from '@/lib/api';
import { queryTable, onUserDataChanged } from '@/lib/egdesk-helpers';
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
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

import dynamic from "next/dynamic";
import { 
  type UserWallet, 
  type PaymentPackage, 
  type PaymentOrder, 
  DEFAULT_PACKAGES 
} from "@/lib/data/pricing";

const DirectDepositModal = dynamic(
  () => import("@/components/pricing/DirectDepositModal"),
  { ssr: false }
);
const PaymentSimulatorModal = dynamic(
  () => import("@/components/pricing/PaymentSimulatorModal"),
  { ssr: false }
);
const ReceiptModal = dynamic(
  () => import("@/components/pricing/ReceiptModal"),
  { ssr: false }
);
const InvoiceModal = dynamic(
  () => import("@/components/pricing/InvoiceModal"),
  { ssr: false }
);

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
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("간편결제 (카카오/네이버/토스)");

  const [isRealtimeLive, setIsRealtimeLive] = useState(false);

  const fetchWallet = useCallback(async () => {
    try {
      const email = session?.user?.email;
      if (!email) {
        setIsLoggedIn(false);
        return;
      }
      setIsLoggedIn(true);
      const cleanEmail = email.toLowerCase().trim();

      const [walletsRes, ordersRes] = await Promise.all([
        queryTable<any>("sheetbot_user_wallets", {
          filters: { user_email: cleanEmail },
          limit: 5,
        }).catch(() => ({ rows: [] })),
        queryTable<any>("sheetbot_payment_orders", {
          filters: { user_email: cleanEmail },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 20,
        }).catch(() => ({ rows: [] })),
      ]);

      const walletRows = walletsRes.rows || [];
      const userWalletRow = walletRows.find((r: any) => !r.deleted_at) || walletRows[0];
      if (userWalletRow) {
        setWallet({
          balanceTokens: Number(userWalletRow.balance_tokens ?? 2495439),
          totalPurchasedTokens: Number(userWalletRow.total_purchased_tokens ?? 2500000),
          totalUsedTokens: Number(userWalletRow.total_used_tokens ?? 4561),
          tier: userWalletRow.tier || "PRO",
        });
      }

      const validOrders = (ordersRes.rows || []).filter((r: any) => !r.deleted_at);
      setOrders(validOrders);
    } catch (err) {
      console.error("지갑 정보 조회 실패:", err);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // ⚡ [0초 실시간 감시] 이지데스크 공식 onUserDataChanged 연동 (토큰 지갑 및 충전 내역)
  useEffect(() => {
    if (typeof window === "undefined" || !session?.user?.email) return;

    const unsub = onUserDataChanged((event) => {
      setIsRealtimeLive(true);
      const relevant = [
        "sheetbot_user_wallets",
        "sheetbot_users",
        "sheetbot_deposit_requests",
        "sheetbot_payment_orders",
      ];
      if (!event.tableName || relevant.includes(event.tableName)) {
        fetchWallet();
      }
    });

    setIsRealtimeLive(true);

    return () => {
      unsub();
    };
  }, [session?.user?.email, fetchWallet]);

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

  // 결제 모달 상태 (기본: 구글 시트와 동일한 다이렉트 무통장 모달 / 옵션 보존: PG 시뮬레이터)
  const [activeModalPackage, setActiveModalPackage] = useState<PaymentPackage | null>(null);
  const [usePgSimulator, setUsePgSimulator] = useState(false);

  // 영수증 모달 & 세금계산서 신청 모달 상태
  const [receiptOrder, setReceiptOrder] = useState<PaymentOrder | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<PaymentOrder | null>(null);

  const openPaymentModal = (pkg: PaymentPackage) => {
    setActiveModalPackage(pkg);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      {/* 상단 헤더 */}
      <div className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              title="워크스페이스로 돌아가기"
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
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full border ${
                  isRealtimeLive
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isRealtimeLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                  <span>{isRealtimeLive ? "⚡ DB 왓처 0초 실시간" : "스트림 연결 중"}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                안전한 실시간 토큰 지갑을 통해 원하는 만큼만 충전하고 역마진 걱정 없이 시트를 자동화하세요.
              </p>
            </div>
          </div>

          {/* 내 잔여 토큰 뱃지 카드 */}
          {wallet && (
            <div
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-xs border ${
                wallet.balanceTokens < 0
                  ? "bg-rose-50/90 border-rose-300 text-rose-900"
                  : "bg-gradient-to-r from-amber-500/10 to-indigo-500/10 border-amber-300/60"
              }`}
            >
              <div
                className={`p-2 rounded-xl shadow-xs text-white ${
                  wallet.balanceTokens < 0 ? "bg-rose-600" : "bg-amber-500"
                }`}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div
                  className={`text-[10px] font-extrabold uppercase tracking-wider ${
                    wallet.balanceTokens < 0 ? "text-rose-600" : "text-slate-500"
                  }`}
                >
                  {wallet.balanceTokens < 0 ? "현재 초과 사용분 (미정산)" : "현재 보유 토큰"}
                </div>
                <div className="text-base font-black leading-tight flex items-baseline gap-1">
                  <span className={wallet.balanceTokens < 0 ? "text-rose-600" : "text-slate-900"}>
                    {wallet.balanceTokens.toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      wallet.balanceTokens < 0 ? "text-rose-600" : "text-amber-600"
                    }`}
                  >
                    Tokens
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* 초과 사용(Overdraft) 정산 안내 배너 */}
        {wallet && wallet.balanceTokens < 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-600 text-white shadow-lg flex items-start sm:items-center gap-3 animate-fade-in border border-rose-400">
            <AlertCircle className="w-6 h-6 shrink-0 text-white mt-0.5 sm:mt-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-extrabold">💡 미정산 초과 사용분 자동 상계 안내: </span>
              이전 AI 자동화 작업에서 정상 완수를 위해 허용된 초과 사용분{" "}
              <strong className="underline underline-offset-2">
                {Math.abs(wallet.balanceTokens).toLocaleString()} 토큰
              </strong>
              이 존재합니다. 패키지 충전 시 해당 수량이 자동으로 차감 정산된 후 잔여량이 충전됩니다.
            </div>
          </div>
        )}

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

                  {wallet && wallet.balanceTokens < 0 && (
                    <div className="flex items-center justify-between text-rose-700 font-bold bg-rose-50 p-2 rounded-xl border border-rose-200/60">
                      <span className="text-[11px]">초과분 상계 후 최종 잔여량</span>
                      <span className="text-xs font-black">
                        {(pkg.totalTokens + wallet.balanceTokens).toLocaleString()} Tokens
                      </span>
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
                              onClick={() => setInvoiceOrder(o)}
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

      {/* 🚀 토큰 충전 모달: 구글 시트와 100% 동일한 다이렉트 무통장 입금 감지 모달 (기본) */}
      {activeModalPackage && !usePgSimulator && (
        <DirectDepositModal
          pkg={activeModalPackage}
          userEmail={session?.user?.email || ""}
          userTier={wallet.tier}
          userBalance={wallet.balanceTokens}
          onClose={() => {
            setActiveModalPackage(null);
            setUsePgSimulator(false);
          }}
          onSuccess={(msg) => {
            fetchWallet();
            setPurchaseSuccess(msg);
            setTimeout(() => setPurchaseSuccess(null), 5000);
          }}
          onSwitchToPgModal={() => setUsePgSimulator(true)}
        />
      )}

      {/* 💳 실제 PG 결제창 시뮬레이터 모달 (보존: 추후 결제사 계약 체결 시 옵션 사용) */}
      {activeModalPackage && usePgSimulator && (
        <PaymentSimulatorModal
          pkg={activeModalPackage}
          selectedMethod={selectedMethod}
          onClose={() => {
            setActiveModalPackage(null);
            setUsePgSimulator(false);
          }}
          onSuccess={(msg) => {
            fetchWallet();
            setPurchaseSuccess(msg);
            setTimeout(() => setPurchaseSuccess(null), 5000);
          }}
        />
      )}

      {/* 🧾 신용카드 / 결제 영수증(매출전표) 출력 모달 */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          userTier={wallet.tier}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* 📑 세금계산서 / 현금영수증 신청 접수 모달 */}
      {invoiceOrder && (
        <InvoiceModal
          order={invoiceOrder}
          onClose={() => setInvoiceOrder(null)}
        />
      )}
    </div>
  );
}
