// src/components/pricing/DirectDepositModal.tsx
/**
 * 다이렉트 무통장 입금 감지 & QR 송금 결제 모달
 *
 * [원칙]
 * - 연동된 구글 시트의 충전 모달(recharge-modal-template)과 100% 동일한 결제 경험 제공.
 * - 송금자 실명 입력 시 1원 단위 자동 감지 할인 금액 및 입금 계좌/QR 코드 자동 발급.
 * - 시트봇 에이전트 M 무통장 감지기와 연동되어 입금 즉시 0초 만에 토큰 자동 충전.
 * - 추후 결제대행사(PG) 본계약 체결 시 원클릭으로 PG 모달 전환 지원.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Coins,
  X,
  Check,
  CheckCircle2,
  Copy,
  Zap,
  Lock,
  Unlock,
  RefreshCw,
  QrCode,
  ShieldCheck,
  Sparkles,
  CreditCard,
  ChevronRight,
  ArrowRight,
  Smartphone,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PaymentPackage } from "@/lib/data/pricing";

interface DirectDepositModalProps {
  pkg: PaymentPackage | null;
  userEmail: string;
  userTier?: string;
  userBalance?: number;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onSwitchToPgModal?: () => void;
}

const DEFAULT_PACKAGES = [
  {
    id: "pkg_starter",
    name: "스타터",
    tokens: 50000,
    priceKrw: 5000,
    priceStr: "5,000",
    badge: "입문용",
  },
  {
    id: "pkg_standard",
    name: "스탠다드",
    tokens: 150000,
    priceKrw: 12000,
    priceStr: "12,000",
    badge: "🔥 가장 인기",
    recommended: true,
  },
  {
    id: "pkg_pro",
    name: "프로",
    tokens: 450000,
    priceKrw: 30000,
    priceStr: "30,000",
    badge: "최대 혜택",
  },
];

export default function DirectDepositModal({
  pkg,
  userEmail,
  userTier = "PRO",
  userBalance = 0,
  onClose,
  onSuccess,
  onSwitchToPgModal,
}: DirectDepositModalProps) {
  // 선택된 패키지 ID
  const [selectedPkgId, setSelectedPkgId] = useState<string>(() => {
    if (pkg?.id) {
      if (pkg.id.includes("starter")) return "pkg_starter";
      if (pkg.id.includes("standard")) return "pkg_standard";
      if (pkg.id.includes("pro")) return "pkg_pro";
    }
    return "pkg_standard";
  });

  // 송금자 정보 입력 상태
  const [depositorName, setDepositorName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 발급된 세션 데이터
  const [sessionData, setSessionData] = useState<{
    requestId: string;
    depositCode: string;
    depositorName: string;
    originalPriceKrw: number;
    discountKrw: number;
    finalPriceKrw: number;
    bank: {
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    };
    qrImageUrl: string;
  } | null>(null);

  // 복사 피드백 및 상태
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [finalTokens, setFinalTokens] = useState<number>(userBalance);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 이메일 앞자리 추출하여 기본 송금자명 힌트 제공
  const defaultHintName = userEmail ? userEmail.split("@")[0].replace(/[^a-zA-Z0-9가-힣]/g, "") : "홍길동";

  // 1. 송금 세션 요청 (계좌 확인 🔓)
  const handleRequestSession = async (overridePkgId?: string) => {
    const targetPkgId = overridePkgId || selectedPkgId;
    const cleanName = depositorName.trim();

    if (!cleanName || cleanName.length < 2) {
      alert("실제 송금하실 분의 성함(입금자명)을 2글자 이상 입력해 주세요.\n예: " + defaultHintName);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/wallet/direct-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: targetPkgId,
          depositorName: cleanName,
          userEmail: userEmail || "chachogreat@gmail.com",
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSessionData({
          requestId: data.requestId,
          depositCode: data.depositCode,
          depositorName: data.depositorName || cleanName,
          originalPriceKrw: Number(data.originalPriceKrw || 12000),
          discountKrw: Number(data.discountKrw || 0),
          finalPriceKrw: Number(data.finalPriceKrw || 12000),
          bank: data.bank || {
            bankName: "카카오뱅크",
            accountNumber: "3333-12-1695965",
            accountHolder: "차호석",
          },
          qrImageUrl: data.qrImageUrl || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent("은행명:카카오뱅크 / 계좌번호:3333-12-1695965")}`,
        });
        setIsUnlocked(true);
      } else {
        alert(data.error || "입금 계좌 발급에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch (err: any) {
      alert("통신 오류가 발생했습니다: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. 입금 상태 확인 (폴링 및 수동 확인)
  const checkDepositStatus = async (manual = false) => {
    if (!sessionData?.requestId) return;
    if (manual) setIsCheckingStatus(true);

    try {
      const res = await apiFetch(`/api/wallet/direct-deposit?id=${sessionData.requestId}`);
      const data = await res.json();

      if (data.success && data.status === "COMPLETED") {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsCompleted(true);
        setFinalTokens(data.finalBalance || userBalance + 150000);
      } else if (manual) {
        alert("아직 입금이 확인되지 않았습니다. 송금 후 약 5~10초 내외로 자동 감지됩니다.");
      }
    } catch {
      // ignore polling errors
    } finally {
      if (manual) setIsCheckingStatus(false);
    }
  };

  // 3. 잠금 해제 후 주기적 폴링 시작
  useEffect(() => {
    if (isUnlocked && sessionData?.requestId && !isCompleted) {
      pollTimerRef.current = setInterval(() => {
        checkDepositStatus(false);
      }, 4000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isUnlocked, sessionData?.requestId, isCompleted]);

  // 계좌번호 복사
  const handleCopyAccount = () => {
    const acc = sessionData?.bank?.accountNumber || "3333-12-1695965";
    navigator.clipboard.writeText(acc.replace(/[^0-9]/g, ""));
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  // 완료 후 닫기
  const handleFinish = () => {
    onSuccess("🎉 무통장 입금이 정상 확인되어 토큰이 즉시 충전되었습니다!");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in text-left">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* 상단 헤더 */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-500/30">
              <Coins className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black tracking-tight">다이렉트 무통장 충전</h3>
                <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  0초 자동확인
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">PG 수수료 0원 혜택 + 1원 단위 즉시 입금 감지</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 바디 컨텐츠 (스크롤) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
          {/* 성공 화면 */}
          {isCompleted ? (
            <div className="py-6 px-4 bg-emerald-50 border-2 border-emerald-500 rounded-2xl text-center space-y-4 shadow-sm animate-fade-in">
              <div className="text-4xl animate-bounce">🎉</div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-emerald-950">토큰 충전이 완료되었습니다!</h4>
                <p className="text-xs text-emerald-800 font-medium">
                  송금하신 금액이 정상 감지되어 토큰이 지갑에 즉시 충전되었습니다.
                </p>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-emerald-200 text-xs text-slate-700 font-bold shadow-xs">
                현재 총 잔여 토큰:{" "}
                <span className="text-emerald-600 text-base font-black">
                  {finalTokens.toLocaleString()}
                </span>
                개
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                확인 및 지갑 닫기
              </button>
            </div>
          ) : (
            <>
              {/* 내 지갑 상태 요약 */}
              <div className="bg-slate-900 text-white p-3 rounded-2xl flex items-center justify-between shadow-xs">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400">내 계정</div>
                  <div className="text-xs font-bold text-slate-200 font-mono truncate max-w-[180px]">
                    {userEmail || "chachogreat@gmail.com"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-slate-400">현재 보유 토큰</div>
                  <div className="text-sm font-black text-emerald-400">
                    {userBalance.toLocaleString()} 토큰
                  </div>
                </div>
              </div>

              {/* 1. 충전 패키지 선택 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <label className="text-xs font-black text-slate-800">1. 충전 패키지 선택</label>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    ⚡ PG 수수료 0원 혜택
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DEFAULT_PACKAGES.map((p) => {
                    const isSelected = selectedPkgId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPkgId(p.id);
                          if (isUnlocked && depositorName) {
                            handleRequestSession(p.id);
                          }
                        }}
                        className={`p-2.5 rounded-2xl text-center transition-all cursor-pointer flex flex-col items-center justify-between min-h-[82px] border-2 relative ${
                          isSelected
                            ? "bg-indigo-50/90 border-indigo-600 shadow-sm ring-2 ring-indigo-300/40"
                            : "bg-white border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        {p.recommended && (
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[8px] font-black tracking-tight whitespace-nowrap shadow-xs">
                            🔥 추천
                          </div>
                        )}
                        <span className={`text-[11px] font-bold ${isSelected ? "text-indigo-900" : "text-slate-500"}`}>
                          {p.name}
                        </span>
                        <div className="my-0.5">
                          <div className={`text-xs font-black leading-tight ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>
                            {(p.tokens / 10000).toFixed(0)}만 토큰
                          </div>
                          <div className={`text-[11px] font-bold ${isSelected ? "text-indigo-950" : "text-slate-500"}`}>
                            {p.priceStr}원
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {p.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. 입금인명 및 영수증 번호 입력 게이트 */}
              <div className="bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-indigo-50/80 border-2 border-indigo-200 rounded-2xl p-3 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                    <span>👤</span>
                    <span>2. 송금자 정보 입력</span>
                  </label>
                  <span
                    className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full border ${
                      isUnlocked
                        ? "text-emerald-700 bg-emerald-100/90 border-emerald-300"
                        : "text-amber-700 bg-amber-100/80 border-amber-300"
                    }`}
                  >
                    {isUnlocked ? "🔓 계좌 열림" : "🔒 계좌 잠김"}
                  </span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      송금자 실명 <span className="text-rose-500 font-extrabold">*필수</span>
                    </label>
                    <input
                      type="text"
                      value={depositorName}
                      onChange={(e) => setDepositorName(e.target.value)}
                      placeholder={`은행 송금 시 보낼 실명 (예: ${defaultHintName})`}
                      className="w-full bg-white border-2 border-indigo-300 rounded-xl px-3 py-2 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 flex items-center justify-between mb-1">
                      <span>영수증 수신 번호 <span className="text-indigo-600 font-medium">(선택)</span></span>
                      <span className="text-[9px] text-emerald-600 font-extrabold">⚡ 입금 즉시 0원 영수증 SMS 자동 발송</span>
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="010-0000-0000 (미입력 시 SMS 발송 생략)"
                      className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs placeholder:text-slate-400"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRequestSession()}
                    disabled={isSubmitting}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>전용 계좌 발급 중...</span>
                      </>
                    ) : isUnlocked ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>계좌 정보 다시 확인 🔓</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>계좌 확인 및 1원 단위 할인 받기 🔓</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 3. 계좌정보 & 결제 영역 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3 relative overflow-hidden">
                {!isUnlocked ? (
                  <div className="p-6 bg-slate-50/90 border-2 border-dashed border-slate-300 rounded-xl text-center space-y-2">
                    <div className="text-3xl animate-bounce">🔒</div>
                    <div className="text-xs font-black text-slate-800">송금자 성함을 먼저 입력해 주세요</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">
                      위 2번 항목에 은행에서 송금하실 성함을 입력하고<br />
                      <strong className="text-indigo-600">[계좌 확인 🔓]</strong> 버튼을 누르면 전용 계좌가 열립니다.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 animate-fade-in">
                    {/* 정확한 송금 금액 배너 */}
                    <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border-2 border-emerald-300 rounded-xl p-3 flex items-center justify-between shadow-2xs">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900">송금할 정확한 금액</span>
                          <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full border border-rose-200">
                            -{sessionData?.discountKrw || 13}원 즉시할인
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          정가: <span className="line-through">{sessionData?.originalPriceKrw?.toLocaleString()}</span>원 → 0초 자동확인 전용
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-emerald-600 tracking-tight font-mono">
                          {sessionData?.finalPriceKrw?.toLocaleString()}
                        </span>
                        <span className="text-xs font-black text-slate-900 ml-1">원</span>
                      </div>
                    </div>

                    {/* 입금 안내 경고 박스 */}
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[11px] font-black text-amber-950">
                          <span>⚠️</span>
                          <span>입금자명:</span>
                          <span className="text-indigo-900 bg-white border border-indigo-200 px-1.5 py-0.5 rounded font-black text-xs">
                            {sessionData?.depositorName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsUnlocked(false)}
                          className="text-[10px] text-slate-500 hover:text-indigo-600 underline font-bold cursor-pointer"
                        >
                          성함 변경
                        </button>
                      </div>
                      <p className="text-[10px] text-amber-900 leading-tight">
                        ※ 은행 송금 시 <strong>입금자명</strong>을 위 성함으로, 금액은 <strong>1원 단위까지 정확히 송금</strong>하시면 0초 만에 충전됩니다.
                      </p>
                    </div>

                    {/* QR 및 계좌번호 */}
                    <div className="grid grid-cols-12 gap-2.5 items-center p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="col-span-4 flex flex-col items-center justify-center p-1 bg-white border border-slate-200 rounded-lg">
                        <img
                          src={sessionData?.qrImageUrl}
                          alt="QR Code"
                          className="w-20 h-20 object-contain"
                        />
                        <span className="text-[8px] font-bold text-slate-500 mt-0.5">카메라 QR 스캔</span>
                      </div>
                      <div className="col-span-8 space-y-2">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                            <span className="text-xs font-black text-slate-900">
                              {sessionData?.bank?.bankName || "카카오뱅크"}
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold">
                              (예금주: {sessionData?.bank?.accountHolder || "차호석"})
                            </span>
                          </div>
                          <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 mt-1 font-mono font-black text-xs text-slate-900 select-all">
                            {sessionData?.bank?.accountNumber || "3333-12-1695965"}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleCopyAccount}
                          className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-[11px] rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                        >
                          {copiedAccount ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>계좌번호 복사 완료!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>계좌번호 복사하기</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 실시간 감지 상태 바 */}
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-emerald-900 font-extrabold text-[11px]">
                          실시간 입금 감지 대기 중...
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => checkDepositStatus(true)}
                        disabled={isCheckingStatus}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] rounded-md shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? "animate-spin" : ""}`} />
                        <span>확인</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 하단 푸터 (PG 결제사 계약 후 전환 옵션 보존) */}
        {!isCompleted && onSwitchToPgModal && (
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-[11px] shrink-0">
            <span className="text-slate-500">신용카드/간편결제(PG)를 원하시나요?</span>
            <button
              type="button"
              onClick={onSwitchToPgModal}
              className="text-indigo-600 hover:text-indigo-800 font-extrabold flex items-center gap-0.5 cursor-pointer underline"
            >
              <span>PG 결제창 열기</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
