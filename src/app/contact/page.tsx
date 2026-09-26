"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { useAuthAdmin } from "@/contexts/AuthAdminContext";
import { onUserDataChanged } from "@/lib/egdesk-helpers";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  Mail,
  Phone,
  Building,
  Loader2,
  History,
  Radio,
} from "lucide-react";

interface Inquiry {
  id: string;
  category: string;
  title: string;
  content: string;
  status: "PENDING" | "ANSWERED";
  answer?: string;
  created_at: string;
}

export default function ContactPage() {
  // ⚡ [인헤릿 최상위 상속] NextAuth 세션 및 사용자 정보 즉시 상속 (중복 로딩 0ms)
  const { session, userEmail } = useAuthAdmin();

  // ⚡ [SWR 캐시 복원] 브라우저 세션 스토리지에서 이전 문의 내역 즉시 복원 (화면 깜빡임 0ms)
  const [cachedInquiries] = useState<Inquiry[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("sb_contact_inquiries");
        return saved ? JSON.parse(saved) : [];
      } catch {}
    }
    return [];
  });

  const [form, setForm] = useState({
    name: session?.user?.name || "",
    email: userEmail || "",
    category: "GAS_ERROR",
    title: "",
    content: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [inquiries, setInquiries] = useState<Inquiry[]>(() => cachedInquiries);
  const [loadingHistory, setLoadingHistory] = useState(() => cachedInquiries.length === 0 && Boolean(userEmail));
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);
  const isFetchingRef = useRef<boolean>(false);

  // 상위 인증 컨텍스트 변경 시 폼 기본값 실시간 동기화
  useEffect(() => {
    if (userEmail) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || session?.user?.name || "",
        email: prev.email || userEmail,
      }));
    }
  }, [userEmail, session?.user?.name]);

  // ⚡ [문의 대장 단일 조회 헬퍼] 중복 호출 방지 및 SWR 캐시 동기화
  const fetchMyInquiries = useCallback(async (silent = false) => {
    if (!userEmail) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!silent && inquiries.length === 0) setLoadingHistory(true);
      const res = await apiFetch("/api/inquiries");
      const data = await res.json();
      if (data.success && Array.isArray(data.inquiries)) {
        setInquiries(data.inquiries);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("sb_contact_inquiries", JSON.stringify(data.inquiries));
          } catch {}
        }
      }
    } catch (err) {
      console.error("문의 내역 조회 오류:", err);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setLoadingHistory(false);
    }
  }, [userEmail, inquiries.length]);

  // ⚡ [부트스트랩 & 0초 실시간 DB 왓처] 마운트 시 1회 조회 및 관리자 답변 즉시 반영
  useEffect(() => {
    if (!userEmail) return;

    // 초기 마운트 시 캐시 유무와 무관하게 백그라운드 1회 최신화
    void fetchMyInquiries(cachedInquiries.length > 0);

    // ⚡ [0초 실시간 감시] sheetbot_inquiries 테이블 변경 이벤트 수신 시 0초 화면 갱신
    const unsub = onUserDataChanged((event) => {
      setIsRealtimeLive(true);
      if (!event.tableName || event.tableName === "sheetbot_inquiries") {
        void fetchMyInquiries(true);
      }
    });

    return () => {
      unsub();
    };
  }, [userEmail, fetchMyInquiries, cachedInquiries.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.email || !form.title || !form.content) {
      setSubmitError("이메일, 제목, 문의 내용을 모두 입력해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(data.message);
        setForm((prev) => ({
          ...prev,
          title: "",
          content: "",
        }));
        // 등록 즉시 내역 갱신
        await fetchMyInquiries(true);
      } else {
        setSubmitError(data.error || "문의 접수에 실패했습니다.");
      }
    } catch (err: any) {
      setSubmitError(err.message || "네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabels: Record<string, string> = {
    GAS_ERROR: "스크립트 오류 / 기술 지원",
    PAYMENT: "토큰 결제 / 세금계산서 문의",
    PROPOSAL: "기능 제안 / 맞춤 자동화 개발",
    OTHER: "기타 일반 문의",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* 상단 타이틀 */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 shadow-xs">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>1:1 고객 문의 &amp; 기술 지원</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            궁금한 점이나 기술 지원이 필요하신가요?
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Google Apps Script 오류 해결, 대량 엔터프라이즈 맞춤 개발, 결제 증빙 발급 등 어떤 문의든 친절하고 신속하게 답변해 드립니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 좌측: 고객센터 안내 카드 */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-base text-slate-900">시트봇 고객지원센터</h3>
                <p className="text-xs text-slate-500">영업일 기준 평균 2시간 이내 빠른 회신</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-800">이메일 공식 접수</div>
                    <div className="text-slate-500 font-mono">support@sheetbot.io</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-800">운영 시간</div>
                    <div className="text-slate-500">평일 09:00 - 18:00 (점심 12:00 - 13:00)</div>
                    <div className="text-[11px] text-slate-400">주말 및 공휴일은 이메일 접수 순차 처리</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-800">본사 소재지</div>
                    <div className="text-slate-500">서울특별시 강남구 테헤란로 123 시트봇 빌딩 8층</div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>실시간 빠른 답변이 필요할 땐?</span>
                </div>
                <p>
                  화면 우측 하단의 <strong>시트봇 AI (SheetBot AI)</strong> 위젯을 누르시면 시트 수식과 Apps Script 코드 문법 질문을 즉시 해결할 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          {/* 우측: 문의 작성 폼 */}
          <div className="lg:col-span-2">
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h2 className="font-extrabold text-base text-slate-900">1:1 온라인 문의 접수</h2>
                <span className="text-[11px] text-slate-400 font-medium">* 필수 항목</span>
              </div>

              {submitSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2.5 animate-fade-in">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {submitError && (
                <div className="p-4 rounded-2xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold flex items-center gap-2.5 animate-fade-in">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 text-xs">
                    <label className="font-bold text-slate-700">이름 / 담당자명</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="홍길동"
                      className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <label className="font-bold text-slate-700">
                      회신받을 이메일 주소 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="your@email.com"
                      className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-bold text-slate-700">문의 분야</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold text-slate-700"
                  >
                    <option value="GAS_ERROR">스크립트 오류 / 기술 지원</option>
                    <option value="PAYMENT">토큰 결제 / 세금계산서 문의</option>
                    <option value="PROPOSAL">기능 제안 / 맞춤 자동화 개발</option>
                    <option value="OTHER">기타 일반 문의</option>
                  </select>
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-bold text-slate-700">
                    문의 제목 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="문의하실 핵심 내용을 간략히 적어주세요."
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs"
                  />
                </div>

                <div className="space-y-1.5 text-xs">
                  <label className="font-bold text-slate-700">
                    문의 상세 내용 <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="오류 현상, 시트 목적, 발생 일시 등을 구체적으로 남겨주시면 더욱 정확하고 빠른 조치가 가능합니다."
                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs leading-relaxed"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{submitting ? "접수 진행 중..." : "문의 접수하기"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* 내 접수 문의 내역 (로그인 회원인 경우) */}
        {userEmail && (
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-800 font-extrabold text-sm">
                <History className="w-4 h-4 text-emerald-600" />
                <span>내가 접수한 1:1 문의 대장</span>
                {isRealtimeLive && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200/60 animate-fade-in">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>0초 실시간</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{inquiries.length}건</span>
                <button
                  type="button"
                  onClick={() => fetchMyInquiries(false)}
                  disabled={loadingHistory}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                  title="새로고침"
                >
                  <Clock className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {loadingHistory ? (
              <div className="text-center py-8 text-xs text-slate-400">내역을 조회 중입니다...</div>
            ) : inquiries.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                접수하신 문의 내역이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inquiries.map((inq) => (
                  <div key={inq.id} className="py-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded text-[10px]">
                          {categoryLabels[inq.category] || inq.category}
                        </span>
                        <h4 className="font-extrabold text-slate-900">{inq.title}</h4>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
                          inq.status === "ANSWERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inq.status === "ANSWERED" ? "답변완료" : "접수대기"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl">
                      {inq.content}
                    </p>
                    {inq.answer && (
                      <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs space-y-1 text-emerald-950">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>운영팀 공식 답변</span>
                        </div>
                        <p className="leading-relaxed">{inq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
