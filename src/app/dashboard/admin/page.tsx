"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import {
  Users,
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
  Coins,
  Search,
  Filter,
  Check,
  X,
  ShieldCheck,
  Ban,
  UserCheck,
  Eye,
  CreditCard,
  Layers,
  Sparkles,
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  Save,
  Share2
} from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo, SnsChannel } from "@/lib/default-footer";
import { SnsIcon } from "@/components/SnsIcons";

type TabType = "users" | "inquiries" | "reviews" | "faqs" | "tax_invoices" | "footer";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>("users");
  const [loading, setLoading] = useState<boolean>(true);

  // 데이터 상태
  const [users, setUsers] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [taxInvoices, setTaxInvoices] = useState<any[]>([]);

  // 푸터 설정 상태
  const [footerForm, setFooterForm] = useState<FooterInfo>(DEFAULT_FOOTER);
  const [savingFooter, setSavingFooter] = useState<boolean>(false);

  // 회원 검색 & 필터
  const [userSearch, setUserSearch] = useState<string>("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");

  // 토큰 조정 모달
  const [tokenModalUser, setTokenModalUser] = useState<any | null>(null);
  const [tokenActionType, setTokenActionType] = useState<"GRANT" | "DEDUCT">("GRANT");
  const [tokenAmount, setTokenAmount] = useState<number>(10000);
  const [tokenReason, setTokenReason] = useState<string>("신규 가입 프로모션 보너스");
  const [submittingToken, setSubmittingToken] = useState<boolean>(false);

  // 회원 상세 모달
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [editTier, setEditTier] = useState<string>("FREE");
  const [editRole, setEditRole] = useState<string>("USER");
  const [editNote, setEditNote] = useState<string>("");
  const [savingUserMeta, setSavingUserMeta] = useState<boolean>(false);

  // 후기 첨부 사진 크게 보기 상태
  const [selectedReviewImage, setSelectedReviewImage] = useState<string | null>(null);

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
        fetchUsers(),
        fetchInquiries(),
        fetchReviews(),
        fetchFaqs(),
        fetchTaxInvoices(),
        fetchFooterSettings(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (e) {
      console.warn("Failed to fetch admin users", e);
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

  const fetchFooterSettings = async () => {
    try {
      const res = await fetch("/api/admin/footer");
      const data = await res.json();
      if (data.success && data.footer) {
        setFooterForm(data.footer);
      }
    } catch (e) {
      console.warn("Failed to fetch footer settings", e);
    }
  };

  // 1. 회원 상태 변경 (정상 <-> 정지)
  const handleToggleUserStatus = async (user: any) => {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const actionLabel = nextStatus === "SUSPENDED" ? "이용 정지" : "정상 복구";
    if (!confirm(`${user.email} 회원을 [${actionLabel}] 처리하시겠습니까?`)) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchUsers();
      } else {
        alert(data.error || "상태 변경 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  // 2. 회원 상세 정보 저장 (등급, 권한, 메모)
  const handleSaveUserMeta = async () => {
    if (!detailUser) return;
    setSavingUserMeta(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: detailUser.email,
          tier: editTier,
          role: editRole,
          note: editNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("회원 정보가 저장되었습니다.");
        setDetailUser(null);
        fetchUsers();
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSavingUserMeta(false);
    }
  };

  // 3. 토큰 수동 지급/차감 실행
  const handleAdjustTokens = async () => {
    if (!tokenModalUser || tokenAmount <= 0) {
      alert("0보다 큰 토큰 수량을 입력해 주세요.");
      return;
    }
    const delta = tokenActionType === "GRANT" ? tokenAmount : -tokenAmount;
    setSubmittingToken(true);
    try {
      const res = await fetch("/api/admin/users/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: tokenModalUser.email,
          amount: delta,
          reason: tokenReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setTokenModalUser(null);
        fetchUsers();
      } else {
        alert(data.error || "토큰 조정 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSubmittingToken(false);
    }
  };

  // 4. 푸터 설정 저장
  const handleSaveFooter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFooter(true);
    try {
      const res = await fetch("/api/admin/footer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(footerForm),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "푸터 정보가 성공적으로 저장되었습니다.");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("sheetbot-footer-updated"));
        }
      } else {
        alert(data.error || "푸터 저장 실패");
      }
    } catch (e: any) {
      alert("저장 오류: " + e.message);
    } finally {
      setSavingFooter(false);
    }
  };

  // SNS 채널 조작 함수들
  const handleAddSnsChannel = () => {
    const newChan: SnsChannel = {
      id: `sns_${Date.now()}`,
      type: "custom",
      name: "새 채널",
      url: "https://",
      enabled: true,
    };
    setFooterForm((prev) => ({
      ...prev,
      sns_channels: [...(prev.sns_channels || []), newChan],
    }));
  };

  const handleUpdateSnsChannel = (id: string, updates: Partial<SnsChannel>) => {
    setFooterForm((prev) => ({
      ...prev,
      sns_channels: (prev.sns_channels || []).map((ch) =>
        ch.id === id ? { ...ch, ...updates } : ch
      ),
    }));
  };

  const handleDeleteSnsChannel = (id: string) => {
    setFooterForm((prev) => ({
      ...prev,
      sns_channels: (prev.sns_channels || []).filter((ch) => ch.id !== id),
    }));
  };

  // 5. 문의 답변 저장
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
      if (data.success) fetchInquiries();
    } catch (e) {
      alert("삭제 실패");
    }
  };

  // 6. 후기 삭제/블라인드
  const handleDeleteReview = async (id: string) => {
    if (!confirm("이 사용 후기를 블라인드(삭제) 처리하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/reviews?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchReviews();
    } catch (e) {
      alert("처리 실패");
    }
  };

  // 7. FAQ 저장
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

  // 8. 세금계산서 상태 변경
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
  const totalUsersCount = users.length;
  const proUsersCount = users.filter((u) => u.tier === "PRO" || u.tier === "ENTERPRISE").length;
  const pendingInquiriesCount = inquiries.filter((i) => i.status === "PENDING").length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
    : "5.0";
  const requestedTaxCount = taxInvoices.filter((t) => t.status === "REQUESTED").length;

  // 회원 필터링
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase()));
    const matchesTier = tierFilter === "ALL" ? true : u.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const getSnsIconSmall = (type: SnsChannel["type"]) => {
    return <SnsIcon type={type} className="w-3.5 h-3.5" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* 상단 헤더 & 새로고침 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200/60 mb-2">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>통합 운영 관리 센터 (Admin Console)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              SheetBot 전체 데이터 및 운영 관리 대시보드
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              회원 관리, 토큰 지급, 1:1 문의, 사용 후기, FAQ, 세금계산서, 푸터 회사 정보 및 SNS 채널 설정을 한곳에서 통제합니다.
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

        {/* 5대 주요 지표 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">총 가입 회원</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {totalUsersCount}
              <span className="text-xs font-normal text-slate-400 ml-1">명</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">유료 Pro 회원</span>
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-purple-700">
              {proUsersCount}
              <span className="text-xs font-normal text-slate-400 ml-1">명 ({(proUsersCount / Math.max(1, totalUsersCount) * 100).toFixed(0)}%)</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">답변 대기 문의</span>
              <MessageSquare className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {pendingInquiriesCount}
              <span className="text-xs font-normal text-slate-400 ml-1">/ {inquiries.length}건</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">사용 후기 / 평점</span>
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {reviews.length}
              <span className="text-xs font-normal text-slate-400 ml-1">건 (★{avgRating})</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1 col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold text-slate-500">세금계산서 요청</span>
              <FileText className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900">
              {requestedTaxCount}
              <span className="text-xs font-normal text-slate-400 ml-1">/ {taxInvoices.length}건</span>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "users"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>👥 회원 계정 관리 ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("inquiries")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "inquiries"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>1:1 고객 문의 ({inquiries.length})</span>
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
            <span>세금계산서 발행 ({taxInvoices.length})</span>
            {requestedTaxCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {requestedTaxCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("footer")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "footer"
                ? "bg-slate-800 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>🏢 푸터 / 회사정보 &amp; SNS 설정</span>
          </button>
        </div>

        {/* 0. 회원 관리 탭 내용 */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {/* 검색 및 필터 바 */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="이메일 또는 이름으로 검색..."
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-slate-400 font-bold">등급:</span>
                {["ALL", "FREE", "PRO", "ENTERPRISE"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTierFilter(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      tierFilter === t
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t === "ALL" ? "전체" : t}
                  </button>
                ))}
              </div>
            </div>

            {/* 회원 대장 테이블 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold text-slate-700">전체 등록 회원 대장</span>
                <span className="text-xs text-slate-400">총 {filteredUsers.length}명 표시 중</span>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  검색 조건에 일치하는 회원이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">회원 정보</th>
                        <th className="py-3 px-4">권한/등급</th>
                        <th className="py-3 px-4">토큰 잔액</th>
                        <th className="py-3 px-4">프로젝트</th>
                        <th className="py-3 px-4">총 결제액</th>
                        <th className="py-3 px-4">계정 상태</th>
                        <th className="py-3 px-4">가입일</th>
                        <th className="py-3 px-4 text-right">회원 관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const isSuspended = u.status === "SUSPENDED";
                        const isAdmin = u.role === "ADMIN";
                        return (
                          <tr key={u.email} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{u.name || "사용자"}</span>
                                {isAdmin && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 font-bold text-[10px]">
                                    관리자
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                                  u.tier === "PRO"
                                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                                    : u.tier === "ENTERPRISE"
                                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {u.tier}
                              </span>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-mono font-bold text-slate-900">
                                {Number(u.balanceTokens || 0).toLocaleString()} <span className="text-[10px] text-slate-400">P</span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                구매 {Number(u.totalPurchasedTokens || 0).toLocaleString()}
                              </div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-bold text-slate-700">{u.projectCount}개</span>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-black text-slate-900">
                                ₩{Number(u.totalSpentKrw || 0).toLocaleString()}
                              </span>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              {isSuspended ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">
                                  <Ban className="w-3 h-3" /> 이용정지
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                                  <UserCheck className="w-3 h-3" /> 정상
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                              {u.createdAt ? u.createdAt.slice(0, 10) : "-"}
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                              {/* 토큰 지급 버튼 */}
                              <button
                                onClick={() => {
                                  setTokenModalUser(u);
                                  setTokenActionType("GRANT");
                                  setTokenAmount(10000);
                                  setTokenReason("신규 가입 프로모션 보너스");
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1 border border-amber-200/70"
                                title="토큰 수동 지급/차감"
                              >
                                <Coins className="w-3 h-3 text-amber-600" />
                                <span>토큰 조정</span>
                              </button>

                              {/* 상세 정보 버튼 */}
                              <button
                                onClick={() => {
                                  setDetailUser(u);
                                  setEditTier(u.tier || "FREE");
                                  setEditRole(u.role || "USER");
                                  setEditNote(u.note || "");
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer inline-flex items-center gap-1"
                                title="상세 정보 및 이력"
                              >
                                <Eye className="w-3 h-3 text-slate-500" />
                                <span>상세</span>
                              </button>

                              {/* 계정 정지/해제 토글 */}
                              <button
                                onClick={() => handleToggleUserStatus(u)}
                                className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                                  isSuspended
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                }`}
                                title={isSuspended ? "계정 정상 복구" : "계정 이용 정지"}
                              >
                                {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
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
          </div>
        )}

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
                      <th className="py-3 px-4">후기 제목 및 내용 (사진 첨부)</th>
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
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{rev.title}</span>
                            {rev.image_url && (
                              <button
                                type="button"
                                onClick={() => setSelectedReviewImage(rev.image_url)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] cursor-pointer border border-indigo-200"
                                title="첨부 사진 크게 보기"
                              >
                                📷 사진 첨부
                              </button>
                            )}
                          </div>
                          <div className="text-slate-500 mt-1 line-clamp-2">{rev.content}</div>
                          {rev.image_url && (
                            <div className="mt-2">
                              <img
                                src={rev.image_url}
                                alt="후기 사진"
                                onClick={() => setSelectedReviewImage(rev.image_url)}
                                className="w-16 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                              />
                            </div>
                          )}
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

        {/* 5. 푸터 / 회사정보 & SNS 설정 탭 */}
        {activeTab === "footer" && (
          <form onSubmit={handleSaveFooter} className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <span>푸터 영역 회사 정보 및 공식 SNS 채널 관리</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  서비스 하단 푸터에 표시되는 사업자등록정보, 고객센터 연락처, 소개글 및 공식 SNS 채널(유튜브, 인스타 등)을 실시간 관리합니다.
                </p>
              </div>

              <button
                type="submit"
                disabled={savingFooter}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>{savingFooter ? "저장 중..." : "설정 저장 완료"}</span>
              </button>
            </div>

            {/* 공식 SNS 채널 관리 카드 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Share2 className="w-4 h-4 text-indigo-600" />
                    <span>공식 SNS 채널 바로가기 설정</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    푸터 1열 브랜드 소개 하단에 노출될 소셜 미디어(SNS) 링크를 켜고 끄거나 새로 추가할 수 있습니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddSnsChannel}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer border border-indigo-200/60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ SNS 채널 추가</span>
                </button>
              </div>

              {(!footerForm.sns_channels || footerForm.sns_channels.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  등록된 SNS 채널이 없습니다. [+ SNS 채널 추가] 버튼을 눌러 채널을 등록해 보세요.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {footerForm.sns_channels.map((ch) => (
                    <div
                      key={ch.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        ch.enabled
                          ? "bg-slate-50/70 border-slate-200"
                          : "bg-slate-100/50 border-slate-200 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1">
                        <span className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                          {getSnsIconSmall(ch.type)}
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                          {/* 채널 종류 */}
                          <select
                            value={ch.type}
                            onChange={(e) =>
                              handleUpdateSnsChannel(ch.id, {
                                type: e.target.value as SnsChannel["type"],
                              })
                            }
                            className="text-xs p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="youtube">유튜브 (YouTube)</option>
                            <option value="instagram">인스타그램 (Instagram)</option>
                            <option value="blog">블로그 (Naver/Tistory)</option>
                            <option value="github">깃허브 (GitHub)</option>
                            <option value="kakao">카카오톡 채널</option>
                            <option value="twitter">X (트위터)</option>
                            <option value="custom">기타 웹사이트</option>
                          </select>

                          {/* 채널명 */}
                          <input
                            type="text"
                            value={ch.name}
                            onChange={(e) => handleUpdateSnsChannel(ch.id, { name: e.target.value })}
                            placeholder="채널 표시 이름"
                            className="text-xs p-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-800"
                          />

                          {/* URL */}
                          <input
                            type="url"
                            value={ch.url}
                            onChange={(e) => handleUpdateSnsChannel(ch.id, { url: e.target.value })}
                            placeholder="https://..."
                            className="text-xs p-2 rounded-lg border border-slate-200 bg-white font-mono text-slate-600"
                          />
                        </div>
                      </div>

                      {/* 활성화 토글 & 삭제 */}
                      <div className="flex items-center justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleUpdateSnsChannel(ch.id, { enabled: !ch.enabled })}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 ${
                            ch.enabled
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                          }`}
                        >
                          {ch.enabled ? "노출 ON" : "숨김 OFF"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSnsChannel(ch.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="채널 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 좌측: 사업자 기본 정보 입력 카드 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>사업자등록 및 법적 표기 정보</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">상호명 (법인명) *</label>
                    <input
                      type="text"
                      required
                      value={footerForm.company_name}
                      onChange={(e) => setFooterForm({ ...footerForm, company_name: e.target.value })}
                      placeholder="예: 시트봇 (SheetBot Co., Ltd.)"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">대표자명 *</label>
                    <input
                      type="text"
                      required
                      value={footerForm.ceo_name}
                      onChange={(e) => setFooterForm({ ...footerForm, ceo_name: e.target.value })}
                      placeholder="예: 홍길동 대표이사"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">사업자등록번호 *</label>
                    <input
                      type="text"
                      required
                      value={footerForm.biz_number}
                      onChange={(e) => setFooterForm({ ...footerForm, biz_number: e.target.value })}
                      placeholder="예: 123-45-67890"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">통신판매업 신고번호 *</label>
                    <input
                      type="text"
                      required
                      value={footerForm.mail_order_biz_number}
                      onChange={(e) => setFooterForm({ ...footerForm, mail_order_biz_number: e.target.value })}
                      placeholder="예: 제2026-서울강남-0000호"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">사업장 주소 *</label>
                  <input
                    type="text"
                    required
                    value={footerForm.address}
                    onChange={(e) => setFooterForm({ ...footerForm, address: e.target.value })}
                    placeholder="예: 서울특별시 강남구 테헤란로 123 시트봇 빌딩 8층"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">개인정보보호책임자</label>
                    <input
                      type="text"
                      value={footerForm.privacy_manager}
                      onChange={(e) => setFooterForm({ ...footerForm, privacy_manager: e.target.value })}
                      placeholder="예: 관리자 (privacy@sheetbot.io)"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">호스팅 제공자</label>
                    <input
                      type="text"
                      value={footerForm.hosting_provider}
                      onChange={(e) => setFooterForm({ ...footerForm, hosting_provider: e.target.value })}
                      placeholder="예: EGDesk Cloud Infrastructure"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* 우측: 고객센터 및 브랜드 소개 카드 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-slate-500" />
                  <span>고객 지원 센터 및 안내 정보</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">고객센터 대표 이메일 *</label>
                    <input
                      type="email"
                      required
                      value={footerForm.cs_email}
                      onChange={(e) => setFooterForm({ ...footerForm, cs_email: e.target.value })}
                      placeholder="예: support@sheetbot.io"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">고객센터 운영시간 / 연락처</label>
                    <input
                      type="text"
                      value={footerForm.cs_phone}
                      onChange={(e) => setFooterForm({ ...footerForm, cs_phone: e.target.value })}
                      placeholder="예: 평일 09:00 - 18:00 (점심 12-13)"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">실시간 봇 안내 문구</label>
                  <input
                    type="text"
                    value={footerForm.easybot_info}
                    onChange={(e) => setFooterForm({ ...footerForm, easybot_info: e.target.value })}
                    placeholder="예: 이지봇(EasyBot) 24시간 상담"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">서비스 브랜드 한 줄 소개</label>
                  <textarea
                    rows={2}
                    value={footerForm.brand_description}
                    onChange={(e) => setFooterForm({ ...footerForm, brand_description: e.target.value })}
                    placeholder="서비스 요약 소개글"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">하단 저작권(Copyright) 문구</label>
                  <input
                    type="text"
                    value={footerForm.copyright_text}
                    onChange={(e) => setFooterForm({ ...footerForm, copyright_text: e.target.value })}
                    placeholder="예: © 2026 SheetBot Corp. All rights reserved."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>
            </div>

            {/* 하단 푸터 실시간 미리보기 프리뷰 박스 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  실시간 푸터 노출 미리보기 (Preview)
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  저장 시 모든 페이지 하단에 즉시 적용됩니다.
                </span>
              </div>

              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-900">{footerForm.company_name}</div>
                    <p className="text-[11px] text-slate-500">{footerForm.brand_description}</p>
                    <div className="text-[10px] text-slate-400 pt-1">
                      고객센터: {footerForm.cs_email} | {footerForm.cs_phone}
                    </div>
                  </div>

                  {/* 미리보기 내 SNS 버튼 (우측 배치) */}
                  <div className="space-y-1.5 md:border-l md:border-slate-200 md:pl-4">
                    <div className="text-[10px] font-bold text-slate-500">공식 SNS 채널 바로가기:</div>
                    {footerForm.sns_channels?.filter((c) => c.enabled).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {footerForm.sns_channels
                          ?.filter((c) => c.enabled)
                          .map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 shadow-2xs"
                            >
                              {getSnsIconSmall(c.type)}
                              <span>{c.name}</span>
                            </span>
                          ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic">노출 중인 SNS 채널이 없습니다.</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                  <span>대표: {footerForm.ceo_name}</span>
                  <span>|</span>
                  <span>사업자번호: {footerForm.biz_number}</span>
                  <span>|</span>
                  <span>통신판매: {footerForm.mail_order_biz_number}</span>
                  <span>|</span>
                  <span>고객센터: {footerForm.cs_email} ({footerForm.cs_phone})</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  주소: {footerForm.address} | 개인정보책임자: {footerForm.privacy_manager}
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  {footerForm.copyright_text}
                </div>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* 토큰 수동 지급/차감 모달 */}
      {tokenModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">회원 토큰 수동 조정</h3>
              </div>
              <button
                onClick={() => setTokenModalUser(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>대상 회원:</span>
                <span className="font-bold text-slate-800">{tokenModalUser.email}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>현재 잔여 토큰:</span>
                <span className="font-mono font-bold text-indigo-700">
                  {Number(tokenModalUser.balanceTokens || 0).toLocaleString()} P
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">조정 유형</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setTokenActionType("GRANT")}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tokenActionType === "GRANT"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    + 보너스 지급 (충전)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenActionType("DEDUCT")}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tokenActionType === "DEDUCT"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    - 토큰 회수 (차감)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">조정 토큰 수량</label>
                <div className="flex gap-2 mt-1">
                  {[10000, 30000, 50000, 100000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setTokenAmount(amt)}
                      className={`px-2 py-1 text-[11px] rounded-lg border font-bold cursor-pointer transition-all ${
                        tokenAmount === amt
                          ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full text-xs p-2.5 mt-1.5 rounded-xl border border-slate-200 font-mono font-bold focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">조정 사유 (감사 기록용)</label>
                <input
                  type="text"
                  value={tokenReason}
                  onChange={(e) => setTokenReason(e.target.value)}
                  placeholder="예: 고객센터 CS 보상, 베타테스터 감사 토큰 등"
                  className="w-full text-xs p-2.5 mt-1 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs flex justify-between items-center">
                <span className="text-indigo-900 font-medium">조정 후 예상 잔액:</span>
                <span className="font-mono font-black text-indigo-700 text-sm">
                  {Math.max(
                    0,
                    tokenModalUser.balanceTokens + (tokenActionType === "GRANT" ? tokenAmount : -tokenAmount)
                  ).toLocaleString()}{" "}
                  P
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTokenModalUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAdjustTokens}
                disabled={submittingToken || tokenAmount <= 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {submittingToken ? "처리 중..." : "확인 및 반영"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회원 상세 모달 */}
      {detailUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{detailUser.name || "회원"}</h3>
                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-xs font-black">
                    {detailUser.tier}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{detailUser.email}</p>
              </div>
              <button
                onClick={() => setDetailUser(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 회원 설정 폼 (등급, 권한, 메모) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>회원 등급 및 권한 설정</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500">회원 등급</label>
                  <select
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value)}
                    className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="FREE">FREE (무료)</option>
                    <option value="PRO">PRO (프로)</option>
                    <option value="ENTERPRISE">ENTERPRISE (기업)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500">시스템 권한</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="USER">일반 회원 (USER)</option>
                    <option value="ADMIN">관리자 (ADMIN)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">관리자 메모</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="특이사항이나 CS 응대 메모를 남겨주세요."
                  className="w-full text-xs p-2 mt-1 rounded-lg border border-slate-200 bg-white"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveUserMeta}
                  disabled={savingUserMeta}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {savingUserMeta ? "저장 중..." : "설정 저장"}
                </button>
              </div>
            </div>

            {/* 보유 프로젝트 목록 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  생성한 프로젝트 ({detailUser.projects?.length || 0}개)
                </span>
              </div>
              {detailUser.projects?.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                  등록된 프로젝트가 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {detailUser.projects?.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between text-xs"
                    >
                      <div className="truncate max-w-[280px]">
                        <span className="font-bold text-slate-800">{p.name}</span>
                        <div className="text-[10px] text-slate-400 truncate">{p.spreadsheet_url}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 결제 내역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  결제 및 충전 이력 ({detailUser.payments?.length || 0}건)
                </span>
                <span className="text-slate-500 font-normal">
                  총 ₩{Number(detailUser.totalSpentKrw || 0).toLocaleString()}
                </span>
              </div>
              {detailUser.payments?.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl text-center">
                  결제 충전 내역이 없습니다.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {detailUser.payments?.map((pm: any) => (
                    <div
                      key={pm.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-white flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{pm.package_name}</span>
                        <div className="text-[10px] text-slate-400">{pm.created_at?.slice(0, 16).replace("T", " ")}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-slate-900">₩{Number(pm.amount_krw || 0).toLocaleString()}</div>
                        <div className="text-[10px] text-indigo-600 font-bold">+{Number(pm.tokens_credited || 0).toLocaleString()} P</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
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

      {/* 관리자 후기 사진 크게 보기 라이트박스 */}
      {selectedReviewImage && (
        <div
          onClick={() => setSelectedReviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2">
            <img
              src={selectedReviewImage}
              alt="첨부 사진 원본"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setSelectedReviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
