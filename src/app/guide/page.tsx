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
  Smartphone,
  Bot,
  MessageSquare,
  Move,
  Coins,
  QrCode,
  Send,
  Layers
} from "lucide-react";

export default function GuidePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 5단계 핵심 시작 가이드
  const steps = [
    {
      step: "01",
      title: "구글 계정 1초 로그인 & 자동화 대상 시트 준비",
      desc: "별도의 번거로운 회원가입 없이 구글 계정으로 로그인하면 20,000 웰컴 토큰이 즉시 지급됩니다. 자동화하고자 하는 구글 스프레드시트의 URL을 복사해 두세요.",
      tip: "구글 시트 브라우저 주소창의 'https://docs.google.com/spreadsheets/d/...' 주소를 그대로 복사하시면 됩니다.",
      badge: "기본 설정",
    },
    {
      step: "02",
      title: "자연어로 원하는 시트 자동화 기능 작성",
      desc: "코딩 문법을 몰라도 평소 한국어로 업무를 지시하듯 편하게 적어주세요. SheetBot AI가 완벽한 Google Apps Script(GAS) 자바스크립트 코드로 실시간 변환합니다.",
      tip: "예: '매일 밤 11시에 A시트 데이터를 백업 시트에 누적 복사하고 오늘 칸은 비워줘'",
      badge: "AI 코드 생성",
    },
    {
      step: "03",
      title: "Google Apps Script 원클릭 구글 클라우드 배포",
      desc: "생성된 코드를 확인하고 '구글 시트에 배포하기' 버튼을 누르면 이지데스크 클라우드 터널을 통해 대상 시트에 스크립트 파일이 안전하게 자동 주입됩니다.",
      tip: "구글 시트 상단 메뉴에 '🚀 시트봇 자동화' 전용 메뉴가 자동으로 등록되어 시트 안에서도 원클릭 실행이 가능합니다.",
      badge: "원클릭 배포",
    },
    {
      step: "04",
      title: "내 안드로이드 폰 연동 & 통신비 0원 문자 자동화",
      desc: "상단 [스마트 알림] 메뉴에서 본인의 스마트폰을 QR코드로 10초 만에 연동하세요. 유료 문자 발송 대행업체 없이 내 폰의 기본 문자로 실시간 자동 발송됩니다.",
      tip: "예: 'D열 주문상태가 완료로 바뀌면 고객 연락처로 감사 문자를 보내줘'라고 한 줄만 설정하면 끝납니다.",
      badge: "스마트 알림",
    },
    {
      step: "05",
      title: "시트봇 AI와 실시간 협업 & 대화 자동 기억",
      desc: "우측 하단 시트봇 AI는 마우스로 창 위치와 크기를 자유롭게 조절할 수 있으며, 새로고침해도 과거 대화를 완벽히 기억하고 수식과 스크립트 오류를 실시간 해결해 줍니다.",
      tip: "관리자(ADMIN) 계정으로 로그인하시면 토큰 차감 전액 면제 혜택과 운영자 맞춤 기술 상담이 제공됩니다.",
      badge: "AI 개인 비서",
    },
  ];

  // 실전 프롬프트 레시피 6종
  const examples = [
    {
      id: "ex1",
      title: "일일 마감 데이터 특정 시트로 누적 복사",
      tag: "정기 스케줄링",
      icon: Clock,
      color: "border-indigo-200 bg-indigo-50/60 text-indigo-700",
      prompt: "매일 밤 11시 50분에 '오늘매출' 탭의 A열부터 F열까지의 데이터를 복사해서 '연간누적' 탭의 마지막 빈 행 아래에 붙여넣고, 오늘매출 탭의 입력칸은 초기화해줘.",
    },
    {
      id: "ex2",
      title: "결제완료 시 고객 휴대폰 감사 문자 자동 발송",
      tag: "구글 메시지 스마트 알림 (SMS)",
      icon: Smartphone,
      color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
      prompt: "주문관리 시트의 D열(상태)이 '결제완료'로 수정되면, 해당 행의 고객명과 연락처를 읽어서 내 폰(구글메시지)으로 고객에게 '[SheetBot] {{고객명}}님, 결제가 정상 완료되었습니다.' 문자를 자동 발송해줘.",
    },
    {
      id: "ex3",
      title: "품절 임박 재고 감지 시 담당자 긴급 문자 알림",
      tag: "조건 감지 & 본인 알림",
      icon: Zap,
      color: "border-amber-200 bg-amber-50/60 text-amber-800",
      prompt: "재고관리 시트에서 D열(현재고)의 숫자가 5 이하로 떨어지면 해당 행을 빨간색으로 하이라이트하고, 내 휴대폰 번호(010-1234-5678)로 '{{품목명}} 재고 부족 긴급 발주 필요' 문자를 즉시 전송해줘.",
    },
    {
      id: "ex4",
      title: "상담 예약 신청 접수 시 슬랙 & 이메일 웹훅 통보",
      tag: "이벤트 트리거 (onEdit)",
      icon: MessageSquare,
      color: "border-purple-200 bg-purple-50/60 text-purple-700",
      prompt: "신규예약 시트에 새로운 행이 추가되면, 고객명, 예약시간, 상담내용을 포맷팅하여 담당자 이메일(help@company.com)로 보내고 슬랙 웹훅으로 실시간 알림을 쏴줘.",
    },
    {
      id: "ex5",
      title: "두 시트 간 VLOOKUP 매칭 및 차액 자동 계산 수식",
      tag: "구글 시트 고급 수식",
      icon: FileSpreadsheet,
      color: "border-teal-200 bg-teal-50/60 text-teal-700",
      prompt: "A시트의 주문번호를 기준으로 B시트의 결제금액을 VLOOKUP으로 가져와 C열에 넣고, 미납금이 있는 행만 골라내는 ARRAYFORMULA 수식 구조를 작성해줘.",
    },
    {
      id: "ex6",
      title: "매일 퇴근시간(18시) 당일 총 매출 요약 문자 전송",
      tag: "일일 요약 알림",
      icon: Sparkles,
      color: "border-rose-200 bg-rose-50/60 text-rose-700",
      prompt: "매일 오후 6시 정각에 '일일매출' 시트의 F열(금액) 합계를 계산해서, 내 스마트폰으로 '오늘 총 매출은 {{합계금액}}원, 접수건수는 {{총건수}}건입니다.'라고 요약 문자를 발송해줘.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-white text-slate-800 pb-20 text-left">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* 상단 타이틀 배너 */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-300 text-xs font-bold border border-white/10">
              <BookOpen className="w-3.5 h-3.5" />
              <span>사용 가이드 &amp; 업무 자동화 마스터 레시피</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              SheetBot 완벽 가이드:<br />
              구글 시트 자동화부터 통신비 0원 문자 발송까지
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              복잡한 코딩이나 통신사 유료 API 계약 없이도 충분합니다.
              Google Apps Script(GAS) 자동 생성, 정기 스케줄 실행, 내 폰을 통한 무료 문자 자동 발송, 
              그리고 이전 대화를 기억하는 시트봇 AI까지 누구나 3분 만에 시작할 수 있는 실전 가이드를 확인하세요.
            </p>
            <div className="pt-3 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
              >
                <span>내 워크스페이스 시작하기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/notifications"
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
              >
                <Smartphone className="w-4 h-4 text-emerald-300" />
                <span>스마트폰 연동 &amp; 무료 문자 설정</span>
              </Link>
            </div>
          </div>
        </div>

        {/* 5단계 시작 가이드 */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Step-by-Step Roadmap</span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              누구나 3분 만에 마스터하는 5단계 자동화 여정
            </h2>
            <p className="text-xs text-slate-500">
              구글 계정 로그인부터 스마트폰 연동, AI 비서 협업까지 직관적인 단계로 구성되어 있습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {steps.map((s, idx) => (
              <div
                key={idx}
                className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 relative"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-black text-xs flex items-center justify-center border border-emerald-200/60">
                      {s.step}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-extrabold">
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-900 leading-snug">{s.title}</h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[10.5px] text-slate-600">
                  <strong className="text-slate-800">💡 팁:</strong> {s.tip}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 스마트 알림(SMS) 심층 가이드 섹션 */}
        <section className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 rounded-3xl p-6 sm:p-10 border border-emerald-200/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-black">
                <Smartphone className="w-3.5 h-3.5" />
                <span>신규 기능: 통신 비용 0원 문자 자동화</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                내 안드로이드 폰을 Google 메시지로 연동하는 방법
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                시중의 알림톡/문자 대행 서비스(건당 15~40원) 대신, 내가 사용하는 안드로이드 스마트폰(요금제 기본 제공 무제한 문자)을 
                게이트웨이로 연동하여 구글 시트 이벤트 발생 시 무료로 문자를 자동 발송할 수 있습니다.
              </p>
            </div>

            <Link
              href="/dashboard/notifications"
              className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 self-start md:self-auto"
            >
              <span>스마트 알림 센터 바로가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                1
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">10초 QR코드 스캔 페어링</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                스마트폰의 <strong>구글 메시지 앱 ➔ 우측 상단 프로필 ➔ [기기 페어링]</strong>을 누르고, 화면의 QR코드를 스캔하면 즉시 연동됩니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                2
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">자연어 규칙 한 줄 입력</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                "입금완료로 바뀌면 고객 연락처로 안내 문자 발송"이라고 입력하면, AI가 발송 조건과 메시지 템플릿을 자동으로 구조화해 등록합니다.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-teal-100 shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <h4 className="font-extrabold text-xs text-slate-900">스프레드시트 실시간 발송</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                시트에서 행 데이터가 수정되거나 추가되면 AI가 조건을 판별하여 내 스마트폰을 통해 고객 또는 나에게 문자를 실시간 발송합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 실전 업무 자동화 프롬프트 템플릿 6종 */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Best Recipes</span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                복사해서 바로 쓰는 실전 자동화 프롬프트 6선
              </h2>
            </div>
            <span className="text-xs text-slate-400">클릭 시 프롬프트 문구가 클립보드에 바로 복사됩니다.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {examples.map((ex) => {
              const IconComp = ex.icon;
              return (
                <div
                  key={ex.id}
                  className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between hover:shadow-md transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 ${ex.color}`}>
                        <IconComp className="w-3 h-3" />
                        <span>{ex.tag}</span>
                      </span>
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-900 leading-snug">{ex.title}</h3>
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 font-mono text-[11px] text-slate-700 leading-relaxed select-all">
                      "{ex.prompt}"
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopy(ex.prompt, ex.id)}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {copiedId === ex.id ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-extrabold">복사 완료! 생성기/규칙창에 붙여넣으세요</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>프롬프트 복사하기</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 시트봇 AI 비서 100% 활용 팁 섹션 */}
        <section className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-xl space-y-6 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-amber-300 rounded-full text-xs font-bold border border-white/10">
              <Bot className="w-3.5 h-3.5" />
              <span>우측 하단 플로팅 비서</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              시트봇 AI (SheetBot AI) 100% 활용 꿀팁
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
              화면 우측 하단의 시트봇 AI는 단순한 챗봇이 아닙니다. 내 구글 시트 작업을 옆에서 지켜보며 코드를 작성해 주는 1:1 페어 프로그래머입니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10 pt-2 text-xs">
            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Move className="w-4 h-4" />
                <span>마우스 드래그 &amp; 8방향 크기 조절</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                상단 바를 잡고 원하는 위치로 이동하거나 테두리를 당겨 자유롭게 창 크기를 조절할 수 있으며, 설정한 위치와 크기는 브라우저에 자동 기억됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>회원별 대화 내용 클라우드 영구 기억</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                로그인된 계정으로 과거 나눈 대화가 안전하게 영구 저장되어, 페이지를 새로고침(F5)하거나 다른 PC에서 접속해도 대화 맥락이 그대로 복원됩니다.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-bold">
                <Coins className="w-4 h-4" />
                <span>관리자(ADMIN) 전액 면제 &amp; 토큰 충전</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                관리자 계정은 대화 토큰이 무제한 무료로 제공되며, 일반 회원은 상단 [토큰 충전] 메뉴에서 1회성 선불형으로 부담 없이 이용할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 추가 가이드 및 문의 배너 */}
        <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-50 to-indigo-50 border border-amber-200/60 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <h3 className="text-base font-black text-slate-900">더 궁금한 점이 있으신가요?</h3>
            <p className="text-xs text-slate-600">
              우측 하단 <strong>시트봇 AI</strong>에게 실시간으로 질문하시거나, 1:1 고객 문의 게시판을 통해 언제든 운영팀의 지원을 받으세요!
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/faq"
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all shadow-2xs shrink-0"
            >
              FAQ 둘러보기
            </Link>
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
