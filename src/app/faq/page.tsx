"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { HelpCircle, ChevronDown, Sparkles, MessageSquare, ArrowRight, ShieldCheck, Coins, RefreshCw } from "lucide-react";

interface FaqItem {
  id?: string;
  category: string;
  question?: string;
  q?: string;
  answer?: string;
  a?: string;
}

const FALLBACK_FAQS: FaqItem[] = [
  {
    category: "시작하기",
    q: "Google Apps Script 코딩 경험이 전혀 없어도 이용할 수 있나요?",
    a: "네, 완전히 가능합니다! SheetBot은 복잡한 자바스크립트 문법 대신 '매일 특정 시트에 합산해줘'와 같은 자연어 명령만 입력하면 AI가 실행 가능한 완전한 코드를 생성하고, 구글 클라우드와 터널을 통해 대상 시트에 원클릭으로 주입해 줍니다.",
  },
  {
    category: "시작하기",
    q: "자동화하려는 구글 시트의 권한은 어떻게 주어야 하나요?",
    a: "로그인하신 구글 계정에 편집 권한이 있는 시트라면 별도의 복잡한 공유 설정 없이 시트 URL만 등록하면 됩니다. 브라우저 주소창의 'https://docs.google.com/spreadsheets/d/...' URL을 그대로 복사하여 프로젝트 생성창에 붙여넣으시면 됩니다.",
  },
  {
    category: "토큰/결제",
    q: "매월 자동 결제되는 정기 구독(월정액) 방식인가요?",
    a: "아닙니다. SheetBot은 쓰지도 않는 월 구독료가 나가는 방식이 아닌, 원하는 만큼만 결제해 충전해서 사용하는 '선불형 토큰 지갑' 방식입니다. 충전하신 토큰은 유효기간 없이 평생 보관되며, 수식을 생성하거나 스크립트를 배포할 때만 소모됩니다.",
  },
  {
    category: "토큰/결제",
    q: "결제 후 영수증(매출전표)이나 세금계산서, 현금영수증을 발급받을 수 있나요?",
    a: "네! [토큰 충전 & 요금제] 페이지 하단의 '내 최근 충전/결제 대장'에서 [🧾 영수증] 버튼을 누르면 부가세(10%)가 분리 표기된 정식 신용카드 매출전표를 즉시 인쇄하거나 PDF로 저장할 수 있습니다. 사업자 지출증빙을 위한 [📑 계산서 / 현금영수증] 신청도 원클릭으로 접수 가능합니다.",
  },
  {
    category: "Apps Script/기능",
    q: "시트를 닫아두어도 스케줄(트리거)이 자동으로 돌아가나요?",
    a: "네, 그렇습니다! Google Apps Script의 시간 기반 트리거(Time-driven Trigger)를 구글 클라우드 서버에 직접 등록하기 때문에, 사용자가 컴퓨터를 끄거나 브라우저를 닫아두어도 구글 서버에서 약속된 주기(예: 매일 자정, 매주 월요일 등)에 맞춰 자동으로 스크립트가 실행됩니다.",
  },
  {
    category: "Apps Script/기능",
    q: "시트에 있는 기존 데이터가 덮어씌워지거나 지워질 위험은 없나요?",
    a: "SheetBot이 생성하는 모든 코드는 '안전 우선(Safety-First)' 원칙을 준수합니다. 기존 데이터를 삭제하기 전 검증하거나, 신규 데이터를 항상 마지막 행 아래에 누적(Append)하도록 기본 설계되며, 구글 시트 상단 메뉴에 '시트봇 자동화' 전용 메뉴가 생겨 안전하게 수동 테스트 후 스케줄을 가동할 수 있습니다.",
  },
  {
    category: "보안/계정",
    q: "제 스프레드시트의 내부 데이터가 다른 사용자에게 노출되지는 않나요?",
    a: "절대 노출되지 않습니다. SheetBot은 엄격한 '회원별 데이터 완전 격리(Multi-User Isolation)' 정책을 준수합니다. 본인의 구글 로그인 세션 이메일과 일치하는 프로젝트만 조회·관리되며, 타 회원의 프로젝트나 시트 정보는 데이터베이스 수준에서 원천 차단됩니다.",
  },
  {
    category: "보안/계정",
    q: "어떤 AI 모델을 사용하나요? 최신 모델로 변경할 수 있나요?",
    a: "이지데스크의 고성능 AI Caller를 통해 Google Gemini 3.5 Flash 및 최신 Gemini 3.8 Flash 모델과 실시간 연동되어 있습니다. [AI 모델 환경 설정] 페이지에서 원하는 모델과 Temperature 파라미터를 언제든 자유롭게 변경할 수 있습니다.",
  },
];

export default function FaqPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>(FALLBACK_FAQS);
  const [selectedCat, setSelectedCat] = useState<string>("전체");
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchFaqs();
  }, []);

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/faqs");
      const data = await res.json();
      if (data.success && Array.isArray(data.faqs) && data.faqs.length > 0) {
        setFaqs(data.faqs);
      }
    } catch (e) {
      console.warn("Failed to fetch dynamic faqs, using fallback", e);
    } finally {
      setLoading(false);
    }
  };

  const categories = ["전체", "시작하기", "토큰/결제", "Apps Script/기능", "보안/계정"];

  const filteredFaqs = selectedCat === "전체" 
    ? faqs 
    : faqs.filter((f) => f.category === selectedCat);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* 상단 헤더 */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200/60 shadow-xs">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>자주 묻는 질문 (FAQ)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            궁금한 점을 빠르고 명쾌하게 확인하세요
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            SheetBot 이용 방법, 토큰 충전 및 환불 규정, 구글 시트 보안과 스케줄 자동화에 관한 주요 질문들을 실시간으로 제공합니다.
          </p>
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
