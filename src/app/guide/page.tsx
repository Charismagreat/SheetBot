"use client";

import React, { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  BookOpen,
  Sparkles,
  Play,
  FileSpreadsheet,
  Clock,
  Zap,
  ArrowRight,
  ShieldCheck,
  Code,
  CheckCircle2,
  HelpCircle,
  Copy,
  ChevronRight,
} from "lucide-react";

export default function GuidePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const steps = [
    {
      step: "01",
      title: "구글 계정 1초 로그인 & 자동화 대상 시트 준비",
      desc: "별도의 회원가입 없이 구글 계정으로 로그인하면 20,000 웰컴 토큰이 즉시 지급됩니다. 자동화하고자 하는 구글 스프레드시트의 URL 또는 시트 ID를 준비해 주세요.",
      tip: "구글 시트 브라우저 주소창의 'https://docs.google.com/spreadsheets/d/...' 전체 주소를 그대로 복사하시면 됩니다.",
    },
    {
      step: "02",
      title: "자연어로 원하는 자동화 기능 작성",
      desc: "코딩 문법을 몰라도 평소 한국어로 업무를 요청하듯 요구사항을 적어주세요. AI가 완벽한 Google Apps Script(GAS) 자바스크립트 코드로 실시간 변환합니다.",
      tip: "예: '매일 밤 11시에 A시트 2행부터 마지막 데이터까지 복사해서 백업 시트에 누적해줘'",
    },
    {
      step: "03",
      title: "Google Apps Script 원클릭 코드 생성 및 구글 시트 배포",
      desc: "생성된 코드를 검토한 뒤 '구글 시트에 배포하기' 버튼을 누르면 이지데스크 클라우드 터널을 통해 대상 시트에 스크립트 파일이 원격 주입됩니다.",
      tip: "구글 시트 상단 메뉴에 '🚀 시트봇 자동화' 전용 메뉴가 자동으로 등록되어 언제든 시트 안에서도 실행 가능합니다.",
    },
    {
      step: "04",
      title: "자동화 스케줄 & 트리거(Trigger) 등록",
      desc: "사람이 매번 시트를 열지 않아도 정해진 시간(분/시간/일/주) 또는 데이터 입력 시(onEdit) 스스로 돌아가도록 스케줄을 설정하세요.",
      tip: "시트봇 대시보드의 '스케줄 대장'에서 스케줄을 켜고 끄거나, '지금 실행'을 눌러 즉시 테스트할 수 있습니다.",
    },
  ];

  const examples = [
    {
      id: "ex1",
      title: "일일 마감 데이터 특정 시트로 누적 복사",
      tag: "정기 스케줄링",
      prompt: "매일 밤 11시 50분에 '오늘매출' 탭의 A열부터 F열까지의 데이터를 복사해서 '연간누적' 탭의 마지막 빈 행 아래에 붙여넣고, 오늘매출 탭의 입력칸은 초기화해줘.",
    },
    {
      id: "ex2",
      title: "신규 주문 입력 시 담당자 이메일 & 슬랙 알림",
      tag: "이벤트 트리거 (onEdit)",
      prompt: "주문내역 시트의 G열(입금여부)이 '입금완료'로 수정되면, 해당 행의 고객명, 주문금액 정보를 가져와서 order@company.com으로 안내 메일을 발송하고 담당자 슬랙 웹훅으로 알림을 보내줘.",
    },
    {
      id: "ex3",
      title: "품절 재고 데이터 자동 색상 하이라이트",
      tag: "데이터 서식 자동화",
      prompt: "재고관리 시트에서 D열(현재고)의 숫자가 5 이하로 떨어지면 해당 행 전체를 연한 빨간색(#FEE2E2)으로 칠하고 알림 열에 '발주필요'라고 자동으로 입력해줘.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* 상단 타이틀 배너 */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-300 text-xs font-bold border border-white/10">
              <BookOpen className="w-3.5 h-3.5" />
              <span>사용 가이드 &amp; 업무 자동화 레시피</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              SheetBot 시작 가이드:<br />
              스프레드시트를 100배 똑똑하게 쓰는 법
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              코딩을 한 줄도 몰라도 괜찮습니다. Google Apps Script(GAS)를 자연어 한마디로 자동 생성하고 스케줄로 반복 실행하는 실전 워크플로우를 단계별로 안내합니다.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
              >
                <span>내 워크스페이스에서 바로 시작하기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/faq"
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
              >
                <HelpCircle className="w-4 h-4" />
                <span>자주 묻는 질문(FAQ) 보기</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 4단계 시작 가이드 */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Step-by-Step</span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              초보자도 3분 만에 끝내는 4단계 자동화
            </h2>
            <p className="text-xs text-slate-500">
              복잡한 API 연동 키 발급 없이도 브라우저 화면에서 원클릭으로 작동합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 relative"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 font-black text-sm flex items-center justify-center border border-emerald-200/60">
                    {s.step}
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 leading-snug">{s.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-600">
                  <strong className="text-slate-800">💡 꿀팁:</strong> {s.tip}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 실전 업무 자동화 프롬프트 템플릿 */}
        <section className="space-y-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Best Recipes</span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                복사해서 바로 쓰는 인기 자동화 프롬프트
              </h2>
            </div>
            <span className="text-xs text-slate-400">클릭 시 프롬프트 문구가 클립보드에 복사됩니다.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {examples.map((ex) => (
              <div
                key={ex.id}
                className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10.5px] font-bold rounded-md border border-indigo-200/60">
                      {ex.tag}
                    </span>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900">{ex.title}</h3>
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-[11px] text-slate-700 leading-relaxed select-all">
                    "{ex.prompt}"
                  </div>
                </div>

                <button
                  onClick={() => handleCopy(ex.prompt, ex.id)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedId === ex.id ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">복사 완료! 생성기에 붙여넣으세요</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>프롬프트 문구 복사하기</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* 추가 가이드 배너 */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-50 to-indigo-50 border border-amber-200/60 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="text-base font-black text-slate-900">궁금한 점이 해결되지 않으셨나요?</h3>
            <p className="text-xs text-slate-600">
              우측 하단 분홍/인디고 아이콘의 <strong>시트봇 AI (SheetBot AI)</strong>를 클릭해 수식 및 코드 질문을 실시간으로 물어보세요!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0"
            >
              1:1 운영팀 문의하기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
