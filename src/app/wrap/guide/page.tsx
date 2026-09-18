"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Zap,
  Layers,
  Smartphone,
  Mail,
  FileSearch,
  Database,
  BarChart3,
} from "lucide-react";

export default function WrapGuidePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 3단계 실전 퀵스타트
  const quickSteps = [
    {
      step: "01",
      title: "구글 시트 래핑 주소 발급 (1초 완성)",
      desc: "본인의 구글 스프레드시트 URL을 입력하거나, 시트가 없다면 [✨ 시트 주소 없이 새 시트로 즉시 시작]을 클릭하세요. 복잡한 GCP OAuth 설정 없이 AI 에이전트 전용 래핑 주소가 1초 만에 즉시 발급됩니다.",
      tip: "새 시트로 시작해도 AI가 필요한 탭과 컬럼 헤더 구조를 알아서 처음부터 설계해 줍니다.",
      badge: "1초 발급",
    },
    {
      step: "02",
      title: "바이브코딩 AI 채팅창에 붙여넣기",
      desc: "발급된 전용 래핑 주소를 복사하여 안티그라비티(Antigravity), Cursor, Claude Code 등 사용 중인 AI 채팅창에 붙여넣고, 원하는 자동화 기능을 한국어 자연어로 요청하세요.",
      tip: "예: '웹 주소: [발급주소], 고객 주문 시 문자 발송 메뉴 만들어줘'",
      badge: "자연어 지시",
    },
    {
      step: "03",
      title: "시트 새로고침(F5) 후 즉시 실행",
      desc: "AI가 코드를 구글 시트에 주입한 후, 내 구글 시트를 열어 새로고침(F5)을 누르세요. 시트 상단에 [🚀 SheetBot 메뉴]가 자동으로 생성되어 모든 기능을 즉시 원클릭으로 실행할 수 있습니다.",
      tip: "시트 내장 [🤖 SheetBot AI 코파일럿] 사이드바를 통해 시트 안에서도 추가 개발이 가능합니다.",
      badge: "자동 생성 완료",
    },
  ];

  // 실전 프롬프트 레시피 5선
  const promptRecipes = [
    {
      id: "recipe_sms",
      title: "신규 주문/예약 시 고객 휴대폰 알림 문자 자동 발송",
      tag: "스마트 알림",
      icon: Smartphone,
      prompt: `아래 웹 주소를 통해 내 구글 시트에 주문 알림 문자 발송 기능을 구현해줘:
웹 주소: [발급받은 래핑 주소]
요구사항:
1. 시트 상단에 '🚀 SheetBot 메뉴'를 등록하고 '📱 선택 행 고객 알림 문자 일괄 발송' 메뉴를 추가해줘.
2. A열 체크박스가 선택된 행의 전화번호(C열)와 주문자명(B열)을 읽어 발송 승인창을 띄운 뒤 문자를 발송해줘.
3. 발송 결과는 F열에 '성공(일시)'으로 기록해줘.`,
    },
    {
      id: "recipe_email",
      title: "Gmail 고객 맞춤 HTML 안내 이메일 원클릭 일괄 발송",
      tag: "이메일 자동화",
      icon: Mail,
      prompt: `아래 웹 주소를 통해 내 구글 시트에 Gmail 일괄 발송 기능을 주입해줘:
웹 주소: [발급받은 래핑 주소]
요구사항:
1. GmailApp.sendEmail을 활용하여 선택된 고객들에게 모던하고 깔끔한 HTML 서식 안내 메일을 보내줘.
2. 발송 전 남아있는 무료 일일 쿼터(MailApp.getRemainingDailyQuota)를 확인하여 초과 시 사전 차단해줘.
3. 발송 완료 시 해당 행의 상태를 연한 초록색으로 칠해줘.`,
    },
    {
      id: "recipe_ocr",
      title: "영수증 / 명함 AI OCR 사진 업로드 자동 데이터 입력",
      tag: "AI OCR",
      icon: FileSearch,
      prompt: `아래 웹 주소를 통해 내 구글 시트에 영수증 OCR 사이드바를 만들어줘:
웹 주소: [발급받은 래핑 주소]
요구사항:
1. '🚀 SheetBot 메뉴'에 '🧾 영수증 사진 AI 자동 입력' 사이드바 메뉴를 등록해줘.
2. 사이드바에서 영수증 이미지를 업로드하면 날짜, 상호명, 금액, 품목을 분석해 시트 마지막 행에 자동 기입해줘.`,
    },
    {
      id: "recipe_report",
      title: "일일 매출 및 재고 현황 자동 집계 & 요약 보고서",
      tag: "데이터 집계",
      icon: BarChart3,
      prompt: `아래 웹 주소를 통해 내 구글 시트에 일일 결산 자동화 기능을 추가해줘:
웹 주소: [발급받은 래핑 주소]
요구사항:
1. '매출내역' 시트의 데이터를 바탕으로 당일 매출 합계와 베스트 상품 Top 5를 계산해 '일일대시보드' 탭에 자동 갱신해줘.
2. 매일 저녁 7시에 자동으로 실행되는 시간 기반 트리거를 등록해줘.`,
    },
    {
      id: "recipe_db",
      title: "외부 ERP / SQLite 데이터베이스 양방향 실시간 동기화",
      tag: "DB 동기화",
      icon: Database,
      prompt: `아래 웹 주소를 통해 내 구글 시트에 SQLite 클라우드 DB 양방향 동기화 기능을 구현해줘:
웹 주소: [발급받은 래핑 주소]
요구사항:
1. 시트 상단 메뉴에 '[1] 시트 데이터 클라우드 전송', '[2] 최신 데이터 조회', '[3] 수정/삭제 일괄 동기화' 3종 메뉴를 등록해줘.
2. 조회 시 날짜 서식 오염을 방지하고 정확한 고유 ID로 동기화되도록 구성해줘.`,
    },
  ];

  // FAQ 5선
  const faqs = [
    {
      q: "구글 시트 주소가 아직 없어도 바로 래핑할 수 있나요?",
      a: "네, 가능합니다! [✨ 시트 주소 없이 새 시트로 즉시 시작]을 클릭하시면 새 스프레드시트와 연동 가능한 래핑 주소가 즉시 발급됩니다. 안티그라비티 등 AI에 해당 주소를 전달하면, AI가 필요한 컬럼 헤더와 양식을 처음부터 자동으로 설계해 줍니다.",
    },
    {
      q: "기존에 쓰던 구글 시트의 데이터나 서식이 지워지나요?",
      a: "절대 지워지지 않습니다. 시트봇의 안전 병합(Merge) 엔진은 기존 시트의 데이터, 서식, 수식, 그리고 이미 작성되어 있던 Apps Script 코드를 100% 안전하게 보존하면서 새로운 자동화 기능만 덧붙입니다.",
    },
    {
      q: "안티그라비티(Antigravity) 외에 다른 AI 도구에서도 쓸 수 있나요?",
      a: "네, 완벽하게 호환됩니다! Google 안티그라비티뿐만 아니라 Cursor, Claude Code, Windsurf, v0, VS Code Cline 등 외부 웹 API 호출 및 브라우징을 지원하는 모든 바이브코딩 AI 도구에서 100% 동일하게 동작합니다.",
    },
    {
      q: "AI가 코드를 넣은 후 구글 시트 메뉴는 어떻게 확인하나요?",
      a: "AI가 연동 및 코드 주입을 마쳤다고 응답하면, 해당 구글 시트 브라우저 창에서 새로고침(F5)을 누르세요. 시트 상단 툴바 오른쪽에 [🚀 SheetBot 메뉴]가 자동으로 생성되어 원하는 기능을 바로 클릭하여 실행할 수 있습니다.",
    },
    {
      q: "복잡한 구글 클라우드(GCP) 계정이나 개발자 등록이 필요한가요?",
      a: "전혀 필요 없습니다. GCP 프로젝트 생성, OAuth 클라이언트 ID 발급, 서비스 계정 JSON 키 발급 등의 어려운 과정 없이, 시트봇의 클라우드 브릿지가 모든 통신과 권한을 안전하게 중계해 드립니다.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* 상단 블러 조명 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* 상단 네비게이션 바 */}
        <div className="flex items-center justify-between pb-8 border-b border-slate-800/80 mb-10">
          <Link
            href="/wrap"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>AI 래퍼 화면으로 돌아가기</span>
          </Link>

          <Link
            href="/wrap"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold shadow-md shadow-indigo-600/20 hover:from-indigo-500 hover:to-blue-500 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>즉시 래핑 시작</span>
          </Link>
        </div>

        {/* 헤더 섹션 */}
        <div className="text-center space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>SheetBot Wrapping Guide</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            Google 시트 AI 래핑 <br className="sm:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-teal-300 to-emerald-400">
              1분 완성 실전 가이드
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
            복잡한 GCP 설정이나 API 키 발급 없이, 시트 주소 하나로{" "}
            <a
              href="https://antigravity.google/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
            >
              안티그라비티
            </a>
            , Cursor, Claude Code와 연결되는 AI 브릿지를 발급받고 자연어로 자동화 프로그램을 완성하세요.
          </p>
        </div>

        {/* 섹션 1: 시트봇 래핑(Wrapping)이란? */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl mb-12 shadow-xl">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm mb-3">
            <Layers className="w-4 h-4" />
            <span>핵심 개념 이해하기</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mb-3">
            시트봇 AI 래핑(Wrapping)이란 무엇인가요?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2">
            기존에 구글 스프레드시트를 AI 코딩 도구와 연동하려면 복잡한 Google Cloud Console 프로젝트 개설, OAuth 동의 화면 설정, 서비스 계정 JSON 키 발급 등 수십 단계의 까다로운 절차가 필요했습니다.<br /><br />
            <strong>시트봇 AI 래핑</strong>은 이러한 장벽을 완전히 없애고, 구글 시트 링크 하나만 입력하면 AI 에이전트가 시트의 구조를 안전하게 읽고 Google Apps Script(GAS) 코드를 직접 주입할 수 있는 <strong className="text-emerald-300">전용 보안 브릿지 주소</strong>를 단 1초 만에 즉시 발급해 주는 혁신적인 기술입니다.
          </p>
        </div>

        {/* 섹션 2: 3단계 실전 퀵스타트 */}
        <div className="space-y-6 mb-16">
          <div className="text-center space-y-1">
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Simple 3-Steps</div>
            <h2 className="text-2xl font-black text-white">초간단 3단계 실전 사용법</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {quickSteps.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col justify-between hover:border-indigo-500/40 transition-all shadow-lg group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 font-black text-sm flex items-center justify-center border border-indigo-500/30">
                      {item.step}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    {item.desc}
                  </p>
                </div>

                <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-normal">
                  💡 <strong className="text-slate-300">Tip:</strong> {item.tip}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 섹션 3: 실전 프롬프트 레시피 5선 */}
        <div className="space-y-6 mb-16">
          <div className="text-center space-y-1">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Prompt Recipes</div>
            <h2 className="text-2xl font-black text-white">바로 복사해 쓰는 실전 프롬프트 5선</h2>
            <p className="text-xs text-slate-400">
              발급된 래핑 주소를 넣고 안티그라비티나 Cursor에 그대로 붙여넣어 실행해 보세요.
            </p>
          </div>

          <div className="space-y-4">
            {promptRecipes.map((r) => {
              const IconComp = r.icon;
              const isCopied = copiedId === r.id;

              return (
                <div
                  key={r.id}
                  className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{r.title}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">{r.tag}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(r.prompt, r.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer border border-slate-700"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>프롬프트 복사</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed select-all">
                    {r.prompt}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>

        {/* 섹션 4: 자주 묻는 질문 (FAQ) */}
        <div className="space-y-6 mb-16">
          <div className="text-center space-y-1">
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">FAQ</div>
            <h2 className="text-2xl font-black text-white">자주 묻는 질문 Top 5</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 space-y-2 text-left"
              >
                <div className="flex items-start gap-2.5 text-sm font-bold text-white">
                  <span className="text-indigo-400 shrink-0 font-mono">Q.</span>
                  <span>{faq.q}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-slate-400 pl-5 leading-relaxed">
                  <span className="text-emerald-400 shrink-0 font-mono">A.</span>
                  <span>{faq.a}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 최종 CTA 배너 */}
        <div className="bg-gradient-to-r from-indigo-900/60 via-slate-900 to-emerald-950/60 border border-indigo-500/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="relative z-10 space-y-2">
            <h3 className="text-xl sm:text-2xl font-black text-white">
              준비가 되셨나요? 지금 바로 구글 시트를 래핑해보세요.
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              시트 주소가 없어도 1초 만에 발급받아 안티그라비티와 연결할 수 있습니다.
            </p>
          </div>

          <div className="pt-2 relative z-10 flex justify-center">
            <Link
              href="/wrap"
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/30 transition-all transform hover:scale-105"
            >
              <span>⚡ 지금 바로 1초 래핑하러 가기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 하단 푸터 */}
        <div className="text-center mt-12 text-xs text-slate-600">
          SheetBot AI Wrapper Guide &bull; Compatible with Antigravity, Cursor, Claude Code
        </div>
      </div>
    </div>
  );
}
