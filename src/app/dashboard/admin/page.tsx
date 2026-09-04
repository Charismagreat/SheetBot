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
  Share2,
  Smartphone,
  Bell,
  Radio,
  EyeOff,
  AtSign,
  Key,
  Wand2
} from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo, SnsChannel } from "@/lib/default-footer";
import { SnsIcon } from "@/components/SnsIcons";
import { DEFAULT_SMS_SETTINGS, AdminSmsSettings } from "@/lib/admin-sms";
import { DEFAULT_SMTP_SETTINGS, AdminSmtpSettings } from "@/lib/admin-email-types";
import { DEFAULT_SMART_RULES, SmartDispatchRule } from "@/lib/smart-dispatch-types";

type TabType = "users" | "inquiries" | "reviews" | "faqs" | "tax_invoices" | "footer" | "sms" | "email" | "smart_rules";

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

  // 구글메시지 SMS 설정 상태
  const [smsSettings, setSmsSettings] = useState<AdminSmsSettings>(DEFAULT_SMS_SETTINGS);
  const [phoneDevices, setPhoneDevices] = useState<any[]>([]);
  const [savingSms, setSavingSms] = useState<boolean>(false);
  const [sendingTestSms, setSendingTestSms] = useState<boolean>(false);

  // 발송 메일 SMTP 설정 상태
  const [smtpSettings, setSmtpSettings] = useState<AdminSmtpSettings>(DEFAULT_SMTP_SETTINGS);
  const [savingSmtp, setSavingSmtp] = useState<boolean>(false);
  const [showSmtpPass, setShowSmtpPass] = useState<boolean>(false);
  const [testEmailInput, setTestEmailInput] = useState<string>("");
  const [sendingTestEmail, setSendingTestEmail] = useState<boolean>(false);

  // AI 자연어 스마트 발송 규칙 상태
  const [smartRules, setSmartRules] = useState<SmartDispatchRule[]>(DEFAULT_SMART_RULES);
  const [rulePromptInput, setRulePromptInput] = useState<string>("");
  const [parsingRule, setParsingRule] = useState<boolean>(false);

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
        fetchSmsSettings(),
        fetchSmtpSettings(),
        fetchSmartRules(),
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

  const fetchSmsSettings = async () => {
    try {
      const res = await fetch("/api/admin/sms");
      const data = await res.json();
      if (data.success) {
        if (data.settings) setSmsSettings(data.settings);
        if (data.devices) setPhoneDevices(data.devices);
      }
    } catch (e) {
      console.warn("Failed to fetch sms settings", e);
    }
  };

  const handleSaveSmsSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSms(true);
    try {
      const res = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smsSettings),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "구글메시지 SMS 발송 설정이 저장되었습니다.");
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSavingSms(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!smsSettings.adminPhone || !smsSettings.deviceId) {
      alert("발송 디바이스와 관리자 전화번호를 입력해 주세요.");
      return;
    }
    if (!confirm(`[${smsSettings.adminPhone}] 번호로 테스트 문자를 발송하시겠습니까?`)) return;
    setSendingTestSms(true);
    try {
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: smsSettings.deviceId,
          phoneNumber: smsSettings.adminPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
      } else {
        alert("❌ 발송 실패: " + (data.error || "발송 실패"));
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSendingTestSms(false);
    }
  };

  const fetchSmtpSettings = async () => {
    try {
      const res = await fetch("/api/admin/email");
      const data = await res.json();
      if (data.success && data.settings) {
        setSmtpSettings(data.settings);
        if (data.settings.adminEmail) {
          setTestEmailInput(data.settings.adminEmail);
        } else if (data.settings.user) {
          setTestEmailInput(data.settings.user);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch smtp settings", e);
    }
  };

  const handleSaveSmtpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smtpSettings),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "발송 메일 SMTP 설정이 저장되었습니다.");
      } else {
        alert(data.error || "저장 실패");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailInput || !testEmailInput.includes("@")) {
      alert("테스트 이메일을 수신할 올바른 주소를 입력해 주세요.");
      return;
    }
    if (!smtpSettings.user || !smtpSettings.pass) {
      alert("발송용 이메일 주소(ID)와 앱 비밀번호를 먼저 입력해 주세요.");
      return;
    }
    setSendingTestEmail(true);
    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testEmail: testEmailInput.trim(),
          host: smtpSettings.host,
          port: smtpSettings.port,
          user: smtpSettings.user,
          pass: smtpSettings.pass,
          fromName: smtpSettings.fromName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
      } else {
        alert("❌ 발송 실패: " + (data.error || "발송 실패"));
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setSendingTestEmail(false);
    }
  };

  const fetchSmartRules = async () => {
    try {
      const res = await fetch("/api/admin/smart-rules");
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setSmartRules(data.rules);
      }
    } catch (e) {
      console.warn("Failed to fetch smart rules", e);
    }
  };

  const handleCreateRuleFromPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulePromptInput.trim()) {
      alert("발송 조건을 자연어로 입력해 주세요.");
      return;
    }
    setParsingRule(true);
    try {
      const res = await fetch("/api/admin/smart-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: rulePromptInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        alert("✨ " + data.message);
        setRulePromptInput("");
        if (Array.isArray(data.rules)) {
          setSmartRules(data.rules);
        } else {
          fetchSmartRules();
        }
      } else {
        alert("규칙 생성 실패: " + (data.error || "오류"));
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setParsingRule(false);
    }
  };

  const handleToggleRule = async (rule: SmartDispatchRule) => {
    try {
      const res = await fetch("/api/admin/smart-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setSmartRules(data.rules);
      } else {
        fetchSmartRules();
      }
    } catch (e) {
      alert("상태 변경 실패");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("이 발송 규칙을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/smart-rules?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.rules)) {
        setSmartRules(data.rules);
      } else {
        fetchSmartRules();
      }
    } catch (e) {
      alert("삭제 실패");
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

          <button
            onClick={() => setActiveTab("sms")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "sms"
                ? "bg-slate-900 text-white shadow-sm ring-2 ring-sky-400/50"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>📱 구글메시지 SMS 알림</span>
          </button>

          <button
            onClick={() => setActiveTab("email")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "email"
                ? "bg-indigo-900 text-white shadow-sm ring-2 ring-indigo-400/50"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Mail className="w-4 h-4 text-indigo-400" />
            <span>✉️ 발송 메일 SMTP 설정</span>
          </button>

          <button
            onClick={() => setActiveTab("smart_rules")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "smart_rules"
                ? "bg-gradient-to-r from-purple-700 to-indigo-700 text-white shadow-sm ring-2 ring-purple-400/50"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span>✨ AI 자연어 발송 규칙 ({smartRules.length})</span>
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

        {/* 6. 구글메시지 SMS 알림 설정 탭 */}
        {activeTab === "sms" && (
          <form onSubmit={handleSaveSmsSettings} className="space-y-6">
            {/* 헤더 카드 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold border border-sky-200/60 mb-1">
                  <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                  <span>EGDesk 구글메시지(Google Messages) MCP 실시간 연동</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>관리자 SMS 문자 알림 자동 발송 관제</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  1:1 고객 문의, 세금계산서 신청, 토큰 결제 등 주요 비즈니스 이벤트 발생 시 등록된 관리자 휴대폰으로 구글메시지 SMS를 자동 발송합니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendTestSms}
                  disabled={sendingTestSms}
                  className="px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs"
                >
                  <Bell className="w-4 h-4 text-sky-600" />
                  <span>{sendingTestSms ? "테스트 전송 중..." : "테스트 문자 발송"}</span>
                </button>

                <button
                  type="submit"
                  disabled={savingSms}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  <span>{savingSms ? "저장 중..." : "설정 저장 완료"}</span>
                </button>
              </div>
            </div>

            {/* 마스터 스위치 및 발송 전화번호 설정 카드 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 좌측: 발송용 관리자 번호 & 마스터 활성화 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-slate-500" />
                  <span>수신용 관리자 전화번호 &amp; 마스터 제어</span>
                </h4>

                {/* 마스터 전체 알림 ON/OFF */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-800">전체 SMS 알림 기능 활성화</div>
                    <div className="text-[11px] text-slate-500">
                      {smsSettings.enabled ? "현재 알림 기능이 작동 중입니다." : "모든 SMS 자동 발송이 중단됩니다."}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSmsSettings({ ...smsSettings, enabled: !smsSettings.enabled })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      smsSettings.enabled
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {smsSettings.enabled ? "사용 중 (ON)" : "꺼짐 (OFF)"}
                  </button>
                </div>

                {/* 관리자 전화번호 입력 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span>수신용 관리자 휴대폰 번호 *</span>
                    <span className="text-[11px] font-normal text-slate-400">알림 문자를 받을 번호</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={smsSettings.adminPhone}
                    onChange={(e) => setSmsSettings({ ...smsSettings, adminPhone: e.target.value })}
                    placeholder="예: 010-7216-5884"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 font-bold text-slate-800 font-mono"
                  />
                  <p className="text-[11px] text-slate-400">
                    * 이벤트 발생 시 위 번호로 자동 생성된 알림 문자가 즉시 전송됩니다.
                  </p>
                </div>
              </div>

              {/* 우측: 페어링된 구글메시지 디바이스 상태 및 선택 */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-sky-600" />
                    <span>발송용 Google Messages 디바이스</span>
                  </h4>
                  <button
                    type="button"
                    onClick={fetchSmsSettings}
                    className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>기기 새로고침</span>
                  </button>
                </div>

                {phoneDevices.length > 0 ? (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 space-y-2 text-xs">
                      {phoneDevices.map((dev: any) => (
                        <div key={dev.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{dev.label || "휴대폰 기기"}</span>
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded font-bold">
                                {dev.status === "paired" ? "● 페어링 연결됨" : dev.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              연결 번호: {dev.linked_phone || "010-7216-5884"} (ID: {dev.id})
                            </div>
                          </div>

                          <span className="text-[11px] font-bold text-sky-700 bg-white px-2.5 py-1 rounded-lg border border-sky-200">
                            기본 발송기기
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">발송 디바이스 ID</label>
                      <input
                        type="text"
                        value={smsSettings.deviceId}
                        onChange={(e) => setSmsSettings({ ...smsSettings, deviceId: e.target.value })}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-slate-700"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                    <div className="font-bold">기본 디바이스 연동: {smsSettings.deviceId}</div>
                    <p className="text-[11px] text-amber-700">
                      EGDesk Phone MCP에 등록된 기기 ID({smsSettings.deviceId})를 사용하여 문자를 발송합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 이벤트별 알림 발송 조건 설정 카드 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-indigo-600" />
                <span>이벤트별 자동 SMS 알림 활성화 설정</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. 1:1 고객 문의 */}
                <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnInquiry ? "bg-slate-50 border-indigo-200" : "bg-white border-slate-200 opacity-60"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                      <span>1:1 고객 문의 접수</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSmsSettings({ ...smsSettings, notifyOnInquiry: !smsSettings.notifyOnInquiry })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        smsSettings.notifyOnInquiry ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {smsSettings.notifyOnInquiry ? "ON" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    새로운 1:1 문의가 등록되면 작성자 이메일, 제목, 접수 시간을 관리자 휴대폰으로 즉시 전송합니다.
                  </p>
                </div>

                {/* 2. 세금계산서 발행 신청 */}
                <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnTaxInvoice ? "bg-slate-50 border-emerald-200" : "bg-white border-slate-200 opacity-60"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>세금계산서 신청 접수</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSmsSettings({ ...smsSettings, notifyOnTaxInvoice: !smsSettings.notifyOnTaxInvoice })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        smsSettings.notifyOnTaxInvoice ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {smsSettings.notifyOnTaxInvoice ? "ON" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    기업 회원이 전자세금계산서 또는 현금영수증을 신청하면 신청 회사명과 신청 금액을 즉시 알립니다.
                  </p>
                </div>

                {/* 3. 유료 토큰 결제 */}
                <div className={`p-4 rounded-xl border transition-all ${smsSettings.notifyOnPayment ? "bg-slate-50 border-amber-200" : "bg-white border-slate-200 opacity-60"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-amber-500" />
                      <span>유료 토큰 충전 결제</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSmsSettings({ ...smsSettings, notifyOnPayment: !smsSettings.notifyOnPayment })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        smsSettings.notifyOnPayment ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {smsSettings.notifyOnPayment ? "ON" : "OFF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    회원이 Pro 요금제 또는 토큰 패키지 충전을 완료하면 결제 회원 및 충전 금액을 실시간 통보합니다.
                  </p>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* 7. 발송 메일 SMTP 설정 탭 */}
        {activeTab === "email" && (
          <div className="space-y-6">
            {/* 상단 헤더 카드 (이미지 스타일 100% 재현) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0 mt-0.5">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    발송 메일 SMTP 계정 설정
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    직원의 모바일 명함 전송이나 시스템 안내 메일 발송 시 활용될 정식 SMTP 발송 메일 서버를 등록합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-lg border border-emerald-200 shadow-2xs">
                  오직 DB 연동
                </span>
              </div>
            </div>

            {/* G메일 발송 계정 연동 가이드 카드 (이미지 스타일 100% 재현) */}
            <div className="p-6 rounded-2xl bg-sky-50/60 border border-sky-200/80 text-sky-900 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 text-sky-800 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <span>G메일 발송 계정 연동 가이드</span>
              </div>
              <p className="text-xs text-sky-700">
                본 시스템은 안정적인 연동을 위해 <strong>구글(Gmail)</strong> 서비스를 기본 권장합니다.
              </p>
              <ol className="text-xs space-y-1.5 text-sky-800/90 pl-1 leading-relaxed">
                <li>1. 사용할 구글 계정으로 로그인한 뒤, <strong>[Google 계정 관리 &gt; 보안]</strong> 메뉴로 이동합니다.</li>
                <li>2. 구글 로그인 영역에서 <strong>[2단계 인증]</strong>을 반드시 활성화합니다.</li>
                <li>3. 2단계 인증 상세 페이지 하단의 <strong>[앱 비밀번호]</strong> 메뉴로 이동합니다.</li>
                <li>4. 앱 이름을 <strong>EGDesk</strong> 등으로 적은 뒤 생성 버튼을 누르면 16자리의 영문 앱 비밀번호가 생성됩니다.</li>
                <li>5. 생성된 16자리 암호(공백 제외)를 하단의 <strong>발송 이메일 비밀번호</strong> 필드에 기입해 주세요.</li>
              </ol>
              <div className="text-[11px] text-sky-600 pt-1 font-medium border-t border-sky-200/60">
                ※ Gmail 연동 시 호스트는 <strong>[smtp.gmail.com]</strong>, 포트는 SSL 보안을 위해 <strong>[465]</strong>를 사용합니다.
              </div>
            </div>

            {/* SMTP 설정 입력 폼 카드 */}
            <form onSubmit={handleSaveSmtpSettings} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. SMTP 서버 호스트 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>SMTP 서버 호스트</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={smtpSettings.host}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
                  />
                </div>

                {/* 2. SMTP 서버 포트 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>SMTP 서버 포트</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={smtpSettings.port}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, port: Number(e.target.value) })}
                    placeholder="465"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
                  />
                </div>

                {/* 3. 발송용 이메일 주소 (ID) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <AtSign className="w-3.5 h-3.5 text-slate-400" />
                    <span>발송용 이메일 주소 (ID)</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={smtpSettings.user}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                    placeholder="example@gmail.com"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
                  />
                </div>

                {/* 4. 발송 이메일 비밀번호 (앱 비밀번호) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>발송 이메일 비밀번호 (앱 비밀번호)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSmtpPass ? "text" : "password"}
                      required
                      value={smtpSettings.pass}
                      onChange={(e) => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                      placeholder="구글 앱 비밀번호 16자리"
                      className="w-full text-xs p-3 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono text-slate-700 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* 5. 발송자 표시 이름 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">발송자 표시 명칭</label>
                  <input
                    type="text"
                    value={smtpSettings.fromName}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
                    placeholder="SheetBot 고객지원팀"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 text-slate-700 bg-white"
                  />
                </div>

                {/* 6. 알림 수신 관리자 이메일 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">알림 수신 관리자 이메일 (선택)</label>
                  <input
                    type="email"
                    value={smtpSettings.adminEmail}
                    onChange={(e) => setSmtpSettings({ ...smtpSettings, adminEmail: e.target.value })}
                    placeholder="미입력 시 발송용 이메일로 수신"
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* 저장 버튼 */}
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={savingSmtp}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-indigo-200" />
                  <span>{savingSmtp ? "저장 중..." : "SMTP 설정 정보 저장"}</span>
                </button>
              </div>
            </form>

            {/* 실시간 메일 연동 테스트 카드 (이미지 스타일 100% 재현) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-indigo-600" />
                  <span>실시간 메일 연동 테스트</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  입력된 설정을 바탕으로 실제 메일이 전송되는지 확인하기 위해 본인의 또 다른 이메일 주소로 테스트 이메일을 발송해 봅니다.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <input
                  type="email"
                  value={testEmailInput}
                  onChange={(e) => setTestEmailInput(e.target.value)}
                  placeholder="테스트 메일을 수신할 이메일 주소"
                  className="w-full sm:flex-1 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTestEmail}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingTestEmail ? "메일 전송 중..." : "테스트 메일 전송"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 8. AI 자연어 스마트 발송 규칙 탭 */}
        {activeTab === "smart_rules" && (
          <div className="space-y-6">
            {/* 상단 헤더 & 안내 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 mt-0.5">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    AI 자연어 스마트 발송 규칙 빌더
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    문자나 메일이 자동 발송되어야 할 조건과 대상을 자연어로 자유롭게 입력하면, AI가 분석하여 자동 발송 규칙을 생성합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-50 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 shadow-2xs">
                  ✨ 이지데스크 AI Caller 탑재
                </span>
              </div>
            </div>

            {/* 자연어 프롬프트 입력 카드 */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <form onSubmit={handleCreateRuleFromPrompt} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>자연어로 발송 조건 작성하기</span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">
                      예: "고객 문의 시 관리자에게 문자 보내고 고객에게는 확인 메일 보내줘"
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={rulePromptInput}
                    onChange={(e) => setRulePromptInput(e.target.value)}
                    placeholder="원하시는 발송 시점, 채널(문자/이메일), 수신 대상을 일상 언어로 편하게 적어주세요."
                    className="w-full text-xs p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 text-slate-800 leading-relaxed resize-none shadow-2xs"
                  />
                </div>

                {/* 추천 예시 프롬프트 칩들 */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500">💡 추천 자연어 예시 (클릭 시 자동 입력):</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "1:1 고객 문의가 들어오면 관리자 휴대폰으로 SMS를 보내고, 고객에게는 접수 확인 이메일을 발송해줘",
                      "세금계산서 신청이 접수되면 관리자에게 긴급 알림 문자와 이메일을 모두 보내줘",
                      "5만원 이상 토큰 충전 결제가 발생하면 관리자에게 결제 축하 문자를 발송해줘",
                      "모든 유료 결제 발생 시 관리자에게 이메일로 결제 영수증 내역을 통보해줘",
                    ].map((example, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRulePromptInput(example)}
                        className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-purple-50 text-[11px] text-slate-600 hover:text-purple-700 border border-slate-200 hover:border-purple-200 transition-all cursor-pointer text-left shadow-2xs"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 제출 버튼 */}
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={parsingRule || !rulePromptInput.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    <Wand2 className="w-4 h-4 text-purple-200" />
                    <span>{parsingRule ? "AI 자연어 규칙 분석 중..." : "AI 규칙 분석 및 등록"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* 현재 등록된 자연어 스마트 규칙 목록 카드 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>현재 활성화된 스마트 발송 규칙</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px] font-black">
                      {smartRules.length}개
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    이벤트가 감지되면 아래 규칙 조건에 부합하는 채널로 자동 발송이 실행됩니다.
                  </p>
                </div>
              </div>

              {smartRules.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  등록된 스마트 규칙이 없습니다. 위에서 자연어로 새로운 규칙을 등록해 보세요!
                </div>
              ) : (
                <div className="space-y-3">
                  {smartRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        rule.enabled
                          ? "bg-slate-50/70 border-purple-200/80 shadow-2xs"
                          : "bg-slate-100/50 border-slate-200 opacity-60"
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs text-slate-800">{rule.name}</span>
                          
                          {/* 발송 채널 뱃지 */}
                          <div className="flex items-center gap-1">
                            {rule.channels.includes("sms") && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">
                                <Smartphone className="w-3 h-3 text-sky-600" />
                                <span>문자(SMS)</span>
                              </span>
                            )}
                            {rule.channels.includes("email") && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                <Mail className="w-3 h-3 text-indigo-600" />
                                <span>이메일</span>
                              </span>
                            )}
                          </div>

                          {/* 대상 뱃지 */}
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-medium">
                            대상: {rule.targetRecipient === "both" ? "관리자 + 고객" : rule.targetRecipient === "customer" ? "고객" : "관리자"}
                          </span>
                        </div>

                        {/* 사용자가 작성한 원래 자연어 */}
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                          <span className="text-purple-600 font-bold shrink-0">자연어 규칙:</span>
                          <span className="italic font-medium text-slate-700">&quot;{rule.prompt}&quot;</span>
                        </div>

                        <div className="text-[11px] text-slate-400">
                          발송 조건: {rule.conditionSummary} {rule.minAmount ? `(${rule.minAmount.toLocaleString()}원 이상)` : ""}
                        </div>
                      </div>

                      {/* 상태 토글 & 삭제 버튼 */}
                      <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleToggleRule(rule)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            rule.enabled
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                          }`}
                        >
                          {rule.enabled ? "규칙 활성 (ON)" : "규칙 일시중지 (OFF)"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="규칙 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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
