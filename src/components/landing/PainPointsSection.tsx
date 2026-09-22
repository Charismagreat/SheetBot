"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Sparkles, CreditCard, ShieldCheck, FileSpreadsheet, Clock, Workflow, ArrowRight, XCircle, CheckCircle2 } from "lucide-react";

export default function PainPointsSection() {
  const { data: session } = useSession();

  return (
    <div className="w-full space-y-8 pt-6">
      <div className="space-y-3 text-center">
        <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-600">
          Why SheetBot?
        </span>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
          "이런 번거로움, 시트봇 하나로 영구 작별하세요"
        </h2>
        <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
          개발자도 기피하는 복잡한 5대 진입 장벽을 단 0초 만에 해결했습니다.<br className="hidden sm:inline" />
          시트봇과 함께 가장 간편하고 안전하게 업무를 혁신해 보세요.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
        {/* Card 1 */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
          <div className="space-y-3.5">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-amber-600 uppercase tracking-wide">핵심 해결 01</span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                복잡한 API 키 &amp; 해외 결제 ZERO
              </h3>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>해외 콘솔 가입, 달러 결제 카드 등록, 환율 및 수수료 부담</span>
              </div>
              <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>원클릭 시작</strong>: 로그인 즉시 내장 AI 가동, 간편한 국내 원화 결제 &amp; 세금계산서 지원</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
          <div className="space-y-3.5">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wide">핵심 해결 02</span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                소스코드 키 노출 과금 위험 0%
              </h3>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>시트 스크립트에 키 평문 노출, 공유 시 유출 및 해킹 과금 위험</span>
              </div>
              <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>특허급 터널 격리</strong>: 시트엔 실행 로직만 주입, API 키는 백엔드 터널로 안전 격리</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
          <div className="space-y-3.5">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-blue-600 uppercase tracking-wide">핵심 해결 03</span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                구글 앱 연동, 클릭 한 번으로 끝
              </h3>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>GCP 프로젝트 생성, OAuth 동의 화면 및 복잡한 권한 설정 오류</span>
              </div>
              <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>원클릭 표준 브릿지</strong>: 시트·Gmail·드라이브를 사전 승인 파이프라인으로 5초 완성</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
          <div className="space-y-3.5">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wide">핵심 해결 04</span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                말 한마디로 끝나는 스마트 스케줄러
              </h3>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>복잡한 Apps Script 트리거, 별도 웹훅·크론 서버 구축 부담</span>
              </div>
              <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>자연어 스케줄러</strong>: "매일 9시에 요약해 줘" 말 한마디로 자동 데이터 수집 및 예약 완료</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:border-emerald-300 transition-all flex flex-col justify-between space-y-4 group">
          <div className="space-y-3.5">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl w-max group-hover:scale-110 transition-transform">
              <Workflow className="w-6 h-6" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-teal-600 uppercase tracking-wide">핵심 해결 05</span>
              <h3 className="font-black text-base sm:text-lg text-slate-900 break-keep mt-0.5 leading-snug">
                수천만 원 외주 개발비 획기적 절감
              </h3>
            </div>
            <div className="space-y-2.5 pt-1">
              <div className="min-h-[4.25rem] flex items-start gap-2 text-rose-600 bg-rose-50/60 p-3 rounded-2xl border border-rose-100 text-xs leading-relaxed">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                <span>단순 데이터 취합·알림에도 수백~수천만 원 외주비와 수개월 소요</span>
              </div>
              <div className="min-h-[4.75rem] flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-3 rounded-2xl border border-emerald-100/80 text-xs leading-relaxed font-medium">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>0원 문자 &amp; 즉시 가동</strong>: 1인 기업부터 중소기업까지 합리적인 비용으로 당일 즉시 도입</span>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Box in Grid */}
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 p-6 sm:p-7 rounded-3xl shadow-xl text-white flex flex-col justify-between space-y-5 border border-emerald-500/30 relative overflow-hidden group">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-3.5">
            <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl w-max border border-emerald-400/30 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div className="min-h-[3.25rem] flex flex-col justify-center">
              <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wide">
                ⚡ 5초 만에 무료 시작
              </span>
              <h3 className="font-black text-base sm:text-lg text-white break-keep mt-0.5 leading-snug">
                지금 내 구글 시트에 AI를 장착하세요
              </h3>
            </div>
            <div className="pt-1">
              <div className="min-h-[4.25rem] flex items-center p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-emerald-100/80 leading-relaxed">
                복잡한 설정 없이 구글 계정으로 로그인만 하면 모든 자동화 인프라가 준비됩니다.
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Link
              href={session?.user ? "/dashboard" : "/login"}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold text-xs sm:text-sm rounded-xl text-center shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{session?.user ? "대시보드로 바로 이동하기" : "5초 만에 무료로 시작하기"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/use-cases"
              className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white/90 font-bold text-xs rounded-xl text-center transition-all flex items-center justify-center gap-1 border border-white/10"
            >
              <span>📖 1분 만에 끝나는 활용사례 보기</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
