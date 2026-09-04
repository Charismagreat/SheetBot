"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bot, Sparkles, Clock, Zap, ArrowRight, ShieldCheck, CheckCircle2, FileSpreadsheet, Code } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function LandingPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col justify-center items-center text-center space-y-12">
        {/* 헤더 배너 */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Google Apps Script 자동화 전용 SaaS 플랫폼</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
            복잡한 코딩 없이,<br />
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 bg-clip-text text-transparent">
              스프레드시트 자동화
            </span>를 완성하세요.
          </h1>

          <p className="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            구글 계정으로 로그인하고 스프레드시트 URL을 등록해 보세요.<br className="hidden sm:inline" />
            원하는 기능을 자연어로 적기만 하면 AI가 Apps Script 코드를 자동 생성하고, 구글 클라우드에 원클릭으로 주입·배포합니다.
          </p>
        </div>

        {/* CTA 버튼 그룹 */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {session?.user ? (
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-102 active:scale-98"
            >
              <span>내 대시보드로 이동하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-102 active:scale-98"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>테스트 유저로 1초 시작하기</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}

          <a
            href="#features"
            className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200/80 shadow-xs transition-all"
          >
            기능 둘러보기
          </a>
        </div>

        {/* 주요 기능 3단 카드 */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full pt-8">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-max">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-base text-slate-800">자연어 AI 코드 주입</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              "매일 자정에 마감 시트로 복사해줘", "셀 수정 시 알림 웹훅 발송해줘" 같은 요구사항을 자연어로 입력하면 완벽한 GAS 코드가 구글 시트에 자동 배포됩니다.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-max">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-base text-slate-800">자동화 스케줄 & 트리거</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              분/시간/일/주 단위의 시간 기반 실행 및 구글 시트의 <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-700 font-mono">onEdit</code> 이벤트 트리거를 웹 UI에서 원클릭으로 등록하고 제어합니다.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-max">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-base text-slate-800">회원별 안전한 데이터 격리</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              이지데스크의 고성능 인프라와 결합하여, 각 구글 계정 회원마다 프로젝트와 스케줄이 완벽히 분리되어 안전하게 보호됩니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
