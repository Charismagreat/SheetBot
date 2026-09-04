"use client";

import React, { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface AdminFaqsTabProps {
  faqs: any[];
  onRefresh: () => void;
}

export default function AdminFaqsTab({ faqs, onRefresh }: AdminFaqsTabProps) {
  const [faqModalOpen, setFaqModalOpen] = useState<boolean>(false);
  const [editingFaq, setEditingFaq] = useState<any | null>(null);
  const [faqForm, setFaqForm] = useState({
    category: "시작하기",
    question: "",
    answer: "",
    sort_order: 1,
  });
  const [submittingFaq, setSubmittingFaq] = useState<boolean>(false);

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      alert("질문과 답변을 모두 입력해 주세요.");
      return;
    }
    setSubmittingFaq(true);
    try {
      const method = editingFaq ? "PUT" : "POST";
      const body = editingFaq ? { id: editingFaq.id, ...faqForm } : faqForm;
      const res = await fetch("/api/admin/faqs", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setFaqModalOpen(false);
        setEditingFaq(null);
        setFaqForm({ category: "시작하기", question: "", answer: "", sort_order: 1 });
        onRefresh();
      } else {
        alert(data.error || "저장 실패");
      }
    } catch {
      alert("오류가 발생했습니다.");
    } finally {
      setSubmittingFaq(false);
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (!confirm("정말 이 FAQ 항목을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/faqs?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert("FAQ가 삭제되었습니다.");
        onRefresh();
      }
    } catch {
      alert("삭제 실패");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">
          FAQ 페이지에 노출되는 질문 및 답변을 직접 수정하거나 추가할 수 있습니다.
        </p>
        <button
          onClick={() => {
            setEditingFaq(null);
            setFaqForm({ category: "시작하기", question: "", answer: "", sort_order: faqs.length + 1 });
            setFaqModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" /> FAQ 신규 등록
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-16">순서</th>
                <th className="py-3 px-4 w-32">카테고리</th>
                <th className="py-3 px-4">질문 (Question)</th>
                <th className="py-3 px-4 max-w-md">답변 (Answer)</th>
                <th className="py-3 px-4 text-right w-24">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faqs.map((faq, idx) => (
                <tr key={faq.id || idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-400">
                    {faq.sort_order ?? idx + 1}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[11px]">
                      {faq.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {faq.question || faq.q}
                  </td>
                  <td className="py-3 px-4 text-slate-600 line-clamp-2">
                    {faq.answer || faq.a}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                    <button
                      onClick={() => {
                        setEditingFaq(faq);
                        setFaqForm({
                          category: faq.category || "시작하기",
                          question: faq.question || faq.q || "",
                          answer: faq.answer || faq.a || "",
                          sort_order: faq.sort_order || idx + 1,
                        });
                        setFaqModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                      title="수정"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteFaq(faq.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ 등록/수정 모달 */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveFaq} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900">
                {editingFaq ? "FAQ 항목 수정" : "신규 FAQ 항목 등록"}
              </h3>
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">카테고리</label>
                <select
                  value={faqForm.category}
                  onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })}
                  className="w-full text-xs p-2.5 mt-1 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 cursor-pointer"
                >
                  <option value="시작하기">시작하기</option>
                  <option value="토큰/결제">토큰/결제</option>
                  <option value="Apps Script/기능">Apps Script/기능</option>
                  <option value="보안/계정">보안/계정</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">노출 순서 (정렬 번호)</label>
                <input
                  type="number"
                  value={faqForm.sort_order}
                  onChange={(e) => setFaqForm({ ...faqForm, sort_order: Number(e.target.value) })}
                  className="w-full text-xs p-2.5 mt-1 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">질문 (Question)</label>
              <input
                type="text"
                value={faqForm.question}
                onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                placeholder="예: 코딩을 모르는 비개발자도 쓸 수 있나요?"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">답변 (Answer)</label>
              <textarea
                rows={5}
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                placeholder="상세한 답변 내용을 작성해 주세요."
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 resize-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFaqModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submittingFaq}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {submittingFaq ? "저장 중..." : "저장 완료"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
