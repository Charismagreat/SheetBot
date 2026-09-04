"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import {
  ShieldAlert,
  MessageSquare,
  Star,
  HelpCircle,
  FileText,
  CheckCircle2,
  Clock,
  Trash2,
  Send,
  Plus,
  Edit2,
  RefreshCw,
  ExternalLink,
  Check,
  X
} from "lucide-react";

type TabType = "inquiries" | "reviews" | "faqs" | "tax_invoices";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("inquiries");
  const [loading, setLoading] = useState<boolean>(true);

  // 데이터 상태
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [taxInvoices, setTaxInvoices] = useState<any[]>([]);

  // 문의 답변 모달
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);

  // FAQ 추가/수정 모달
  const [faqModalOpen, setFaqModalOpen] = useState<boolean>(false);
  const [editingFaq, setEditingFaq] = useState<any | null>(null);
  const [faqForm, setFaqForm] = useState({
    category: "시작하기",
    question: "",
    answer: "",
    sort_order: 1,
  });
  const [submittingFaq, setSubmittingFaq] = useState<boolean>(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchInquiries(),
        fetchReviews(),
        fetchFaqs(),
        fetchTaxInvoices(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchInquiries = async () => {
    try {
      const res = await fetch("/api/admin/inquiries");
      const data = await res.json();
      if (data.success) setInquiries(data.inquiries || []);
    } catch (e) {
      console.warn("Failed to fetch admin inquiries", e);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch("/api/admin/reviews");
      const data = await res.json();
      if (data.success) setReviews(data.reviews || []);
    } catch (e) {
      console.warn("Failed to fetch admin reviews", e);
    }
  };

  const fetchFaqs = async () => {
    try {
      const res = await fetch("/api/admin/faqs");
      const data = await res.json();
      if (data.success) setFaqs(data.faqs || []);
    } catch (e) {
      console.warn("Failed to fetch admin faqs", e);
    }
  };

  const fetchTaxInvoices = async () => {
    try {
      const res = await fetch("/api/admin/tax-invoices");
      const data = await res.json();
      if (data.success) setTaxInvoices(data.invoices || []);
    } catch (e) {
      console.warn("Failed to fetch admin tax invoices", e);
    }
  };

  // 1. 문의 답변 저장
  const handleSaveAnswer = async () => {
    if (!selectedInquiry || !answerInput.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await fetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          answer: answerInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "답변이 등록되었습니다.");
        setSelectedInquiry(null);
        setAnswerInput("");
        fetchInquiries();
      } else {
        alert(data.error || "답변 등록 실패");
      }
    } catch (e: any) {
      alert("네트워크 오류: " + e.message);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // 문의 삭제
  const handleDeleteInquiry = async (id: string) => {
    if (!confirm("해당 문의를 삭제 처리하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/inquiries?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchInquiries();
      }
    } catch (e) {
      alert("삭제 실패");
    }
  };

  // 2. 후기 삭제/블라인드
  const handleDeleteReview = async (id: string) => {
    if (!confirm("이 사용 후기를 블라인드(삭제) 처리하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/reviews?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchReviews();
      }
    } catch (e) {
      alert("처리 실패");
    }
  };

  // 3. FAQ 저장 (신규/수정)
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
        setFaqModalOpen(false);
        setEditingFaq(null);
        setFaqForm({ category: "시작하기", question: "", answer: "", sort_order: 1 });
        fetchFaqs();
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setSubmittingFaq(false);
    }
  };

  // FAQ 삭제
  const handleDeleteFaq = async (id: string) => {
    if (!confirm("해당 FAQ 항목을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/faqs?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchFaqs();
    } catch (e) {
      alert("삭제 실패");
    }
  };

  // 4. 세금계산서 상태 변경
  const handleUpdateInvoiceStatus = async (id: string, status: "ISSUED" | "REJECTED") => {
    const actionName = status === "ISSUED" ? "발행 완료" : "반려";
    if (!confirm(`해당 신청을 [${actionName}] 처리하시겠습니까?`)) return;
    try {
      const res = await fetch("/api/admin/tax-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchTaxInvoices();
      }
    } catch (e) {
      alert("처리 실패");
    }
  };

  // 통계 계산
  const pendingInquiriesCount = inquiries.filter((i) => i.status === "PENDING").length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
    : "5.0";
  const requestedTaxCount = taxInvoices.filter((t) => t.status === "REQUESTED").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* 상단 타이틀 & 서머리 카드 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200/60 mb-2">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>통합 운영 관리 센터 (Admin)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              SheetBot 데이터 및 고객 관리 대시보드
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              1:1 문의 답변, 후기 검수, FAQ 항목 편집 및 세금계산서 발행 승인을 실시간으로 관리합니다.
            </p>
          </div>

          <button
            onClick={fetchAllData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 shadow-xs hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            <span>새로고침</span>
          </button>
        </div>

        {/* 4대 주요 지표 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">답변 대기 문의</span>
              <MessageSquare className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {pendingInquiriesCount}
              <span className="text-xs font-normal text-slate-400 ml-1">/ 총 {inquiries.length}건</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">누적 사용 후기</span>
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {reviews.length}
              <span className="text-xs font-normal text-slate-400 ml-1">건 (평균 ★{avgRating})</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">활성 FAQ 항목</span>
              <HelpCircle className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {faqs.length}
              <span className="text-xs font-normal text-slate-400 ml-1">개 등록됨</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">세금계산서 요청</span>
              <FileText className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">
              {requestedTaxCount}
              <span className="text-xs font-normal text-slate-400 ml-1">/ 총 {taxInvoices.length}건</span>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("inquiries")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "inquiries"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>1:1 고객 문의 관리</span>
            {pendingInquiriesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {pendingInquiriesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("reviews")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "reviews"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Star className="w-4 h-4" />
            <span>사용 후기 관리 ({reviews.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("faqs")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "faqs"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>FAQ 항목 편집 ({faqs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("tax_invoices")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "tax_invoices"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>세금계산서/현금영수증 발행 ({taxInvoices.length})</span>
            {requestedTaxCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {requestedTaxCount}
              </span>
            )}
          </button>
        </div>

        {/* 1. 1:1 고객 문의 탭 내용 */}
        {activeTab === "inquiries" && (
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
          </div>
        )}

        {/* 2. 사용 후기 관리 탭 */}
        {activeTab === "reviews" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-bold text-slate-700">고객 사용 후기 및 평점 내역</span>
              <span className="text-xs text-slate-400">총 {reviews.length}개</span>
            </div>

            {reviews.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                등록된 사용 후기가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">평점</th>
                      <th className="py-3 px-4">작성자</th>
                      <th className="py-3 px-4">활용 용도</th>
                      <th className="py-3 px-4">후기 제목 및 내용</th>
                      <th className="py-3 px-4">작성일시</th>
                      <th className="py-3 px-4 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reviews.map((rev) => (
                      <tr key={rev.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-yellow-500 font-bold">
                            <Star className="w-3.5 h-3.5 fill-yellow-400" />
                            <span>{rev.rating || 5}점</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{rev.user_name || "고객"}</div>
                          <div className="text-[11px] text-slate-400">{rev.user_email}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium text-[11px]">
                            {rev.use_case || "일반 시트 자동화"}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <div className="font-bold text-slate-900">{rev.title}</div>
                          <div className="text-slate-500 mt-1 line-clamp-2">{rev.content}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {rev.created_at ? rev.created_at.slice(0, 16).replace("T", " ") : "-"}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteReview(rev.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> 블라인드
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. FAQ 항목 편집 탭 */}
        {activeTab === "faqs" && (
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
          </div>
        )}

        {/* 4. 세금계산서/현금영수증 발행 탭 */}
        {activeTab === "tax_invoices" && (
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
        )}
      </main>

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
