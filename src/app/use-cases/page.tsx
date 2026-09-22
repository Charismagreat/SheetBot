"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sparkles,
  Search,
  Copy,
  CheckCircle2,
  ArrowRight,
  Smartphone,
  Clock,
  Zap,
  Bot,
  RotateCcw,
  PanelRight,
  Mail,
  FileCheck,
  Layers,
  ShoppingBag,
  Building2,
  GraduationCap,
  Wrench,
  MessageSquare,
  FileSpreadsheet
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { USE_CASES, CATEGORIES, type UseCase } from "@/lib/data/use-cases";

export default function UseCasesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredUseCases = useMemo(() => {
    return USE_CASES.filter((item) => {
      // 카테고리 필터
      const matchesCategory =
        selectedCategory === "all" ||
        item.category === selectedCategory ||
        (selectedCategory === "사이드바" && item.triggerType === "sidebar") ||
        (selectedCategory === "IT·개발" &&
          (item.category === "IT·개발" || item.category === "AI·개발"));

      // 검색어 필터
      const query = searchQuery.trim().toLowerCase();
      if (!query) return matchesCategory;

      const matchesQuery =
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.target.toLowerCase().includes(query) ||
        item.painPoint.toLowerCase().includes(query) ||
        item.solution.toLowerCase().includes(query) ||
        item.prompt.toLowerCase().includes(query) ||
        item.triggerLabel.toLowerCase().includes(query);

      return matchesCategory && matchesQuery;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      {/* 헤더 섹션 */}
      <section className="bg-white border-b border-slate-200/80 pt-12 pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>실전 비즈니스 자동화 레시피 {USE_CASES.length}종</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight break-keep">
            내 업무에 딱 맞는{" "}
            <span className="bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-600 bg-clip-text text-transparent">
              스프레드시트 자동화
            </span>
            를 찾아보세요
          </h1>

          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed break-keep">
            복잡한 코딩이나 외부 개발 외주 없이, 마음에 드는 사례의 프롬프트를 복사하여 대시보드에 붙여넣기만 하세요. 구글 클라우드에 3초 만에 배포됩니다.
          </p>

          {/* 검색창 */}
          <div className="max-w-xl mx-auto pt-4">
            <div className="relative flex items-center">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색어를 입력하세요 (예: 재고, 출결, 미수금, 문자, 월세...)"
                className="w-full pl-11 pr-10 py-3.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 rounded-2xl text-sm font-medium text-slate-800 transition-all outline-none placeholder:text-slate-400 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                  title="검색어 초기화"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchQuery && (
              <div className="flex items-center justify-between text-xs text-slate-500 px-2 pt-2">
                <span>
                  '<strong className="text-teal-700 font-bold">{searchQuery}</strong>' 검색 결과: 총{" "}
                  <strong>{filteredUseCases.length}</strong>건
                </span>
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-teal-600 hover:underline font-bold"
                >
                  전체 보기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 카테고리 탭 (가로 스크롤 대응) */}
        <div className="max-w-6xl mx-auto mt-8 flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm shadow-slate-900/20"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800"
                }`}
              >
                <span>{cat.label}</span>
                {cat.id === "all" && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isActive ? "bg-teal-400 text-slate-900" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {USE_CASES.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 활용사례 카드 그리드 */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-12">
        {/* =========================================================================
            [신규 킬러 쇼케이스] 구글 시트 3장으로 끝내는 초경량 ERP 멀티 시트 파이프라인
           ========================================================================= */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-teal-500/30 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-black">
                <Layers className="w-3.5 h-3.5 text-teal-400" />
                <span>엔터프라이즈 멀티 시트 오케스트레이션</span>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white break-keep">
                "A시트 입력 ➔ B시트 자동 가공 ➔ C시트 무료 고객 문자"
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 break-keep">
                수천만 원짜리 맞춤형 ERP나 월 수십만 원 Zapier 없이, 서로 다른 구글 시트 3개만 이으면 우리 회사 자동화 완성!
              </p>
            </div>
            <div className="text-xs px-3.5 py-2 rounded-2xl bg-white/5 border border-white/10 text-teal-200 shrink-0 font-mono">
              💡 부서 간 시트 권한 완벽 격리 + 평생 통신비 0원
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. 유통/쇼핑몰 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl">
                    <ShoppingBag className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">1. 유통·쇼핑몰: 주문 ➔ 창고 ➔ 배송문자</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md">일 2시간 절감</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-emerald-400 font-bold">[A] 주문 접수처:</span> 쇼핑몰 주문 인입 시트</div>
                <div className="text-[11px] text-teal-400 pl-3">↳ 박스 규격·창고 위치 자동 연산 &amp; 포장팀 실시간 전달</div>
                <div>• <span className="text-teal-400 font-bold">[B] 창고 출고대장:</span> 출고 지시서 생성 (창고에 매출 시트 차단)</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 송장 등록 즉시 고객 스마트폰으로 무료 알림 발송</div>
                <div>• <span className="text-amber-300 font-bold">[C] 고객 DB:</span> "OO님 주문이 출고되었습니다" 무료 SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 창고 직원에게 매출 시트 노출 원천 차단 + 오배송 0건
              </p>
            </div>

            {/* 2. B2B / 영업·회계 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl">
                    <Building2 className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">2. B2B·에이전시: 수주 ➔ 회계원장 ➔ 입금안내</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md">미수금 누락 0%</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-indigo-400 font-bold">[A] 영업 수주대장:</span> 영업팀 계약 체결 및 발주 품목 입력</div>
                <div className="text-[11px] text-indigo-300 pl-3">↳ 공급가액·세액(10%)·마진율 자동 계산 후 회계 원장 전송</div>
                <div>• <span className="text-teal-400 font-bold">[B] 회계 미수금원장:</span> 입금 기한별 정산 대장 기입 (영업팀 차단)</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 결제일 D-3일 전 거래처 경리 스마트폰으로 무료 알림 발송</div>
                <div>• <span className="text-amber-300 font-bold">[C] 거래처 경리DB:</span> "[OO상사] 세금계산서 입금 예정일 안내" SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 부서 간 엑셀 대조 업무 0건 + 미수금 회수 속도 3배 개선
              </p>
            </div>

            {/* 3. 학원 / 병의원 / 상담 */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-amber-500/20 text-amber-300 rounded-xl">
                    <GraduationCap className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">3. 학원·병원: 상담예약 ➔ 강사배정 ➔ 노쇼방지</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md">노쇼율 80% 급감</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-amber-400 font-bold">[A] 상담 예약접수:</span> 웹 설문지/홈페이지 신청서 접수</div>
                <div className="text-[11px] text-amber-300 pl-3">↳ 희망 시간대 분석 후 담당 강사/의사별 빈 시간대 자동 배정</div>
                <div>• <span className="text-teal-400 font-bold">[B] 스케줄 캘린더:</span> 강사·의사별 진료/수업 일정 자동 기입</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 배정 즉시 확정 안내 및 방문 D-1일 리마인드 무료 SMS</div>
                <div>• <span className="text-amber-300 font-bold">[C] 수강생·환자DB:</span> 약도·준비물이 포함된 확정 &amp; 리마인드 SMS</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 월 10만 원 예약 솔루션 구독료 0원 + 노쇼 손실 완전 차단
              </p>
            </div>

            {/* 4. 제조 / 현장 AS */}
            <div className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-5 space-y-3 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-teal-500/20 text-teal-300 rounded-xl">
                    <Wrench className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-sm sm:text-base text-white">4. 제조·현장AS: 고장접수 ➔ 부품출고 ➔ 기사출동</h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded-md">전화 통화 0건</span>
              </div>
              <div className="text-xs space-y-1.5 text-slate-300 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">
                <div>• <span className="text-teal-400 font-bold">[A] AS 고장접수:</span> 고객 장비 모델명 및 고장 증상 접수</div>
                <div className="text-[11px] text-teal-300 pl-3">↳ 수리 부품 본사 재고 자동 차감 &amp; 수리 이력 대장 이관</div>
                <div>• <span className="text-indigo-400 font-bold">[B] 부품재고 대장:</span> 본사 부품 재고 실시간 동기화</div>
                <div className="text-[11px] text-emerald-400 pl-3">↳ 지역 관할 현장 기사에게 고객 위치·증상 담긴 출동 SMS</div>
                <div>• <span className="text-amber-300 font-bold">[C] 기사·고객 DB:</span> 출동 지시 SMS &amp; 고객 방문 예정 알림</div>
              </div>
              <p className="text-[11px] text-slate-400">
                <strong className="text-white">실제 효과:</strong> 현장-창고-기사 간 전화 통화 0건 + 고객 AS 당일 즉시 출동
              </p>
            </div>
          </div>
        </section>
        {filteredUseCases.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">검색 결과가 없습니다</h3>
              <p className="text-xs text-slate-500 mt-1">
                다른 검색어를 입력하시거나 카테고리 필터를 '전체 보기'로 변경해 보세요.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCategory("all");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold rounded-xl transition-all"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {filteredUseCases.map((uc) => {
              const CategoryIcon = uc.categoryIcon;
              const isCopied = copiedId === uc.id;

              return (
                <div
                  key={uc.id}
                  className="bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all p-6 sm:p-7 flex flex-col justify-between space-y-6"
                >
                  {/* 상단 태그 & 트리거 정보 */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${uc.badgeColor}`}
                      >
                        <CategoryIcon className="w-3.5 h-3.5" />
                        <span>{uc.category}</span>
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                        {uc.triggerType === "schedule" && <Clock className="w-3.5 h-3.5 text-indigo-500" />}
                        {uc.triggerType === "onEdit" && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                        {uc.triggerType === "onFormSubmit" && <MessageSquare className="w-3.5 h-3.5 text-teal-500" />}
                        {uc.triggerType === "menu" && <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
                        {uc.triggerType === "bridge" && <Bot className="w-3.5 h-3.5 text-purple-500" />}
                        {uc.triggerType === "sidebar" && <PanelRight className="w-3.5 h-3.5 text-indigo-600" />}
                        <span className="font-semibold text-slate-700">{uc.triggerLabel}</span>
                      </div>
                    </div>

                    <div>
                      <h2 className="text-xl font-black text-slate-900 leading-snug tracking-tight break-keep">
                        {uc.title}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium mt-1 break-keep">
                        🎯 추천 대상: {uc.target}
                      </p>
                    </div>

                    {/* Before & After 비교 박스 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-rose-800 text-xs font-extrabold">
                          <span className="text-[11px] px-1.5 py-0.2 bg-rose-200/80 rounded text-rose-900">
                            기존 고통
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                          {uc.painPoint}
                        </p>
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-extrabold">
                          <span className="text-[11px] px-1.5 py-0.2 bg-emerald-200/80 rounded text-emerald-900">
                            시트봇 도입 후
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                          {uc.solution}
                        </p>
                      </div>
                    </div>

                    {/* 스마트폰 문자 프리뷰 (SMS가 있는 경우) */}
                    {uc.smsPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>0원 문자 발송 프리뷰 ({uc.smsPreview.sender})</span>
                          </div>
                          <span>무제한 무료</span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed whitespace-pre-line border border-slate-700/60">
                          {uc.smsPreview.message}
                        </div>
                      </div>
                    )}

                    {/* 이메일 프리뷰 (Gmail인 경우) */}
                    {uc.emailPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                            <Mail className="w-3.5 h-3.5" />
                            <span>Gmail 발송 프리뷰 (수신: {uc.emailPreview.recipient})</span>
                          </div>
                          <span className="text-emerald-400 font-semibold">HTML 이메일</span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed border border-slate-700/60 space-y-1">
                          <div className="text-slate-300 font-bold border-b border-slate-700/70 pb-1 text-[11px]">
                            제목: {uc.emailPreview.subject}
                          </div>
                          <div className="whitespace-pre-line text-slate-200 text-xs pt-0.5">
                            {uc.emailPreview.body}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 사이드바 UI 프리뷰 (사이드바인 경우) */}
                    {uc.sidebarPreview && (
                      <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-2 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                            <PanelRight className="w-3.5 h-3.5" />
                            <span>{uc.sidebarPreview.title}</span>
                          </div>
                          <span className="text-purple-300 font-semibold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                            {uc.sidebarPreview.badge}
                          </span>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3 text-xs font-sans text-slate-100 leading-relaxed border border-slate-700/60 flex items-center gap-2">
                          <span className="text-slate-200">{uc.sidebarPreview.description}</span>
                        </div>
                      </div>
                    )}

                    {/* AI 프롬프트 미리보기 */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                          <span>시트봇 전용 프롬프트</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          대시보드에 복사해 넣기만 하세요
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700 font-mono leading-relaxed max-h-24 overflow-y-auto">
                        "{uc.prompt}"
                      </div>
                    </div>
                  </div>

                  {/* 하단 버튼 그룹 */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5 border-t border-slate-100">
                    <button
                      onClick={() => handleCopy(uc.prompt, uc.id)}
                      className={`w-full sm:flex-1 py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isCopied
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          <span>프롬프트 복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>프롬프트 1초 복사</span>
                        </>
                      )}
                    </button>

                    <Link
                      href="/dashboard"
                      className="w-full sm:w-auto py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 whitespace-nowrap"
                    >
                      <span>이 사례로 시작</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 안내 배너: 기업 맞춤형 경량 ERP & AX 구축 연결 */}
        <section className="mt-16 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-3xl p-8 sm:p-12 text-white text-center space-y-6 shadow-xl border border-teal-800/40">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-400/20 text-teal-300 text-xs font-bold border border-teal-400/30">
            <Building2 className="w-3.5 h-3.5" />
            <span>기업 맞춤형 경량 ERP / MES 구축 &amp; 정부지원금 80~90% 매칭</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight break-keep">
            레시피에 없는 우리 회사만의 특수한 엑셀 장부와 ERP 연동이 필요하신가요?
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed break-keep">
            33종의 실전 검증 레시피와 이지데스크 MCP 엔진을 조합하여, 전담 AX 컨설턴트가 <strong>1~2주 안에 대표님 사업장 전용 맞춤 시스템</strong>을 완성해 드립니다.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/enterprise"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-md active:scale-95"
            >
              <span>🏢 기업 맞춤 AX 진단 &amp; 견적 신청하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-2xl transition-all border border-white/15"
            >
              <span>내 구글 시트로 직접 시작하기</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
