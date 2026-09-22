import React, { useState } from "react";
import { FileText, X, Loader2, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PaymentOrder } from "@/lib/data/pricing";

interface InvoiceModalProps {
  order: PaymentOrder | null;
  onClose: () => void;
}

export default function InvoiceModal({ order, onClose }: InvoiceModalProps) {
  const [taxSubmitting, setTaxSubmitting] = useState(false);
  const [taxForm, setTaxForm] = useState({
    type: "TAX_INVOICE" as "TAX_INVOICE" | "CASH_RECEIPT",
    companyName: "",
    bizNumber: "",
    ceoName: "",
    managerEmail: "",
  });

  if (!order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setTaxSubmitting(true);
      const res = await apiFetch("/api/wallet/tax-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.order_id,
          type: taxForm.type,
          companyName: taxForm.companyName,
          bizNumber: taxForm.bizNumber,
          ceoName: taxForm.ceoName,
          managerEmail: taxForm.managerEmail,
          amountKrw: order.amount_krw,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        onClose();
      } else {
        alert(data.error || "신청에 실패했습니다.");
      }
    } catch (err: any) {
      alert("신청 오류: " + err.message);
    } finally {
      setTaxSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative">
        <div className="p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-100" />
            <h3 className="text-sm font-extrabold">세금계산서 / 현금영수증 신청</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>신청 대상 주문</span>
              <span className="font-bold text-slate-800">{order.order_id}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>결제 금액</span>
              <span className="font-black text-amber-600">{order.amount_krw.toLocaleString()}원</span>
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
  );
}
