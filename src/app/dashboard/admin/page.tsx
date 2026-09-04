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
  RefreshCw,
  Sparkles,
  Building2,
  Mail,
  Smartphone,
  Radio,
  Wand2,
} from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";
import { DEFAULT_SMS_SETTINGS, AdminSmsSettings } from "@/lib/admin-sms-types";
import { DEFAULT_SMTP_SETTINGS, AdminSmtpSettings } from "@/lib/admin-email-types";
import { DEFAULT_SMART_RULES, SmartDispatchRule } from "@/lib/smart-dispatch-types";
import AdminDispatchLogsTab from "./components/AdminDispatchLogsTab";
import AdminSmartRulesTab from "./components/AdminSmartRulesTab";
import AdminSmsTab from "./components/AdminSmsTab";
import AdminEmailTab from "./components/AdminEmailTab";
import AdminFooterTab from "./components/AdminFooterTab";
import AdminFaqsTab from "./components/AdminFaqsTab";
import AdminTaxInvoicesTab from "./components/AdminTaxInvoicesTab";
import AdminInquiriesTab from "./components/AdminInquiriesTab";
import AdminReviewsTab from "./components/AdminReviewsTab";
import AdminUsersTab from "./components/AdminUsersTab";

type TabType = "users" | "inquiries" | "reviews" | "faqs" | "tax_invoices" | "footer" | "sms" | "email" | "smart_rules" | "dispatch_logs";

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
  const [checkingDevice, setCheckingDevice] = useState<boolean>(false);
  const [deviceCheckResult, setDeviceCheckResult] = useState<{
    online: boolean;
    status: string;
    message: string;
    checkedAt?: string;
  } | null>(null);

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

  // 알림 발송 이력 상태
  const [dispatchLogs, setDispatchLogs] = useState<any[]>([]);
  const [dispatchStats, setDispatchStats] = useState({
    total: 0,
    smsTotal: 0,
    smsSuccess: 0,
    smsFailed: 0,
    emailTotal: 0,
    emailSuccess: 0,
    emailFailed: 0,
  });
  const [logChannelFilter, setLogChannelFilter] = useState<string>("ALL");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("ALL");
  const [logSearchInput, setLogSearchInput] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (activeTab === "dispatch_logs") {
      fetchDispatchLogs();
    }
  }, [activeTab, logChannelFilter, logStatusFilter]);

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
        fetchDispatchLogs(),
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

  const fetchPhoneDevices = async () => {
    try {
      const res = await fetch("/api/admin/sms");
      const data = await res.json();
      if (data.success && data.devices) {
        setPhoneDevices(data.devices);
      }
    } catch (e) {
      console.warn("Failed to fetch phone devices", e);
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

  const handleCheckDevice = async () => {
    if (!smsSettings.deviceId) {
      alert("점검할 발송 디바이스 ID가 없습니다.");
      return;
    }
    setCheckingDevice(true);
    try {
      const res = await fetch("/api/admin/sms/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: smsSettings.deviceId }),
      });
      const data = await res.json();
      const nowStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (data.success) {
        setDeviceCheckResult({
          online: data.online,
          status: data.status,
          message: data.message,
          checkedAt: nowStr,
        });
      } else {
        setDeviceCheckResult({
          online: false,
          status: data.status || "offline",
          message: data.message || data.error || "연결 상태 점검 실패",
          checkedAt: nowStr,
        });
      }
    } catch (e: any) {
      setDeviceCheckResult({
        online: false,
        status: "error",
        message: "점검 중 오류 발생: " + e.message,
        checkedAt: new Date().toLocaleTimeString("ko-KR"),
      });
    } finally {
      setCheckingDevice(false);
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

  // 발송 이력 조회 함수
  const fetchDispatchLogs = async () => {
    setLoadingLogs(true);
    try {
      const q = new URLSearchParams();
      if (logChannelFilter !== "ALL") q.set("channel", logChannelFilter);
      if (logStatusFilter !== "ALL") q.set("status", logStatusFilter);
      if (logSearchInput) q.set("search", logSearchInput);

      const res = await fetch(`/api/admin/dispatch-logs?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setDispatchLogs(data.logs || []);
        if (data.stats) setDispatchStats(data.stats);
      }
    } catch (e) {
      console.warn("Failed to fetch dispatch logs", e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!confirm("이 발송 이력 항목을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/dispatch-logs?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchDispatchLogs();
      } else {
        alert(data.error || "삭제 실패");
      }
    } catch (e) {
      alert("삭제 실패");
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

  // 통계 계산
  const totalUsersCount = users.length;
  const proUsersCount = users.filter((u) => u.tier === "PRO" || u.tier === "ENTERPRISE").length;
  const pendingInquiriesCount = inquiries.filter((i) => i.status === "PENDING").length;
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
    : "5.0";
  const requestedTaxCount = taxInvoices.filter((t) => t.status === "REQUESTED").length;

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

          <button
            onClick={() => setActiveTab("dispatch_logs")}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === "dispatch_logs"
                ? "bg-slate-900 text-white shadow-sm ring-2 ring-emerald-400/50"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>📋 알림 발송 이력 대장 ({dispatchStats.total})</span>
          </button>
        </div>

        {/* 0. 회원 관리 탭 내용 */}
        {activeTab === "users" && (
          <AdminUsersTab users={users} onRefresh={fetchUsers} />
        )}

        {/* 1. 1:1 고객 문의 내역 탭 */}
        {activeTab === "inquiries" && (
          <AdminInquiriesTab inquiries={inquiries} onRefresh={fetchInquiries} />
        )}

        {/* 2. 사용 후기 관리 탭 */}
        {activeTab === "reviews" && (
          <AdminReviewsTab reviews={reviews} onRefresh={fetchReviews} />
        )}

        {/* 3. FAQ 항목 편집 탭 */}
        {activeTab === "faqs" && (
          <AdminFaqsTab faqs={faqs} onRefresh={fetchFaqs} />
        )}

        {/* 4. 세금계산서/현금영수증 발행 탭 */}
        {activeTab === "tax_invoices" && (
          <AdminTaxInvoicesTab taxInvoices={taxInvoices} onRefresh={fetchTaxInvoices} />
        )}

        {/* 5. 푸터 / 회사정보 & SNS 설정 탭 */}
        {activeTab === "footer" && (
          <AdminFooterTab
            footerForm={footerForm}
            onFooterFormChange={setFooterForm}
            saving={savingFooter}
            onSave={handleSaveFooter}
          />
        )}

        {/* 6. 구글메시지 SMS 알림 설정 탭 */}
        {activeTab === "sms" && (
          <AdminSmsTab
            smsSettings={smsSettings}
            onSettingsChange={setSmsSettings}
            phoneDevices={phoneDevices}
            saving={savingSms}
            sendingTest={sendingTestSms}
            onSave={handleSaveSmsSettings}
            onSendTest={handleSendTestSms}
            onRefreshDevices={fetchPhoneDevices}
            checkingDevice={checkingDevice}
            deviceCheckResult={deviceCheckResult}
            onCheckDevice={handleCheckDevice}
          />
        )}

        {/* 7. 발송 메일 SMTP 설정 탭 */}
        {activeTab === "email" && (
          <AdminEmailTab
            smtpSettings={smtpSettings}
            onSettingsChange={setSmtpSettings}
            saving={savingSmtp}
            showPass={showSmtpPass}
            onToggleShowPass={() => setShowSmtpPass(!showSmtpPass)}
            testEmailInput={testEmailInput}
            onTestEmailInputChange={setTestEmailInput}
            sendingTest={sendingTestEmail}
            onSave={handleSaveSmtpSettings}
            onSendTest={handleSendTestEmail}
          />
        )}

        {/* 8. AI 자연어 스마트 발송 규칙 탭 */}
        {activeTab === "smart_rules" && (
          <AdminSmartRulesTab
            rules={smartRules}
            promptInput={rulePromptInput}
            onPromptInputChange={setRulePromptInput}
            parsing={parsingRule}
            onSubmitPrompt={handleCreateRuleFromPrompt}
            onToggleRule={handleToggleRule}
            onDeleteRule={handleDeleteRule}
          />
        )}

        {/* 8. 알림 발송 이력 대장 탭 내용 */}
        {activeTab === "dispatch_logs" && (
          <AdminDispatchLogsTab
            logs={dispatchLogs}
            stats={dispatchStats}
            channelFilter={logChannelFilter}
            onChannelFilterChange={setLogChannelFilter}
            statusFilter={logStatusFilter}
            onStatusFilterChange={setLogStatusFilter}
            searchInput={logSearchInput}
            onSearchInputChange={setLogSearchInput}
            loading={loadingLogs}
            onRefresh={fetchDispatchLogs}
            onDeleteLog={handleDeleteLog}
          />
        )}
      </main>

          </div>
  );
}
