"use client";

import { apiFetch } from '@/lib/api';
import React, { useState } from "react";
import { CheckCircle2, Clock, Trash2, Send } from "lucide-react";

interface AdminInquiriesTabProps {
  inquiries: any[];
  onRefresh: () => void;
}

export default function AdminInquiriesTab({
  inquiries,
  onRefresh,
}: AdminInquiriesTabProps) {
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);

  const handleSaveAnswer = async () => {
    if (!selectedInquiry || !answerInput.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await apiFetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          answer: answerInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("답변이 성공적으로 등록되었습니다.");
        setSelectedInquiry(null);
        setAnswerInput("");
        onRefresh();
      } else {
        alert(data.error || "답변 등록 실패");
      }
    } catch {
      alert("네트워크 오류");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleDeleteInquiry = async (id: string) => {
    if (!confirm("이 문의 내역을 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(`/api/admin/inquiries?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) onRefresh();
    } catch {
      alert("삭제 실패");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <span className="text-xs font-bold text-slate-700">고객 1:1 문의 접수 내역</span>
        <span className="text-xs text-slate-400">총 {inquiries.length}건</span>
      </div>

      {inquiries.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          접수된 1:1 문의가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">상태</th>
                <th className="py-3 px-4">카테고리</th>
                <th className="py-3 px-4">작성자</th>
                <th className="py-3 px-4">제목 및 내용</th>
                <th className="py-3 px-4">접수일시</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inquiries.map((inq) => {
                const isAnswered = inq.status === "ANSWERED";
                return (
                  <tr key={inq.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isAnswered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> 답변완료
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                          <Clock className="w-3 h-3" /> 답변대기
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-600 whitespace-nowrap">
                      {inq.category}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{inq.user_name || "익명"}</div>
                      <div className="text-[11px] text-slate-400">{inq.user_email}</div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-bold text-slate-900 line-clamp-1">{inq.title}</div>
                      <div className="text-slate-500 line-clamp-2 mt-0.5">{inq.content}</div>
                      {inq.answer && (
                        <div className="mt-2 p-2 rounded-lg bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900">
                          <span className="font-bold">관리자 답변:</span> {inq.answer}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {inq.created_at ? inq.created_at.slice(0, 16).replace("T", " ") : "-"}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => {
                          setSelectedInquiry(inq);
                          setAnswerInput(inq.answer || "");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] cursor-pointer"
                      >
                        {isAnswered ? "답변 수정" : "답변 작성"}
                      </button>
                      <button
                        onClick={() => handleDeleteInquiry(inq.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 1:1 문의 답변 모달 */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {selectedInquiry.category}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedInquiry.title}
                </h3>
                <p className="text-xs text-slate-400">
                  작성자: {selectedInquiry.user_email} ({selectedInquiry.user_name || "고객"})
                </p>
              </div>
              <button
                onClick={() => setSelectedInquiry(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 whitespace-pre-line max-h-40 overflow-y-auto">
              {selectedInquiry.content}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">관리자 답변 내용</label>
              <textarea
                rows={5}
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                placeholder="고객에게 전달할 상세 답변을 입력해 주세요. 등록 즉시 고객 문의 내역에 반영됩니다."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedInquiry(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSaveAnswer}
                disabled={submittingAnswer || !answerInput.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submittingAnswer ? "등록 중..." : "답변 저장 및 완료"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
