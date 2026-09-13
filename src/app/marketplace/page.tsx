"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MARKETPLACE_TEMPLATES,
  MarketplaceTemplate,
} from "@/data/marketplace-templates";
import {
  Sparkles,
  ExternalLink,
  CheckCircle2,
  Star,
  Copy,
  Layers,
  ArrowRight,
  Zap,
  Info,
  Smartphone,
  Mail,
  Camera,
  Search,
  Bot,
  X,
  Mic,
} from "lucide-react";

export default function MarketplacePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeModalTemplate, setActiveModalTemplate] = useState<MarketplaceTemplate | null>(null);
  const [copySuccessAlert, setCopySuccessAlert] = useState<string | null>(null);

  const categories = [
    { id: "ALL", label: "전체 템플릿" },
    { id: "MARKETING", label: "마케팅 / 고객관리" },
    { id: "AUTOMATION", label: "업무 자동화" },
    { id: "AI_OCR", label: "AI 문서 인식(OCR)" },
    { id: "VOICE_AI", label: "음성 AI & 통화 CRM" },
  ];

  const filteredTemplates = MARKETPLACE_TEMPLATES.filter((tpl) => {
    const matchesCategory =
      selectedCategory === "ALL" || tpl.category === selectedCategory;
    const matchesSearch =
      tpl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpl.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCopyClick = (tpl: MarketplaceTemplate) => {
    window.open(tpl.copyUrl, "_blank");
    setCopySuccessAlert(tpl.title);
    setTimeout(() => {
      setCopySuccessAlert(null);
    }, 6000);
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case "MessageSquare":
        return <Smartphone className="w-6 h-6 text-white" />;
      case "Mail":
        return <Mail className="w-6 h-6 text-white" />;
      case "ScanText":
      case "CreditCard":
        return <Camera className="w-6 h-6 text-white" />;
      case "Mic":
        return <Mic className="w-6 h-6 text-white" />;
      default:
        return <Zap className="w-6 h-6 text-white" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* 템플릿 마켓 전용 독립 헤더 (다른 사이트 메뉴 일체 제거) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-slate-900 tracking-tight">SheetBot</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-full">
                  공식 템플릿 마켓
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium block -mt-0.5">
                실무 검증 4대 핵심 구글 시트 자동화 전용 쇼케이스
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all"
            >
              <span>내 워크스페이스</span>
            </Link>
            <button
              onClick={() => window.close()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all cursor-pointer"
              title="이 탭 닫기"
            >
              <X className="w-3.5 h-3.5" />
              <span>창 닫기</span>
            </button>
          </div>
        </div>
      </header>

      {/* 상단 알림 배너 (복제 클릭 시 안내) */}
      {copySuccessAlert && (
        <div className="bg-emerald-600 text-white px-4 py-3 shadow-md sticky top-16 z-30 flex items-center justify-between animate-fade-in">
          <div className="max-w-7xl mx-auto flex items-center gap-3 w-full text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-200" />
            <div>
              <strong>[{copySuccessAlert}]</strong> 구글 사본 복제 페이지가 새 탭에서 열렸습니다!
              <span className="ml-2 text-emerald-100 hidden md:inline">
                (구글 계정에 로그인 후 [사본 만들기] 버튼을 누르면 본인 드라이브에 즉시 복사됩니다)
              </span>
            </div>
          </div>
          <button
            onClick={() => setCopySuccessAlert(null)}
            className="text-emerald-100 hover:text-white text-xs font-bold px-2 py-1"
          >
            닫기
          </button>
        </div>
      )}

      {/* 히어로 헤더 섹션 */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-900 via-slate-900 to-slate-950 text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-5">
            <Sparkles className="w-4 h-4" />
            <span>SheetBot 공식 인증 자동화 템플릿 마켓</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-5 leading-tight">
            복잡한 개발 없이 <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">클릭 한 번</span>으로 복제하는<br />
            실무 검증 구글 시트 자동화 마켓
          </h1>

          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto mb-8 font-normal leading-relaxed">
            기업과 1인 사업가들이 현업에서 직접 사용 중인 킬러 자동화 시트를 즉시 내 구글 드라이브로 가져가세요.
            Google Apps Script 소스코드와 스마트 메뉴가 완벽히 내장되어 있습니다.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                1초
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">1-클릭 사본 복제</div>
                <div className="text-slate-400">내 구글 드라이브로 즉시 복사</div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-bold">
                0원
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">100% 무료 공식 제공</div>
                <div className="text-slate-400">추가 라이선스 비용 없는 영구 소장</div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 font-bold">
                내장
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Apps Script 코드 일체형</div>
                <div className="text-slate-400">사이드바 및 맞춤 메뉴 기본 포함</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 본문 카탈로그 컨테이너 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="템플릿 이름, 기능 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-800"
            />
          </div>
        </div>

        {/* 템플릿 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col group"
            >
              <div className={`p-6 bg-gradient-to-br ${tpl.gradient} text-white relative`}>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-xs text-[11px] font-extrabold text-white">
                    {tpl.categoryLabel}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-900 text-[11px] font-black shadow-xs">
                    {tpl.badge}
                  </span>
                </div>

                <div className="flex items-center gap-3.5 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                    {getIconComponent(tpl.icon)}
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight leading-snug group-hover:underline">
                      {tpl.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-white/80 mt-0.5">
                      <div className="flex items-center gap-1 text-amber-300 font-bold">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{tpl.rating}</span>
                      </div>
                      <span>•</span>
                      <span>복제 {tpl.downloadsCount.toLocaleString()}회</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-white/90 font-medium leading-relaxed">
                  {tpl.tagline}
                </p>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {tpl.summary}
                  </p>

                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      핵심 탑재 기능
                    </div>
                    {tpl.keyFeatures.slice(0, 3).map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {tpl.recommendedFor.slice(0, 2).map((rec, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-medium"
                      >
                        #{rec}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">이용 가격</span>
                      <span className="text-base font-black text-emerald-600">
                        무료 (0원)
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveModalTemplate(tpl)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>상세 가이드 보기</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={tpl.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span>미리보기</span>
                    </a>

                    <button
                      onClick={() => handleCopyClick(tpl)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.02]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>사본 복제하기</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 mb-1">
              검색된 자동화 템플릿이 없습니다
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              다른 검색어를 입력하거나 카테고리 필터를 '전체'로 변경해 보세요.
            </p>
            <button
              onClick={() => {
                setSelectedCategory("ALL");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl"
            >
              필터 초기화
            </button>
          </div>
        )}

        {/* 복제 후 초기 사용법 가이드 섹션 */}
        <section className="mt-16 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-3xl border border-emerald-200/80 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6">
            <div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                초보자 안심 가이드
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                복제한 구글 시트는 어떻게 시작하나요? (단 2단계)
              </h2>
            </div>
            <Link
              href="/guide"
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              <span>전체 사용 매뉴얼 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-2xs">
              <div className="flex items-center gap-2.5 font-bold text-xs text-emerald-800 mb-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                [사본 만들기] 클릭 후 구글 1회 권한 승인
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                상단의 <strong>[사본 복제하기]</strong> 버튼을 누르면 구글 공식 복제창이 열립니다. 본인의 구글 드라이브에 시트가 복사된 후, 상단 메뉴(예: 🚀 SheetBot)를 처음 클릭할 때 구글 보안 확인 창이 1회 나타납니다. <strong>[고급] → [프로젝트명(안전하지 않음)으로 이동] → [허용]</strong>을 클릭하면 즉시 모든 자동화가 활성화됩니다.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-2xs">
              <div className="flex items-center gap-2.5 font-bold text-xs text-emerald-800 mb-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
                내 계정 이메일 자동 인식 및 즉시 발송/분석
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                모든 템플릿은 <strong>동적 사용자 인식(Session Email)</strong>이 적용되어 있어, 별도의 복잡한 API 키 수정 없이 로그인된 구글 계정으로 작동합니다. 스마트폰 문자 발송의 경우 본인 스마트폰 기기를 SheetBot 대시보드에서 등록하면 즉시 시트와 100% 무료 연동됩니다.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* 템플릿 상세 모달 */}
      {activeModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 relative">
            <button
              onClick={() => setActiveModalTemplate(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-sm font-bold w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
            >
              ✕
            </button>

            <div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                {activeModalTemplate.categoryLabel}
              </span>
              <h2 className="text-xl font-black text-slate-900 mt-2">
                {activeModalTemplate.title}
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {activeModalTemplate.tagline}
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-700 leading-relaxed">
              {activeModalTemplate.summary}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                포함된 전체 기능 명세 ({activeModalTemplate.keyFeatures.length}종)
              </h4>
              <div className="space-y-1.5">
                {activeModalTemplate.keyFeatures.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                시작 단계 가이드
              </h4>
              <div className="space-y-2">
                {activeModalTemplate.usageGuide.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setActiveModalTemplate(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  const tpl = activeModalTemplate;
                  setActiveModalTemplate(null);
                  handleCopyClick(tpl);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>내 드라이브로 1-클릭 복제하기</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 템플릿 마켓 전용 독립 미니 푸터 */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">SheetBot 템플릿 마켓플레이스</span>
            <span>•</span>
            <span>Google Apps Script 일체형 시트 100% 무료 제공</span>
          </div>
          <div className="text-slate-400 text-[11px]">
            복제된 사본은 사용자의 개인 구글 드라이브에 안전하게 영구 저장됩니다.
          </div>
        </div>
      </footer>
    </div>
  );
}
