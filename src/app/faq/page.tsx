"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { HelpCircle, ChevronDown, Sparkles, MessageSquare, ArrowRight, RefreshCw, Search, X } from "lucide-react";
import { DEFAULT_FAQS } from "@/lib/default-faqs";

interface FaqItem {
  id?: string;
  category: string;
  question?: string;
  q?: string;
  answer?: string;
  a?: string;
  sort_order?: number;
}

export default function FaqPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [selectedCat, setSelectedCat] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchFaqs();
  }, []);

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/faqs");
      const data = await res.json();
      if (data.success && Array.isArray(data.faqs) && data.faqs.length > 0) {
        setFaqs(data.faqs);
      }
    } catch (e) {
      console.warn("Failed to fetch dynamic faqs, using default", e);
    } finally {
      setLoading(false);
    }
  };

  const categories = ["전체", "시작하기", "토큰/결제", "Apps Script/기능", "보안/계정"];

  // 카테고리 필터 및 검색어 필터 결합
  const filteredFaqs = faqs.filter((f) => {
    const matchCat = selectedCat === "전체" || f.category === selectedCat;
    if (!matchCat) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const question = (f.question || f.q || "").toLowerCase();
    const answer = (f.answer || f.a || "").toLowerCase();
    return question.includes(q) || answer.includes(q);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* 상단 헤더 */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200/60 shadow-xs">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>자주 묻는 질문</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            자주 묻는 질문 (FAQ)
          </h1>
        </div>

        {/* 실시간 키워드 검색창 */}
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpenIdx(null);
              }}
              placeholder="궁금한 질문이나 키워드를 검색해 보세요 (예: 엑셀, 견적서, 안티그라비티, 토큰 등)"
              className="w-full pl-12 pr-10 py-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs text-sm placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                title="검색어 지우기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="flex items-center justify-between px-2 text-xs text-slate-500">
              <span>
                <strong>"{searchQuery}"</strong> 검색 결과: <strong className="text-indigo-600">{filteredFaqs.length}</strong>건
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCat("전체");
                }}
                className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
              >
                검색 초기화
              </button>
            </div>
          )}
        </div>

        {/* 카테고리 필터 탭 */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCat(cat);
                setOpenIdx(null);
              }}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer ${
                selectedCat === cat
                  ? "bg-slate-900 text-white shadow-md"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 아코디언 리스트 */}
        <div className="space-y-3">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            const questionText = faq.question || faq.q || "";
            const answerText = faq.answer || faq.a || "";

            return (
              <div
                key={faq.id || idx}
                className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                  isOpen ? "border-indigo-300 shadow-md ring-1 ring-indigo-100" : "border-slate-200/80 shadow-xs hover:border-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 px-2.5 py-1 text-[11px] font-bold rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {faq.category}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                      {questionText}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-indigo-600" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100/80 whitespace-pre-line bg-slate-50/50">
                    {answerText}
                  </div>
                )}
              </div>
            );
          })}

          {/* 검색 결과 0건일 때 안내 */}
          {filteredFaqs.length === 0 && (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
              <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-base font-bold text-slate-800">일치하는 질문을 찾지 못했습니다</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {searchQuery ? `"${searchQuery}"에 해당하는 FAQ가 없습니다.` : "선택하신 카테고리에 등록된 질문이 없습니다."}
                <br />다른 단어로 검색하시거나 하단의 1:1 고객센터로 문의해 주세요.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCat("전체");
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                전체 질문 보기
              </button>
            </div>
          )}
        </div>

        {/* 하단 문의 배너 */}
        <div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>원하는 답변을 찾지 못하셨나요?</span>
            </div>
            <h3 className="text-xl font-bold">1:1 고객센터로 직접 문의해 보세요</h3>
            <p className="text-xs text-indigo-200/80">
              자동화 구축 에러, 결제 영수증 처리, 맞춤형 기능 요청 등 전문 매니저가 친절하게 안내해 드립니다.
            </p>
          </div>
          <Link
            href="/contact"
            className="shrink-0 px-6 py-3.5 rounded-xl bg-white text-indigo-900 text-xs font-black hover:bg-indigo-50 transition-all shadow-md inline-flex items-center gap-2 group cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <span>1:1 문의 남기기</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </main>
    </div>
  );
}
