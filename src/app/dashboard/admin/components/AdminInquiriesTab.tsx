"use client";

import { apiFetch } from "@/lib/api";
import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  Trash2,
  Send,
  Building2,
  Phone,
  Mail,
  Wrench,
  MessageSquare,
  Sparkles,
  Tag,
  Briefcase,
  ExternalLink,
  Award,
  TrendingUp,
  Coins,
  Flame,
  Lightbulb,
  ShieldCheck,
  Target,
  RefreshCw,
  AlertCircle,
  FileText,
  Smartphone,
  X,
} from "lucide-react";
import AdminProposalModal from "./AdminProposalModal";

interface AdminInquiriesTabProps {
  inquiries: any[];
  onRefresh: () => void;
}

type FilterCategory = "ALL" | "ENTERPRISE_AX" | "FDE_APPLICATION" | "FDE_REQUEST" | "GENERAL";

/**
 * 한국 표준시(KST, UTC+9) 기준 날짜/시간 포맷터
 */
function formatKstDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    // 한국 시간(UTC+9) 강제 변환
    const kstOffset = 9 * 60;
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const kstDate = new Date(utc + (kstOffset * 60000));
    const y = kstDate.getFullYear();
    const m = String(kstDate.getMonth() + 1).padStart(2, "0");
    const day = String(kstDate.getDate()).padStart(2, "0");
    const h = String(kstDate.getHours()).padStart(2, "0");
    const min = String(kstDate.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  } catch {
    return String(dateStr).slice(0, 16).replace("T", " ");
  }
}

/**
 * 전화번호를 010-XXXX-XXXX 표준 포맷으로 변환
 */
function formatPhoneNumber(phoneStr?: string | null): string {
  if (!phoneStr) return "";
  const cleaned = phoneStr.replace(/[^0-9]/g, "");
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  } else if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }
  return phoneStr;
}

/**
 * 올바른 외부 HTTP/HTTPS URL인지 엄격히 검증
 * (AI가 한글 설명 텍스트를 반환하여 로컬 404 경로로 이동하는 현상 원천 방지)
 */
function isExternalHttpUrl(url?: any): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

/**
 * 본문(content) 등에서 지원자/의뢰자의 연락처 및 성명을 스마트하게 파싱
 */
function extractApplicantInfo(inq: any): { name: string; phone: string; email: string } {
  const content = inq.content || "";
  let name = inq.user_name || inq.contact_name || "";
  let phone = inq.phone || "";
  let email = inq.user_email || inq.email || "";

  // 본문에서 연락처 파싱 (예: - 연락처: 01072165884)
  if (!phone && content) {
    const phoneMatch = content.match(/(?:연락처|전화번호|핸드폰)?\s*[:：\-]?\s*(01[016789][\d\-]{7,9})/i);
    if (phoneMatch && phoneMatch[1]) {
      phone = formatPhoneNumber(phoneMatch[1]);
    }
  } else if (phone) {
    phone = formatPhoneNumber(phone);
  }

  // 본문에서 성명 파싱 (예: - 성명: chachogreat)
  if ((!name || name === "시트봇 고객" || name === "고객") && content) {
    const nameMatch = content.match(/-\s*성명\s*[:：]\s*([^\n\r]+)/i);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim();
    }
  }

  return {
    name: name || "익명",
    phone: phone || "",
    email: email || "",
  };
}

export default function AdminInquiriesTab({
  inquiries,
  onRefresh,
}: AdminInquiriesTabProps) {
  const [filter, setFilter] = useState<FilterCategory>("ALL");
  const [selectedInquiry, setSelectedInquiry] = useState<any | null>(null);
  const [answerInput, setAnswerInput] = useState<string>("");
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState<boolean>(false);
  const [hasAppliedAiDraft, setHasAppliedAiDraft] = useState<boolean>(false);
  const [isAnalyzingLead, setIsAnalyzingLead] = useState<boolean>(false);
  const [showCandidatePicker, setShowCandidatePicker] = useState<boolean>(false);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState<boolean>(false);
  const [liveCandidates, setLiveCandidates] = useState<any[]>([]);
  const [proposalInquiry, setProposalInquiry] = useState<any | null>(null);

  // 옴니채널 발송 모달 상태
  const [replyChannel, setReplyChannel] = useState<"SMS" | "EMAIL" | null>(null);
  const [emailSubjectInput, setEmailSubjectInput] = useState<string>("");
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [replyErrorMsg, setReplyErrorMsg] = useState<string | null>(null);
  const [replySuccessMsg, setReplySuccessMsg] = useState<string | null>(null);

  // 옴니채널(SMS / EMAIL) 발송 실행 핸들러
  const handleSendReply = async () => {
    if (!selectedInquiry || !replyChannel || !answerInput.trim() || isSendingReply) return;
    const applicant = extractApplicantInfo(selectedInquiry);
    const recipient = replyChannel === "SMS" ? applicant.phone : applicant.email;

    if (!recipient) {
      alert(`${replyChannel === "SMS" ? "수신 가능한 휴대폰 번호가" : "수신 가능한 이메일 주소가"} 없습니다.`);
      return;
    }

    setIsSendingReply(true);
    setReplyErrorMsg(null);
    setReplySuccessMsg(null);

    try {
      const res = await apiFetch("/api/admin/inquiries/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          source: selectedInquiry.source,
          channel: replyChannel,
          recipient,
          customerName: applicant.name,
          message: answerInput.trim(),
          subject: replyChannel === "EMAIL" ? emailSubjectInput : undefined,
          saveAsAnswer: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "발송 실패");
      }

      setReplySuccessMsg(data.message || "발송이 완료되었습니다.");
      setTimeout(() => {
        setReplyChannel(null);
        setSelectedInquiry(null);
        onRefresh();
      }, 1400);
    } catch (err: any) {
      setReplyErrorMsg(err.message || "발송 중 오류가 발생했습니다.");
    } finally {
      setIsSendingReply(false);
    }
  };

  // 각 문의 레코드의 정밀 카테고리 판별
  const classifyCategory = (inq: any): FilterCategory => {
    if (inq.source === "ENTERPRISE_INQUIRY" || inq.category === "ENTERPRISE_AX") {
      return "ENTERPRISE_AX";
    }
    if (
      inq.category === "FDE_APPLICATION" ||
      (inq.title && inq.title.includes("파트너 지원")) ||
      (inq.content && inq.content.includes("[지원자 정보]"))
    ) {
      return "FDE_APPLICATION";
    }
    if (
      inq.category === "FDE_REQUEST" ||
      inq.category === "AUTOMATION_REQUEST" ||
      (inq.title && inq.title.includes("맞춤 제작")) ||
      (inq.title && inq.title.includes("맞춤 구축")) ||
      (inq.content && inq.content.includes("[의뢰자 정보]"))
    ) {
      return "FDE_REQUEST";
    }
    return "GENERAL";
  };

  // 모달 열기 시 기존 답변 또는 AI 사전 작성 초안 자동 주입
  const handleOpenModal = (inq: any) => {
    setSelectedInquiry(inq);
    setHasAppliedAiDraft(false);
    setShowCandidatePicker(false);
    setLiveCandidates([]);

    if (inq.answer) {
      setAnswerInput(inq.answer);
    } else if (inq.ai_draft) {
      setAnswerInput(inq.ai_draft);
      setHasAppliedAiDraft(true);
    } else {
      setAnswerInput("");
      handleGenerateAiDraft(inq);
    }

    // 회사명 유효성 검사 (미기재, 귀사 제외)
    const hasValidCompany = Boolean(
      inq.company_name &&
      inq.company_name.trim() &&
      inq.company_name !== "미기재 기업" &&
      inq.company_name !== "귀사"
    );

    // 유효한 회사명이 있고 기업 견적 건인 경우에만 선제적 자동 분석 트리거
    const hasExactIdentifier = Boolean(inq.biz_number || inq.website_url);
    if (hasValidCompany && !inq.ai_score && (inq.source === "ENTERPRISE_INQUIRY" || inq.category === "ENTERPRISE_AX")) {
      if (hasExactIdentifier) {
        handleAnalyzeLead(inq);
      } else {
        // 후보 기업 목록이 비어있으면 실시간으로 후보군 탐색
        if (!inq.candidate_profiles || inq.candidate_profiles.length === 0) {
          handleFetchCandidates(inq.company_name);
        }
      }
    }
  };

  // 공공데이터 기업 후보군 실시간 조회
  const handleFetchCandidates = async (companyName: string) => {
    if (!companyName || companyName.trim().length < 2 || companyName === "미기재 기업" || companyName === "귀사") return;
    setIsSearchingCandidates(true);
    try {
      const res = await apiFetch("/api/admin/inquiries/company-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.candidates)) {
        setLiveCandidates(data.candidates);
      }
    } catch {
      // 실패 시 조용히 유지
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  // AI B2B 리드 스코어링 & 기업 지원사업 매칭 분석 실행 (selectedProfile 지정 시 해당 기업으로 확정)
  const handleAnalyzeLead = async (targetInq?: any, selectedProfile?: any) => {
    const inq = targetInq || selectedInquiry;
    if (!inq) return;

    if (!inq.company_name || !inq.company_name.trim() || inq.company_name === "미기재 기업" || inq.company_name === "귀사") {
      alert("기업 정보(상호명)가 기재되지 않은 일반/개인 문의는 기업 AI 진단을 실행할 수 없습니다.");
      return;
    }

    // 만약 selectedProfile이 명시되지 않았다면(재분석 버튼 등), 현재 이미 분석된 기업 프로필을 그대로 유지!
    const profileToSend =
      selectedProfile !== undefined
        ? selectedProfile
        : inq.ai_company_analysis?.realCompanyProfile || undefined;

    const applicant = extractApplicantInfo(inq);
    setIsAnalyzingLead(true);
    try {
      const res = await apiFetch("/api/admin/inquiries/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: inq.id,
          source: inq.source,
          category: inq.category,
          companyName: inq.company_name,
          bizNumber: inq.biz_number,
          websiteUrl: inq.website_url,
          selectedProfile: profileToSend,
          contactName: applicant.name,
          userEmail: applicant.email,
          phone: applicant.phone,
          industry: inq.industry,
          targetAreas: inq.target_areas,
          useVoucher: inq.use_voucher,
          title: inq.title,
          content: inq.content,
        }),
      });

      const data = await res.json();
      if (data.success && data.score && data.analysis) {
        // 현재 선택된 모달 데이터 및 목록 캐시 동기화
        inq.ai_score = data.score;
        inq.ai_company_analysis = data.analysis;
        setShowCandidatePicker(false);
        setSelectedInquiry((prev: any) =>
          prev && prev.id === inq.id
            ? { ...prev, ai_score: data.score, ai_company_analysis: data.analysis }
            : prev
        );
        onRefresh();
      } else {
        alert(data.error || "AI 리드 분석 실패");
      }
    } catch {
      alert("AI 리드 분석 통신 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzingLead(false);
    }
  };

  // AI 초안 실시간 생성 / 재생성 요청
  const handleGenerateAiDraft = async (targetInq?: any) => {
    const inq = targetInq || selectedInquiry;
    if (!inq) return;

    const applicant = extractApplicantInfo(inq);
    setIsGeneratingDraft(true);
    try {
      const res = await apiFetch("/api/admin/inquiries/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: inq.id,
          source: inq.source,
          category: inq.category,
          companyName: inq.company_name,
          contactName: applicant.name,
          userEmail: applicant.email,
          phone: applicant.phone,
          industry: inq.industry,
          targetAreas: inq.target_areas,
          useVoucher: inq.use_voucher,
          title: inq.title,
          content: inq.content,
        }),
      });

      const data = await res.json();
      if (data.success && data.aiDraft) {
        setAnswerInput(data.aiDraft);
        setHasAppliedAiDraft(true);
        inq.ai_draft = data.aiDraft;
      } else {
        alert(data.error || "AI 초안 생성 실패");
      }
    } catch {
      alert("AI 초안 생성 통신 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // 카테고리별 건수 계산
  const counts = useMemo(() => {
    let enterprise = 0;
    let fdeApp = 0;
    let fdeReq = 0;
    let general = 0;
    inquiries.forEach((inq) => {
      const cat = classifyCategory(inq);
      if (cat === "ENTERPRISE_AX") enterprise++;
      else if (cat === "FDE_APPLICATION") fdeApp++;
      else if (cat === "FDE_REQUEST") fdeReq++;
      else general++;
    });
    return {
      ALL: inquiries.length,
      ENTERPRISE_AX: enterprise,
      FDE_APPLICATION: fdeApp,
      FDE_REQUEST: fdeReq,
      GENERAL: general,
    };
  }, [inquiries]);

  // 선택된 필터에 따른 목록
  const filteredInquiries = useMemo(() => {
    if (filter === "ALL") return inquiries;
    return inquiries.filter((inq) => classifyCategory(inq) === filter);
  }, [inquiries, filter]);

  const handleSaveAnswer = async () => {
    if (!selectedInquiry || !answerInput.trim()) return;
    setSubmittingAnswer(true);
    try {
      const res = await apiFetch("/api/admin/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          source: selectedInquiry.source,
          answer: answerInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          selectedInquiry.source === "ENTERPRISE_INQUIRY"
            ? "상담 메모 및 회신 내용이 성공적으로 저장되었습니다."
            : "답변 및 검토 내용이 성공적으로 등록되었습니다."
        );
        setSelectedInquiry(null);
        setAnswerInput("");
        onRefresh();
      } else {
        alert(data.error || "처리 실패");
      }
    } catch {
      alert("네트워크 오류");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleDeleteInquiry = async (inq: any) => {
    if (!confirm("이 접수 내역을 삭제하시겠습니까?")) return;
    try {
      const res = await apiFetch(
        `/api/admin/inquiries?id=${inq.id}&source=${inq.source || ""}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) onRefresh();
    } catch {
      alert("삭제 실패");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
      {/* 상단 헤더 & 카테고리 필터 탭 */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800">
              통합 고객 문의 & 맞춤 견적 접수 대장
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 font-bold">
              전체 {counts.ALL}건
            </span>
          </div>
          <button
            onClick={onRefresh}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>🔄 새로고침</span>
          </button>
        </div>

        {/* 필터 칩 목록 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === "ALL"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
            }`}
          >
            전체 ({counts.ALL})
          </button>
          <button
            type="button"
            onClick={() => setFilter("ENTERPRISE_AX")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "ENTERPRISE_AX"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>🏢 기업 AX 견적 ({counts.ENTERPRISE_AX})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("FDE_APPLICATION")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "FDE_APPLICATION"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/80"
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>🤝 FDE 파트너 지원 ({counts.FDE_APPLICATION})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("FDE_REQUEST")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "FDE_REQUEST"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200/80"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>🛠️ 맞춤 제작 의뢰 ({counts.FDE_REQUEST})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("GENERAL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "GENERAL"
                ? "bg-slate-700 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>💬 일반 고객 문의 ({counts.GENERAL})</span>
          </button>
        </div>
      </div>

      {filteredInquiries.length === 0 ? (
        <div className="p-16 text-center text-slate-400 text-xs">
          선택한 카테고리에 접수된 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 w-24">상태</th>
                <th className="py-3 px-4 w-32">유형</th>
                <th className="py-3 px-4 w-64">신청자 / 기업 정보</th>
                <th className="py-3 px-4">요구사항 및 맞춤 설정</th>
                <th className="py-3 px-4 w-36">접수일시 (KST)</th>
                <th className="py-3 px-4 w-28 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInquiries.map((inq) => {
                const cat = classifyCategory(inq);
                const isEnterprise = cat === "ENTERPRISE_AX";
                const isFdeApp = cat === "FDE_APPLICATION";
                const isFdeReq = cat === "FDE_REQUEST";
                const isAnswered = inq.status === "ANSWERED";
                const applicant = extractApplicantInfo(inq);

                return (
                  <tr
                    key={inq.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isEnterprise
                        ? "bg-emerald-50/20"
                        : isFdeApp
                        ? "bg-purple-50/20"
                        : isFdeReq
                        ? "bg-indigo-50/15"
                        : ""
                    }`}
                  >
                    {/* 상태 뱃지 */}
                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      {isAnswered ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {isEnterprise ? "상담완료" : isFdeApp ? "검토완료" : "답변완료"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200">
                          <Clock className="w-3 h-3" />
                          {isEnterprise ? "상담대기" : isFdeApp ? "검토대기" : "답변대기"}
                        </span>
                      )}
                    </td>

                    {/* 유형 뱃지 */}
                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      {isFdeApp ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 font-black text-[11px] border border-purple-300">
                          <Briefcase className="w-3 h-3 text-purple-700" />
                          <span>FDE 지원</span>
                        </span>
                      ) : isEnterprise ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100/80 text-emerald-800 font-black text-[11px] border border-emerald-300">
                          <Building2 className="w-3 h-3 text-emerald-700" />
                          <span>기업 AX 견적</span>
                        </span>
                      ) : isFdeReq ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100/80 text-indigo-800 font-black text-[11px] border border-indigo-300">
                          <Wrench className="w-3 h-3 text-indigo-700" />
                          <span>맞춤 제작 의뢰</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200">
                          <MessageSquare className="w-3 h-3 text-slate-500" />
                          <span>일반 고객 문의</span>
                        </span>
                      )}
                    </td>

                    {/* 신청자 / 기업 정보 (CRM 원클릭 다이얼 & 메일) */}
                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      {isEnterprise ? (
                        <div className="space-y-1">
                          <div className="font-black text-slate-900 flex items-center gap-1.5 text-xs">
                            <span className="text-emerald-700 font-black">🏢 {inq.company_name || "회사명 미기재"}</span>
                            {inq.industry && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {inq.industry}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-700 font-semibold">
                            담당: {applicant.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            {applicant.phone && (
                              <a
                                href={`tel:${applicant.phone}`}
                                className="flex items-center gap-0.5 text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                                title="전화 걸기"
                              >
                                <Phone className="w-2.5 h-2.5 text-emerald-600" /> {applicant.phone}
                              </a>
                            )}
                            {applicant.email && (
                              <a
                                href={`mailto:${applicant.email}`}
                                className="flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 hover:underline"
                                title="이메일 작성"
                              >
                                <Mail className="w-2.5 h-2.5 text-indigo-500" /> {applicant.email}
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800 text-xs flex items-center gap-1">
                            <span>{applicant.name}</span>
                            {isFdeApp && (
                              <span className="text-[10px] font-bold px-1 py-0.2 rounded bg-purple-100 text-purple-700">
                                파트너 지원자
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                            {applicant.phone && (
                              <a
                                href={`tel:${applicant.phone}`}
                                className="flex items-center gap-0.5 text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                                title="전화 걸기"
                              >
                                <Phone className="w-2.5 h-2.5 text-emerald-600" /> {applicant.phone}
                              </a>
                            )}
                            {applicant.email && (
                              <a
                                href={`mailto:${applicant.email}`}
                                className="flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 hover:underline"
                                title="이메일 작성"
                              >
                                <Mail className="w-2.5 h-2.5 text-indigo-500" /> {applicant.email}
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* 요구사항 및 관리자 답변 (말줄임 통제로 레이아웃 안정화) */}
                    <td className="py-3.5 px-4 max-w-md align-top">
                      <div className="font-bold text-slate-900 line-clamp-1">{inq.title}</div>

                      {/* AI B2B 리드 스코어링 뱃지 (기업 정보가 있는 경우에만 표시) */}
                      {(() => {
                        const hasValidCompanyRow = Boolean(
                          inq.company_name &&
                          inq.company_name.trim() &&
                          inq.company_name !== "미기재 기업" &&
                          inq.company_name !== "귀사"
                        );

                        if (hasValidCompanyRow && inq.ai_score) {
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black text-[10px] border shadow-2xs ${
                                  inq.ai_score.tier === "S"
                                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-600"
                                    : inq.ai_score.tier === "A"
                                    ? "bg-emerald-600 text-white border-emerald-700"
                                    : inq.ai_score.tier === "B"
                                    ? "bg-blue-600 text-white border-blue-700"
                                    : "bg-slate-600 text-white border-slate-700"
                                }`}
                              >
                                <Award className="w-3 h-3" />
                                <span>Tier {inq.ai_score.tier}</span>
                                <span className="opacity-90 font-medium">({inq.ai_score.conversionProbability}% 확률)</span>
                              </span>

                              {inq.ai_score.estimatedPriceRange && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-amber-50 text-amber-900 border border-amber-200">
                                  <Coins className="w-2.5 h-2.5 text-amber-600" />
                                  <span>{inq.ai_score.estimatedPriceRange}</span>
                                </span>
                              )}

                              {inq.ai_score.urgency === "HIGH" && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-extrabold text-[10px] bg-rose-50 text-rose-700 border border-rose-200">
                                  <Flame className="w-2.5 h-2.5 text-rose-600" />
                                  <span>긴급</span>
                                </span>
                              )}
                            </div>
                          );
                        }

                        if (hasValidCompanyRow && isEnterprise) {
                          return (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAnalyzeLead(inq);
                                }}
                                disabled={isAnalyzingLead}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                                <span>AI 리드 진단</span>
                              </button>
                            </div>
                          );
                        }

                        return null;
                      })()}

                      {/* 기업 AX 희망 영역 태그 & 바우처 표출 */}
                      {isEnterprise && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {inq.use_voucher && (
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                inq.use_voucher === "YES"
                                  ? "bg-amber-50 text-amber-800 border-amber-300"
                                  : inq.use_voucher === "CONSULT"
                                  ? "bg-teal-50 text-teal-800 border-teal-300"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              정부바우처: {inq.use_voucher}
                            </span>
                          )}
                          {inq.target_areas && (
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80 font-medium line-clamp-1">
                              🎯 {inq.target_areas}
                            </span>
                          )}
                        </div>
                      )}

                      {inq.content && (
                        <div className="text-slate-500 line-clamp-2 mt-1 text-[11px] leading-relaxed">
                          {inq.content}
                        </div>
                      )}

                      {/* 관리자 답변/메모: 2줄 말줄임(line-clamp-2)으로 테이블 폭발 방지 */}
                      {inq.answer && (
                        <div className="mt-2 p-2 rounded-lg bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-950">
                          <span className="font-bold text-indigo-700">
                            {isEnterprise
                              ? "상담 메모:"
                              : isFdeApp
                              ? "검토 메모:"
                              : "관리자 답변:"}
                          </span>{" "}
                          <span className="line-clamp-2 text-indigo-900/90 leading-relaxed">
                            {inq.answer}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 접수일시 (한국시간 KST 변환) */}
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-[11px] align-top font-medium">
                      {formatKstDateTime(inq.created_at)}
                    </td>

                    {/* 관리 액션 버튼 */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5 align-top">
                      {!isFdeApp && (
                        <button
                          type="button"
                          onClick={() => setProposalInquiry(inq)}
                          className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer transition-all shadow-2xs bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200"
                          title="공식 맞춤 제안서 및 견적서 PDF 생성/인쇄"
                        >
                          <span className="inline-flex items-center gap-1">
                            <FileText className="w-3 h-3 text-purple-600" />
                            <span>견적서</span>
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenModal(inq)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer transition-all shadow-2xs ${
                          isEnterprise
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : isFdeApp
                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                            : isFdeReq
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                        }`}
                      >
                        {isEnterprise
                          ? isAnswered
                            ? "상담수정"
                            : "상담/견적"
                          : isFdeApp
                          ? isAnswered
                            ? "검토수정"
                            : "지원서 검토"
                          : isFdeReq
                          ? isAnswered
                            ? "의뢰수정"
                            : "의뢰 답변"
                          : isAnswered
                          ? "답변수정"
                          : "답변작성"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInquiry(inq)}
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

      {/* 상담 및 답변 모달 */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-start shrink-0 pb-1 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg border ${
                      selectedInquiry.category === "FDE_APPLICATION" ||
                      (selectedInquiry.title && selectedInquiry.title.includes("파트너 지원"))
                        ? "bg-purple-100 text-purple-900 border-purple-300"
                        : selectedInquiry.source === "ENTERPRISE_INQUIRY"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : selectedInquiry.category === "FDE_REQUEST" ||
                          selectedInquiry.category === "AUTOMATION_REQUEST"
                        ? "bg-indigo-50 text-indigo-800 border-indigo-300"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {selectedInquiry.category === "FDE_APPLICATION" ||
                    (selectedInquiry.title && selectedInquiry.title.includes("파트너 지원"))
                      ? "🤝 FDE 1기 파트너 지원"
                      : selectedInquiry.category === "AUTOMATION_REQUEST"
                      ? "🛠️ 맞춤 제작 의뢰"
                      : selectedInquiry.category_label || selectedInquiry.category}
                  </span>
                  {selectedInquiry.industry && (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {selectedInquiry.industry}
                    </span>
                  )}
                  {selectedInquiry.ai_score && (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                        selectedInquiry.ai_score.tier === "S"
                          ? "bg-amber-100 text-amber-900 border-amber-300"
                          : selectedInquiry.ai_score.tier === "A"
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                          : "bg-blue-100 text-blue-900 border-blue-300"
                      }`}
                    >
                      👑 Tier {selectedInquiry.ai_score.tier} ({selectedInquiry.ai_score.conversionProbability}% 수주확률)
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-medium">
                    접수: {formatKstDateTime(selectedInquiry.created_at)}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1.5 break-keep">
                  {selectedInquiry.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInquiry(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 스크롤 가능한 본문 영역 */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* 기업 맞춤 견적 신청 상세 정보 */}
              {selectedInquiry.source === "ENTERPRISE_INQUIRY" ? (
                <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/80 space-y-2.5 text-xs text-slate-700">
                  <div className="grid grid-cols-2 gap-2 pb-2 border-b border-emerald-100 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">회사명 / 상호</span>
                      <strong className="text-slate-900 text-xs font-black">
                        {selectedInquiry.company_name || "-"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">담당자</span>
                      <strong className="text-slate-900 text-xs font-bold">
                        {extractApplicantInfo(selectedInquiry).name}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">연락처</span>
                      <a
                        href={`tel:${extractApplicantInfo(selectedInquiry).phone}`}
                        className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                      >
                        📞 {extractApplicantInfo(selectedInquiry).phone || "-"}
                      </a>
                    </div>
                    <div>
                      <span className="text-slate-400 block">이메일</span>
                      <a
                        href={`mailto:${extractApplicantInfo(selectedInquiry).email}`}
                        className="text-indigo-600 font-medium hover:underline truncate block"
                      >
                        ✉️ {extractApplicantInfo(selectedInquiry).email || "-"}
                      </a>
                    </div>
                  </div>

                  {selectedInquiry.use_voucher && (
                    <div className="text-[11px]">
                      <span className="text-slate-500 font-bold">정부 바우처 지원 연계 희망: </span>
                      <span className="font-extrabold text-emerald-800">
                        {selectedInquiry.use_voucher === "YES"
                          ? "예 (정부지원사업 연계 희망)"
                          : selectedInquiry.use_voucher === "CONSULT"
                          ? "상담 후 결정"
                          : "아니오 (자체 예산 집행)"}
                      </span>
                    </div>
                  )}

                  {selectedInquiry.target_areas && (
                    <div className="text-[11px]">
                      <span className="text-slate-500 font-bold block mb-1">희망 자동화 영역:</span>
                      <div className="p-2.5 rounded-xl bg-white border border-emerald-200/60 font-medium text-slate-800 leading-relaxed">
                        {selectedInquiry.target_areas}
                      </div>
                    </div>
                  )}

                  {selectedInquiry.content && (
                    <div className="text-[11px]">
                      <span className="text-slate-500 font-bold block mb-1">세부 문의 및 요구사항:</span>
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-slate-800 whitespace-pre-line min-h-[90px] leading-relaxed shadow-2xs">
                        {selectedInquiry.content}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* 일반 문의 및 FDE 의뢰 상세 내용 */
                <div className="space-y-2 flex flex-col">
                  <div className="text-xs text-slate-600 shrink-0 flex items-center gap-3 flex-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    <div>
                      신청자: <strong className="text-slate-900">{extractApplicantInfo(selectedInquiry).name}</strong>
                    </div>
                    {extractApplicantInfo(selectedInquiry).phone && (
                      <a
                        href={`tel:${extractApplicantInfo(selectedInquiry).phone}`}
                        className="text-emerald-700 hover:underline font-bold flex items-center gap-1"
                      >
                        📞 {extractApplicantInfo(selectedInquiry).phone}
                      </a>
                    )}
                    {extractApplicantInfo(selectedInquiry).email && (
                      <a
                        href={`mailto:${extractApplicantInfo(selectedInquiry).email}`}
                        className="text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        ✉️ {extractApplicantInfo(selectedInquiry).email}
                      </a>
                    )}
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200 text-xs text-slate-800 whitespace-pre-line min-h-[120px] leading-relaxed shadow-inner font-medium">
                    {selectedInquiry.content}
                  </div>
                </div>
              )}

              {/* 🎯 AI B2B 리드 진단 & 정부지원사업 매칭 카드 (기업 정보가 있는 경우에만 표출) */}
              {(() => {
                const hasValidCompanyInModal = Boolean(
                  selectedInquiry.company_name &&
                  selectedInquiry.company_name.trim() &&
                  selectedInquiry.company_name !== "미기재 기업" &&
                  selectedInquiry.company_name !== "귀사"
                );

                if (!hasValidCompanyInModal) {
                  return (
                    <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-slate-200 text-slate-500 shrink-0 mt-0.5">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="font-black text-slate-800 flex items-center gap-2">
                          <span>🏢 기업 정보(상호명) 미기재 문의 (일반/개인)</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
                            공공데이터 분석 제외
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          상호명이 기재되지 않은 일반 고객 문의 또는 개인 의뢰 건입니다.
                          국민연금 사업장 실시간 검증 및 중기부 지원사업(바우처) 매칭은 사업자등록 정보가 있는 기업에 한해 제공됩니다.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md border border-indigo-900/60 space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-indigo-800/60">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                        <span>🎯 AI 기업 리드 진단 & 정부지원사업 매칭 리포트</span>
                      </h4>
                      <p className="text-[10px] text-indigo-200/70">
                        수주 가능성 분석 및 중기부/소진공 바우처 적격성 실시간 판정
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedInquiry.ai_score && (
                      <button
                        type="button"
                        onClick={() => setShowCandidatePicker(!showCandidatePicker)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                        title="분석 대상 공공데이터 기업을 변경하거나 다시 선택합니다"
                      >
                        <Building2 className="w-3 h-3 text-indigo-400" />
                        <span>{showCandidatePicker ? "리포트 보기" : "🏢 분석 대상 기업 변경"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleAnalyzeLead(
                          selectedInquiry,
                          selectedInquiry.ai_company_analysis?.realCompanyProfile
                        )
                      }
                      disabled={isAnalyzingLead}
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 text-indigo-100 hover:text-white border border-indigo-400/40 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                      title="기업 배경 및 정부지원사업 매칭을 새로 분석합니다"
                    >
                      <RefreshCw className={`w-3 h-3 text-amber-300 ${isAnalyzingLead ? "animate-spin" : ""}`} />
                      <span>{isAnalyzingLead ? "AI 분석 중..." : "🔄 AI 재분석"}</span>
                    </button>
                  </div>
                </div>

                {selectedInquiry.ai_score && selectedInquiry.ai_company_analysis && !showCandidatePicker ? (
                  <div className="space-y-3 text-xs">
                    {/* 4대 핵심 지표 그리드 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* 1. Tier 등급 */}
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-300 flex items-center gap-1">
                          <Award className="w-3 h-3 text-amber-400" /> 리드 등급
                        </span>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span
                            className={`text-base font-black ${
                              selectedInquiry.ai_score.tier === "S"
                                ? "text-amber-400"
                                : selectedInquiry.ai_score.tier === "A"
                                ? "text-emerald-400"
                                : "text-blue-400"
                            }`}
                          >
                            Tier {selectedInquiry.ai_score.tier}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            ({selectedInquiry.ai_score.score}점)
                          </span>
                        </div>
                      </div>

                      {/* 2. 수주 확률 */}
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-300 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-emerald-400" /> 수주 확률
                        </span>
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="text-base font-black text-emerald-400">
                            {selectedInquiry.ai_score.conversionProbability}%
                          </span>
                        </div>
                      </div>

                      {/* 3. 추천 견적 범위 */}
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-300 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-amber-300" /> 예상 견적
                        </span>
                        <div className="mt-1 text-[11px] font-black text-amber-300 truncate">
                          {selectedInquiry.ai_score.estimatedPriceRange || "맞춤 협의"}
                        </div>
                      </div>

                      {/* 4. 긴급도 */}
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-300 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-rose-400" /> 응대 긴급도
                        </span>
                        <div className="mt-1 flex items-center gap-1">
                          <span
                            className={`text-[11px] font-black px-1.5 py-0.5 rounded ${
                              selectedInquiry.ai_score.urgency === "HIGH"
                                ? "bg-rose-500/30 text-rose-300 border border-rose-500/40"
                                : "bg-slate-700 text-slate-300"
                            }`}
                          >
                            {selectedInquiry.ai_score.urgency === "HIGH" ? "🔥 HIGH (즉시)" : "NORMAL"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 🏢 실시간 공공데이터 기업 프로필 (이지데스크 egdesk-company-research MCP 연동) */}
                    {selectedInquiry.ai_company_analysis.realCompanyProfile && (
                      <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between text-indigo-300 font-extrabold">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                            <span>이지데스크 공공데이터 실시간 기업 프로필 (국민연금 DB 연동)</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                            공공데이터 검증완료
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-400 block">정식 법인/사업장명</span>
                            <strong className="text-white truncate block">
                              {selectedInquiry.ai_company_analysis.realCompanyProfile.workplaceName}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">고용 규모 (국민연금)</span>
                            <strong className="text-emerald-300">
                              {selectedInquiry.ai_company_analysis.realCompanyProfile.subscriberCount
                                ? `${selectedInquiry.ai_company_analysis.realCompanyProfile.subscriberCount}명`
                                : "확인 중"}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">설립일 / 업력</span>
                            <strong className="text-white">
                              {selectedInquiry.ai_company_analysis.realCompanyProfile.establishedDate
                                ? `${selectedInquiry.ai_company_analysis.realCompanyProfile.establishedDate.slice(0, 4)}년`
                                : "확인 중"}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">공공 등록 업종</span>
                            <strong className="text-white truncate block">
                              {selectedInquiry.ai_company_analysis.realCompanyProfile.industryName ||
                                selectedInquiry.industry ||
                                "-"}
                            </strong>
                          </div>
                        </div>
                        {selectedInquiry.ai_company_analysis.realCompanyProfile.address && (
                          <div className="text-[10px] text-slate-300/80 pt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>📍 소재지: {selectedInquiry.ai_company_analysis.realCompanyProfile.address}</span>
                            {selectedInquiry.ai_company_analysis.realCompanyProfile.form && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 text-[9px]">
                                {selectedInquiry.ai_company_analysis.realCompanyProfile.form}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 핵심 요약 및 영업 조치 제안 */}
                    <div className="p-3 rounded-xl bg-indigo-900/40 border border-indigo-700/50 space-y-1 text-[11px]">
                      <div className="text-indigo-200 leading-relaxed font-medium">
                        💡 {selectedInquiry.ai_score.summary}
                      </div>
                      {selectedInquiry.ai_score.recommendedAction && (
                        <div className="text-amber-300 font-bold leading-relaxed flex items-center gap-1">
                          <span>👉 조치 권장:</span> {selectedInquiry.ai_score.recommendedAction}
                        </div>
                      )}
                    </div>

                    {/* 🌟 수혜 가능 정부지원사업 매칭 (핵심 영역) */}
                    {selectedInquiry.ai_company_analysis.matchedVouchers &&
                      selectedInquiry.ai_company_analysis.matchedVouchers.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-black text-amber-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                            <span>추천 연계 정부지원사업 & 바우처 (최대 70~80% 국비 지원)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedInquiry.ai_company_analysis.matchedVouchers.map((v: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-white/5 border border-indigo-800/50 space-y-1 hover:bg-white/10 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-black text-white text-[11px] truncate">{v.name}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                      {v.supportRatio}
                                    </span>
                                    {isExternalHttpUrl(v.postUrl) && (
                                      <a
                                        href={v.postUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 font-bold flex items-center gap-0.5"
                                        title="공고 상세 바로가기"
                                      >
                                        <span>공고</span>
                                        <ExternalLink className="w-2 h-2" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-300/80 leading-relaxed">
                                  {v.matchReason}
                                </div>
                                {v.agency && (
                                  <div className="text-[9px] text-indigo-300/60 font-medium">
                                    주관: {v.agency}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* 📢 기업마당(BizInfo) 실시간 접수 중 정부지원사업 공고 (이지데스크 egdesk-bizinfo MCP 연동) */}
                    {selectedInquiry.ai_company_analysis.liveBizinfoAnnouncements &&
                      selectedInquiry.ai_company_analysis.liveBizinfoAnnouncements.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-black text-teal-300 flex items-center justify-between flex-wrap gap-1">
                            <span className="flex items-center gap-1.5">
                              <Briefcase className="w-3.5 h-3.5 text-teal-400" />
                              <span>기업마당(BizInfo) 실시간 접수 중 공고 (클릭 시 원문 이동)</span>
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {selectedInquiry.ai_company_analysis.realCompanyProfile?.address && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
                                  📍 {selectedInquiry.ai_company_analysis.realCompanyProfile.address.split(" ").slice(0, 2).join(" ")} &amp; 제조/AI 맞춤
                                </span>
                              )}
                              <span className="text-teal-400/80 font-normal">
                                중기부 실시간 공공 API
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedInquiry.ai_company_analysis.liveBizinfoAnnouncements.map((grant: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-white/5 border border-teal-800/40 space-y-1 hover:bg-white/10 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-bold text-white text-[11px] line-clamp-1 flex-1">
                                    {grant.title}
                                  </span>
                                  {isExternalHttpUrl(grant.postUrl) && (
                                    <a
                                      href={grant.postUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-teal-300 hover:text-teal-200 font-bold flex items-center gap-0.5 shrink-0 hover:underline ml-1"
                                    >
                                      <span>상세</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-slate-300/80 flex-wrap">
                                  <span>🏛️ {grant.agency || grant.executor}</span>
                                  <span>📅 {grant.period || "접수 중"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* 추천 자동화 구축 범위 */}
                    {selectedInquiry.ai_company_analysis.automationScope &&
                      selectedInquiry.ai_company_analysis.automationScope.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                            <Target className="w-3 h-3 text-indigo-400" />
                            <span>AI 추천 자동화 구축 범위:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedInquiry.ai_company_analysis.automationScope.map((scope: string, idx: number) => (
                              <span
                                key={idx}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-indigo-100"
                              >
                                ✓ {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* 세일즈 피칭 포인트 */}
                    {selectedInquiry.ai_company_analysis.salesPitchingPoints &&
                      selectedInquiry.ai_company_analysis.salesPitchingPoints.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-amber-300" />
                            <span>고객 설득 핵심 세일즈 피칭 포인트:</span>
                          </div>
                          <ul className="list-disc list-inside text-[11px] text-slate-300/90 space-y-0.5">
                            {selectedInquiry.ai_company_analysis.salesPitchingPoints.map((pt: string, idx: number) => (
                              <li key={idx} className="leading-relaxed">
                                {pt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                ) : (
                  /* 🔍 공공데이터 동명/유사 기업 확인 및 선택 섹션 (Human-in-the-Loop) */
                  <div className="space-y-3 pt-1">
                    {/* 상단 상황 안내 박스 */}
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-black text-amber-300 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>공공데이터(국민연금) 기업 검증 및 선택 (Human-in-the-Loop)</span>
                        </span>
                        {selectedInquiry.biz_number && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                            사업자번호: {selectedInquiry.biz_number}
                          </span>
                        )}
                        {selectedInquiry.website_url && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-bold">
                            웹사이트: {selectedInquiry.website_url}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-amber-200/90 leading-relaxed">
                        {selectedInquiry.biz_number
                          ? "신청서에 기재된 사업자등록번호와 일치하는 기업을 확인하거나 아래 목록에서 확정해 주세요."
                          : "신청서에 사업자등록번호가 기재되지 않아 동명/유사 상호 오분석을 방지하기 위해 AI 분석을 보류했습니다. 아래 공공데이터 후보 중 실제 의뢰 기업을 선택해 주세요."}
                      </p>
                    </div>

                    {/* 후보 기업 리스트 */}
                    {(() => {
                      const currentCandidates =
                        (liveCandidates.length > 0 ? liveCandidates : selectedInquiry.candidate_profiles) || [];

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-300">
                            <span className="font-bold flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                              <span>'{selectedInquiry.company_name}' 검색 후보 기업 목록</span>
                              <span className="text-emerald-400 font-extrabold">({currentCandidates.length}건)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleFetchCandidates(selectedInquiry.company_name)}
                              disabled={isSearchingCandidates}
                              className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1 underline cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-2.5 h-2.5 ${isSearchingCandidates ? "animate-spin" : ""}`} />
                              <span>{isSearchingCandidates ? "검색 중..." : "실시간 재조회"}</span>
                            </button>
                          </div>

                          {currentCandidates.length > 0 ? (
                            <div className="grid grid-cols-1 gap-2">
                              {currentCandidates.map((cand: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                                >
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <strong className="text-white font-black text-sm">
                                        {cand.workplaceName}
                                      </strong>
                                      {cand.form && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                          {cand.form}
                                        </span>
                                      )}
                                      {cand.businessNumberPrefix && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300">
                                          사업자번호 앞자리: {cand.businessNumberPrefix}
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                                      <div>
                                        <span className="text-slate-400">고용 인원: </span>
                                        <strong className="text-emerald-300 font-bold">
                                          {cand.subscriberCount ? `${cand.subscriberCount}명` : "확인 중"}
                                        </strong>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">등록 업종: </span>
                                        <span className="text-slate-200 truncate">{cand.industryName || "미기재"}</span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400">설립연도: </span>
                                        <span className="text-slate-200">
                                          {cand.establishedDate ? `${cand.establishedDate.slice(0, 4)}년` : "확인 중"}
                                        </span>
                                      </div>
                                    </div>
                                    {cand.address && (
                                      <div className="text-[10px] text-slate-400 truncate">
                                        📍 {cand.address}
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleAnalyzeLead(selectedInquiry, cand)}
                                    disabled={isAnalyzingLead}
                                    className="w-full sm:w-auto shrink-0 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>🎯 이 회사로 확정 & AI 분석</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center text-xs text-slate-300 space-y-1">
                              <p>공공데이터(국민연금)에서 동일 상호의 사업장을 발견하지 못했습니다.</p>
                              <p className="text-[11px] text-slate-400">
                                신규 설립 기업이거나 공공데이터 미등록 개인사업자일 수 있습니다.
                              </p>
                            </div>
                          )}

                          {/* 일반 기업으로 분석 실행 버튼 */}
                          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/10">
                            <p className="text-[10px] text-slate-400">
                              후보 목록에 없거나 공공데이터 미등록 기업인 경우:
                            </p>
                            <button
                              type="button"
                              onClick={() => handleAnalyzeLead(selectedInquiry, null)}
                              disabled={isAnalyzingLead}
                              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>🏢 공공데이터 미등록 일반 기업으로 분석</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}

              {/* 상담 메모 및 답변 입력 (세로 확장 & 리사이즈 지원 & AI 초안) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-800">
                      {selectedInquiry.source === "ENTERPRISE_INQUIRY"
                        ? "상담 기록 & 견적 회신 메모"
                        : "관리자 답변 내용"}
                    </label>
                    {hasAppliedAiDraft && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 animate-in fade-in">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>AI 맞춤 초안 자동 적용됨</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                      우측 하단 드래그로 높이 조절 가능
                    </span>
                    <button
                      type="button"
                      onClick={() => handleGenerateAiDraft()}
                      disabled={isGeneratingDraft}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-800 border border-emerald-300 text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                      title="고객의 요구사항과 업종을 분석하여 전문적인 답변 초안을 새로 작성합니다"
                    >
                      <Sparkles className={`w-3 h-3 text-emerald-600 ${isGeneratingDraft ? "animate-spin" : ""}`} />
                      <span>{isGeneratingDraft ? "AI 초안 작성 중..." : "✨ AI 초안 다시 작성"}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={answerInput}
                  onChange={(e) => {
                    setAnswerInput(e.target.value);
                    setHasAppliedAiDraft(false);
                  }}
                  placeholder={
                    isGeneratingDraft
                      ? "✨ AI가 고객 정보를 분석하여 전문적인 맞춤 답변 초안을 작성 중입니다..."
                      : selectedInquiry.source === "ENTERPRISE_INQUIRY"
                      ? "고객 유선 상담 결과, 예상 견적 범위, 1차 진단 리포트 발송 일자 등 상담 기록을 메모하세요."
                      : "고객에게 전달할 상세 답변을 입력해 주세요. 등록 즉시 고객 문의 내역에 반영됩니다."
                  }
                  className="w-full text-xs p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 resize-y min-h-[140px] leading-relaxed"
                />
              </div>
            </div>

            {/* 고정 모달 하단 푸터 */}
            {(() => {
              const applicant = extractApplicantInfo(selectedInquiry);
              return (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedInquiry.category !== "FDE_APPLICATION" &&
                      !(selectedInquiry.title && selectedInquiry.title.includes("파트너 지원")) && (
                        <button
                          type="button"
                          onClick={() => setProposalInquiry(selectedInquiry)}
                          className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 text-white hover:opacity-95 cursor-pointer inline-flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                          title="공식 맞춤 제안서 및 견적서 A4 프리뷰 및 PDF 출력"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>📑 AI 맞춤 제안·견적서 PDF</span>
                        </button>
                      )}
                  </div>

                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {/* 📲 0원 스마트폰 문자 즉시 발송 */}
                    {applicant.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyChannel("SMS");
                          setReplyErrorMsg(null);
                          setReplySuccessMsg(null);
                        }}
                        disabled={!answerInput.trim() || isSendingReply}
                        className="px-3 py-2 rounded-xl text-xs font-black bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-40"
                        title="고객 스마트폰으로 0원 구글메시지 즉시 발송"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>📲 0원 문자 발송</span>
                      </button>
                    )}

                    {/* ✉️ 공식 HTML 메일 즉시 회신 */}
                    {applicant.email && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyChannel("EMAIL");
                          setEmailSubjectInput(
                            `[SheetBot] ${applicant.name} 고객님, 문의하신 사항에 대해 공식 답변을 안내해 드립니다`
                          );
                          setReplyErrorMsg(null);
                          setReplySuccessMsg(null);
                        }}
                        disabled={!answerInput.trim() || isSendingReply}
                        className="px-3 py-2 rounded-xl text-xs font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-40"
                        title="SheetBot 공식 브랜드 반응형 HTML 이메일 즉시 발송"
                      >
                        <Mail className="w-3.5 h-3.5 text-indigo-600" />
                        <span>✉️ 공식 메일 회신</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedInquiry(null)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      취소
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAnswer}
                      disabled={submittingAnswer || !answerInput.trim()}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5 shadow-xs transition-all"
                      title="발송 없이 내부 상담 메모 또는 관리자 답변만 저장"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {submittingAnswer
                          ? "저장 중..."
                          : selectedInquiry.source === "ENTERPRISE_INQUIRY"
                          ? "메모만 저장"
                          : "답변만 저장"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 📲 / ✉️ 옴니채널 발송 확인 및 미리보기 모달 */}
      {replyChannel && selectedInquiry && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* 상단 헤더 */}
            <div
              className={`p-4 text-white flex items-center justify-between ${
                replyChannel === "SMS"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-700"
                  : "bg-gradient-to-r from-indigo-600 to-purple-700"
              }`}
            >
              <div className="flex items-center gap-2">
                {replyChannel === "SMS" ? (
                  <Smartphone className="w-5 h-5 text-emerald-200" />
                ) : (
                  <Mail className="w-5 h-5 text-indigo-200" />
                )}
                <div>
                  <h3 className="text-sm font-black">
                    {replyChannel === "SMS"
                      ? "📲 스마트폰 0원 문자 즉시 발송"
                      : "✉️ SheetBot 공식 HTML 이메일 즉시 회신"}
                  </h3>
                  <p className="text-[11px] text-white/80">
                    {replyChannel === "SMS"
                      ? "구글메시지 MCP 연동 무료 발송"
                      : "공식 브랜드 반응형 템플릿 메일 전송"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyChannel(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 본문 */}
            <div className="p-5 space-y-4 text-xs">
              {/* 수신자 정보 카드 */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">수신 대상자</span>
                  <span className="font-extrabold text-slate-900 text-sm">
                    {extractApplicantInfo(selectedInquiry).name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 block">
                    {replyChannel === "SMS" ? "수신 전화번호" : "수신 이메일"}
                  </span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {replyChannel === "SMS"
                      ? extractApplicantInfo(selectedInquiry).phone
                      : extractApplicantInfo(selectedInquiry).email}
                  </span>
                </div>
              </div>

              {/* 이메일 채널일 때 제목 입력 */}
              {replyChannel === "EMAIL" && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700">이메일 제목</label>
                  <input
                    type="text"
                    value={emailSubjectInput}
                    onChange={(e) => setEmailSubjectInput(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium"
                  />
                </div>
              )}

              {/* 발송 메시지 미리보기 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">
                    {replyChannel === "SMS" ? "발송될 문자 본문" : "메일 본문 답변 내용"}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    글자수: {answerInput.trim().length}자
                  </span>
                </div>
                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap border border-slate-800 shadow-inner">
                  {answerInput.trim()}
                </div>
              </div>

              {/* 안내 가이드 배너 */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-0.5">
                <p className="font-bold flex items-center gap-1">
                  <span>💡</span>
                  <span>{replyChannel === "SMS" ? "0원 스마트폰 발송 안내" : "공식 회신 안내"}</span>
                </p>
                <p className="text-amber-800/90 text-[10px] leading-relaxed">
                  {replyChannel === "SMS"
                    ? "관리자 스마트폰을 경유하여 발송되므로 별도의 통신사 요금이 들지 않는 0원 문자입니다. 발송 완료 즉시 대장에 '답변완료'로 자동 갱신됩니다."
                    : "SheetBot Enterprise 공식 브랜딩 서식이 적용된 HTML 이메일로 발송됩니다. 발송 완료 즉시 대장에 '답변완료'로 자동 갱신됩니다."}
                </p>
              </div>

              {/* 상태 피드백 */}
              {replyErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{replyErrorMsg}</span>
                </div>
              )}

              {replySuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{replySuccessMsg}</span>
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setReplyChannel(null)}
                disabled={isSendingReply}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSendReply}
                disabled={isSendingReply || Boolean(replySuccessMsg)}
                className={`px-5 py-2 rounded-xl text-xs font-black text-white shadow-md active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 ${
                  replyChannel === "SMS"
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                <Send className={`w-3.5 h-3.5 ${isSendingReply ? "animate-spin" : ""}`} />
                <span>{isSendingReply ? "발송 중..." : "🚀 지금 바로 발송 승인"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📑 공식 제안서 & 견적서 프리뷰/인쇄 모달 */}
      {proposalInquiry && (
        <AdminProposalModal
          inquiry={proposalInquiry}
          onClose={() => setProposalInquiry(null)}
        />
      )}
    </div>
  );
}
