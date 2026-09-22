import React from "react";
import { Receipt, Printer, X } from "lucide-react";
import { PaymentOrder } from "@/lib/data/pricing";

interface ReceiptModalProps {
  order: PaymentOrder | null;
  userTier: string;
  onClose: () => void;
}

export default function ReceiptModal({ order, userTier, onClose }: ReceiptModalProps) {
  if (!order) return null;

  return (
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
              onClick={onClose}
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
              <div>주문번호: {order.order_id}</div>
              <div>결제일시: {order.created_at ? order.created_at.replace("T", " ").substring(0, 19) : "-"}</div>
              <div>회원계정: {userTier} 회원</div>
              <div>결제수단: {order.payment_method}</div>
            </div>
          </div>

          {/* 금액 상세 */}
          <div className="space-y-2 py-2">
            <div className="flex justify-between">
              <span className="text-slate-500">품명 (상품명)</span>
              <span className="font-bold text-slate-900">{order.package_name} (+{order.tokens_credited.toLocaleString()} Tokens)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">공급가액</span>
              <span>{Math.round(order.amount_krw / 1.1).toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">부가가치세 (VAT 10%)</span>
              <span>{(order.amount_krw - Math.round(order.amount_krw / 1.1)).toLocaleString()}원</span>
            </div>
            <div className="pt-3 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black">
              <span>합계 결제 금액</span>
              <span className="text-base text-indigo-600">{order.amount_krw.toLocaleString()}원</span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
            본 영수증은 전자상거래 등에서의 소비자보호에 관한 법률 및 부가가치세법에 따라 매입세액공제용 영수증으로 활용 가능합니다.
          </div>
        </div>
      </div>
    </div>
  );
}
