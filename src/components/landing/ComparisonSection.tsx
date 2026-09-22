"use client";

import React from "react";
import { Sparkles, Zap, Globe, Terminal, ScanText, Smartphone, Database, XCircle, CheckCircle2 } from "lucide-react";

export default function ComparisonSection() {
  return (
    <div className="w-full space-y-8 pt-4">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-[11px] sm:text-xs font-black mx-auto">
          <Zap className="w-3.5 h-3.5 text-emerald-600" />
          <span>일반 코딩 AI와 무엇이 다른가요?</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
          "ChatGPT는 코드를 복사하라고 하지만,<br className="hidden sm:inline" /> SheetBot은 시트에 직접 꽂아 넣습니다"
        </h2>
        <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
          개발자가 아니어도 괜찮습니다. 복잡한 Apps Script 에디터를 열 필요도,<br className="hidden sm:inline" />
          GCP 콘솔에서 비싼 Vision API 키를 카드로 결제할 필요도 없습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto text-left">
        {/* Diff Card 1: 독립 모바일 웹앱 배포 */}
        <div className="bg-white rounded-3xl border-2 border-emerald-300/80 shadow-md p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black rounded-bl-xl tracking-wider uppercase">
            독보적 킬러 기능
          </div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">1. 모바일 웹앱(Web App) 배포</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">실제 웹사이트 생성</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <span className="font-bold">일반 AI (ChatGPT / Claude):</span> 시트를 직접 읽지 못해 사용자가 컬럼을 일일이 복붙해야 하며, 코드만 텍스트로 줄 뿐 실제 접속할 수 있는 웹사이트를 만들어주지 못함
              </div>
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> 시트 링크만 넣으면 <strong>30초 만에 구글 클라우드 공식 웹앱(https://script.google.com/.../exec)으로 즉시 배포</strong>! 인스타나 카톡에 바로 거는 완성형 모바일 웹페이지 링크 제공!
              </div>
            </div>
          </div>
        </div>

        {/* Diff Card 2: 코드 반영 방식 */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">2. 코드 주입 &amp; 실행 방식</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">배포의 차이</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 수백 줄 코드를 텍스트로 받아 사용자가 직접 Apps Script 에디터에 복사·붙여넣고, 매니페스트 권한을 수동 설정해야 함 (초보자 에러 빈번)
              </div>
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> 시트 URL만 주면 <strong>0초 만에 구글 클라우드에 원격 직접 주입(Direct Push)</strong>. 시트에서 <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded text-[10px] font-mono font-bold shadow-2xs">F5</kbd> 새로고침만 누르면 상단 메뉴 생성 완료!
              </div>
            </div>
          </div>
        </div>

        {/* Diff Card 3: 명함·영수증 AI 비전 OCR */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <ScanText className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">3. 명함·영수증 AI 비전 분석</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md">비전 OCR</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 코드만 짜줄 뿐, 실제로 사진을 읽으려면 사용자가 GCP 결제 계좌를 등록하고 유료 Vision API 키를 발급받아 코드에 넣으라고 요구
              </div>
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>최첨단 Gemini 비전 AI 터널 기본 내장</strong>. 복잡한 API 키 구매 없이, 사이드바에 명함/영수증 사진만 끌어다 놓으면 1초 만에 시트 표로 자동 정리!
              </div>
            </div>
          </div>
        </div>

        {/* Diff Card 4: 스마트폰 문자(SMS) 실제 발송 */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">4. 스마트폰 SMS 문자 일괄 발송</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">통신 인프라</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 문자 통신망이 없어 가짜 시뮬레이션(Mock) 코드를 작성하거나, 유료 문자 대행사(알리고 등) API 키를 충전해서 쓰라고 안내
              </div>
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>내 스마트폰 원클릭 연동으로 평생 통신비 0원</strong>! 시트에서 체크박스 선택 후 버튼 하나로 실제 수신자에게 무료 실시간 SMS 발송
              </div>
            </div>
          </div>
        </div>

        {/* Diff Card 5: SQLite DB 백업 & 동시 수정 안전성 */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-base text-slate-900">5. 대용량 데이터 보관 &amp; 충돌 방지</h3>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md">데이터 안전</span>
          </div>
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl text-rose-700 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div>
                <span className="font-bold">일반 AI (ChatGPT / Cursor):</span> 구글 시트 셀 한계(데이터 누적 시 속도 저하, 다른 사람이 덮어써서 유실되는 충돌 문제)를 해결할 외부 DB 인프라 부재
              </div>
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl text-emerald-900 flex items-start gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">SheetBot + 안티그라비티:</span> <strong>구글 드라이브 SQLite 양방향 백업</strong> &amp; <strong>낙관적 락킹(동시 수정 충돌 자동 방지)</strong> 기본 탑재로 대용량 데이터도 안전하게 관리!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
