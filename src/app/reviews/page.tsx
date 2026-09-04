"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Star,
  MessageSquare,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  X,
  Loader2,
  Calendar,
  User,
  Quote,
} from "lucide-react";

interface Review {
  id: string;
  user_name: string;
  rating: number;
  title: string;
  content: string;
  use_case?: string;
  created_at: string;
}

export default function ReviewsPage() {
  const { data: session } = useSession();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // 후기 작성 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    rating: 5,
    title: "",
    content: "",
    use_case: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reviews");
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error("후기 조회 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!form.title || !form.content) {
      setFormError("제목과 후기 내용을 모두 입력해 주세요.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setFormSuccess(data.message);
        setForm({
          rating: 5,
          title: "",
          content: "",
          use_case: "",
        });
        await fetchReviews();
        setTimeout(() => {
          setIsModalOpen(false);
          setFormSuccess(null);
        }, 1500);
      } else {
        setFormError(data.error || "후기 등록에 실패했습니다.");
      }
    } catch (err: any) {
      setFormError(err.message || "네트워크 오류 발생");
    } finally {
      setSubmitting(false);
    }
  };

  // 평균 평점 계산
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / reviews.length).toFixed(1)
    : "5.0";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* 상단 헤더 & 평점 요약 */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xs">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200/60">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>실제 회원 생생 이용 경험</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              SheetBot과 함께 업무를 자동화한 회원들의 이야기
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              수기 반복 업무에서 해방된 실무자, 스타트업 대표, 개발자 분들의 진솔한 활용 후기를 확인해 보세요.
            </p>
          </div>

          <div className="flex items-center gap-6 p-5 bg-slate-50 rounded-2xl border border-slate-100 shrink-0">
            <div className="text-center space-y-1">
              <div className="text-3xl font-black text-slate-900 tracking-tight">{avgRating}</div>
              <div className="flex items-center gap-0.5 text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-amber-400" />
                ))}
              </div>
              <div className="text-[11px] text-slate-400 font-medium">총 {reviews.length}개 리뷰</div>
            </div>

            <div className="pl-4 border-l border-slate-200">
              {session?.user ? (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>내 후기 남기기</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>로그인하고 후기 쓰기</span>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* 후기 카드 그리드 */}
        {loading ? (
          <div className="text-center py-24 text-slate-400 text-xs">후기 목록을 불러오는 중입니다...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-24 text-slate-400 text-xs">아직 등록된 후기가 없습니다. 첫 번째 후기의 주인공이 되어보세요!</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative"
              >
                <div className="space-y-3">
                  {/* 상단: 별점 & 유즈케이스 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= (r.rating || 5) ? "fill-amber-400 text-amber-400" : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    {r.use_case && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md text-[10px] font-bold border border-emerald-200/60">
                        {r.use_case}
                      </span>
                    )}
                  </div>

                  {/* 제목 & 본문 */}
                  <h3 className="font-extrabold text-sm text-slate-900 leading-snug">{r.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                    "{r.content}"
                  </p>
                </div>

                {/* 하단 작성자 정보 */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{r.user_name}</span>
                  </div>
                  <span>{r.created_at ? r.created_at.substring(0, 10) : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 후기 작성 모달 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden relative animate-scale-up">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Quote className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-black text-base text-slate-900">SheetBot 사용 후기 작성</h3>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
                {formSuccess && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{formSuccess}</span>
                  </div>
                )}
                {formError && (
                  <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">만족도 평점</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm({ ...form, rating: star })}
                        className="cursor-pointer transition-transform hover:scale-110 p-1"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= form.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-200 hover:text-amber-300"
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-black text-slate-700 ml-2">{form.rating}점 / 5점</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">활용 분야 (선택)</label>
                  <input
                    type="text"
                    value={form.use_case}
                    onChange={(e) => setForm({ ...form, use_case: e.target.value })}
                    placeholder="예: 일일 매출 자동 마감, 재고 알림 웹훅 등"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">한 줄 요약 제목 *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="SheetBot을 사용하고 달라진 점을 한 줄로 요약해 주세요."
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">후기 상세 내용 *</label>
                  <textarea
                    required
                    rows={4}
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="어떤 점이 가장 유용했는지, 자동화를 통해 절약된 시간 등을 솔직하게 작성해 주세요."
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    <span>{submitting ? "등록 중..." : "후기 등록 완료"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
