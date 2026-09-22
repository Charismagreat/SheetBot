import React, { useState, useEffect } from "react";
import { Coins, X, Check, CheckCircle2, ChevronRight, Smartphone, Loader2, CreditCard } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PaymentPackage } from "@/lib/data/pricing";

interface PaymentSimulatorModalProps {
  pkg: PaymentPackage | null;
  selectedMethod: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function PaymentSimulatorModal({
  pkg,
  selectedMethod,
  onClose,
  onSuccess,
}: PaymentSimulatorModalProps) {
  const [modalStep, setModalStep] = useState<"select" | "processing" | "done">("select");
  const [pgAgency, setPgAgency] = useState("토스페이");
  const [paymentMode, setPaymentMode] = useState<"simulation" | "portone">("simulation");
  const [portoneCode, setPortoneCode] = useState("");
  const [portonePg, setPortonePg] = useState("html5_inicis");
  const [, setShowPortoneConfig] = useState(false);

  // 포트원(PortOne v1/v2) 브라우저 SDK 동적 로드
  useEffect(() => {
    if (typeof window !== "undefined" && !(window as any).IMP) {
      const script = document.createElement("script");
      script.src = "https://cdn.iamport.kr/v1/iamport.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (pkg) {
      setModalStep("select");
      setPgAgency(selectedMethod.includes("간편") ? "토스페이" : "신용/체크카드");
    }
  }, [pkg, selectedMethod]);

  if (!pkg) return null;

  const executePortOnePayment = () => {
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
      IMP.init(targetCode);
      const merchantUid = `mid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      IMP.request_pay(
        {
          pg: portonePg,
          pay_method: "card",
          merchant_uid: merchantUid,
          name: `SheetBot ${pkg.name}`,
          amount: pkg.priceKrw,
          buyer_email: "test_customer@gmail.com",
          buyer_name: "시트봇 테스트 회원",
          buyer_tel: "010-1234-5678",
        },
        async (rsp: any) => {
          if (rsp.success) {
            setModalStep("processing");
            try {
              const res = await apiFetch("/api/wallet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  packageId: pkg.id,
                  paymentMethod: `포트원 이니시스 (승인번호: ${rsp.imp_uid || "IMP_TEST"})`,
                }),
              });
              const data = await res.json();
              if (data.success) {
                setModalStep("done");
                setTimeout(() => {
                  onSuccess(data.message);
                  onClose();
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
    try {
      setModalStep("processing");
      await new Promise((resolve) => setTimeout(resolve, 1600));

      const res = await apiFetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          paymentMethod: `${selectedMethod} (${pgAgency})`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setModalStep("done");
        setTimeout(() => {
          onSuccess(data.message);
          onClose();
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
            onClick={onClose}
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
              <span className="font-bold text-slate-800">{pkg.name}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>충전 토큰 수량</span>
              <span className="font-bold text-amber-600">
                +{pkg.totalTokens.toLocaleString()} Tokens
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-extrabold text-slate-800">최종 결제 금액</span>
              <span className="text-xl font-black text-slate-900">
                {pkg.priceKrw.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* 모달 탭 선택 */}
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

                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/60 text-[11px] text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>별도 PG 가입 없이 카드사 승인/토큰 충전/영수증 출력을 즉시 검증할 수 있습니다.</span>
                  </div>

                  <button
                    onClick={executeSimulatedPayment}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>{pgAgency}로 {pkg.priceKrw.toLocaleString()}원 결제 승인하기</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
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
                  +{pkg.totalTokens.toLocaleString()} 토큰이 지갑에 즉시 반영되었습니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
