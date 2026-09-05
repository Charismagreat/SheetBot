"use client";

import { apiFetch } from '@/lib/api';
import React from "react";
import { CheckCircle2, X, Clock, Check } from "lucide-react";

interface AdminTaxInvoicesTabProps {
  taxInvoices: any[];
  onRefresh: () => void;
}

export default function AdminTaxInvoicesTab({
  taxInvoices,
  onRefresh,
}: AdminTaxInvoicesTabProps) {
  const handleUpdateInvoiceStatus = async (id: string, status: "ISSUED" | "REJECTED") => {
    const actionName = status === "ISSUED" ? "발행 완료" : "반려";
    if (!confirm(`해당 신청을 [${actionName}] 처리하시겠습니까?`)) return;
    try {
      const res = await apiFetch("/api/admin/tax-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        onRefresh();
      }
    } catch {
      alert("처리 실패");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <span className="text-xs font-bold text-slate-700">세금계산서 및 현금영수증 신청 대장</span>
        <span className="text-xs text-slate-400">총 {taxInvoices.length}건</span>
      </div>

      {taxInvoices.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          신청된 세금계산서/현금영수증 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">상태</th>
                <th className="py-3 px-4">구분</th>
                <th className="py-3 px-4">신청자/회사명</th>
                <th className="py-3 px-4">사업자번호/주민번호</th>
                <th className="py-3 px-4">담당자 이메일</th>
                <th className="py-3 px-4">신청금액</th>
                <th className="py-3 px-4">신청일시</th>
                <th className="py-3 px-4 text-right">발행 처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {taxInvoices.map((inv) => {
                const isIssued = inv.status === "ISSUED";
                const isRejected = inv.status === "REJECTED";
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isIssued ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> 발행완료
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">
                          <X className="w-3 h-3" /> 반려됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                          <Clock className="w-3 h-3" /> 신청접수
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-700">
                      {inv.type === "TAX_INVOICE" ? "세금계산서" : "현금영수증"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{inv.company_name || "-"}</div>
                      <div className="text-[11px] text-slate-400">대표: {inv.ceo_name || "-"}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {inv.biz_number}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {inv.manager_email}
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                      ₩{Number(inv.amount_krw || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {inv.created_at ? inv.created_at.slice(0, 16).replace("T", " ") : "-"}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      {!isIssued && (
                        <button
                          onClick={() => handleUpdateInvoiceStatus(inv.id, "ISSUED")}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer shadow-xs inline-flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> 발행완료
                        </button>
                      )}
                      {!isRejected && (
                        <button
                          onClick={() => handleUpdateInvoiceStatus(inv.id, "REJECTED")}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-bold text-[11px] cursor-pointer"
                        >
                          반려
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
