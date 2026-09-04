"use client";

import React from "react";
import Link from "next/link";
import { Bot, ShieldCheck, Mail, Phone, MapPin, HelpCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-white text-slate-500 text-xs font-normal">
      {/* 상단 안내 & 링크 영역 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-slate-100">
          {/* 1열: 서비스 브랜드 소개 */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base text-slate-800 tracking-tight">SheetBot</span>
                <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded border border-emerald-200/60">
                  SaaS
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed max-w-md">
              SheetBot은 복잡한 구글 스프레드시트 수식과 Google Apps Script(GAS)를 자연어로 간편하게 자동화하는 B2B 업무 생산성 플랫폼입니다.
            </p>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SSL 256-bit 안전 결제</span>
              </span>
              <span>•</span>
              <span>회원 데이터 격리(Multi-User Isolation)</span>
              <span>•</span>
              <span>KST 서울 기준 정산</span>
            </div>
          </div>

          {/* 2열: 빠른 메뉴 바로가기 */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 text-xs">서비스 바로가기</h4>
            <ul className="space-y-1.5 text-slate-500">
              <li>
                <Link href="/dashboard" className="hover:text-slate-900 transition-colors">
                  내 자동화 워크스페이스
                </Link>
              </li>
              <li>
                <Link href="/dashboard/pricing" className="hover:text-slate-900 transition-colors">
                  토큰 충전 &amp; 요금제
                </Link>
              </li>
              <li>
                <Link href="/dashboard/settings" className="hover:text-slate-900 transition-colors">
                  AI 모델 환경 설정
                </Link>
              </li>
              <li>
                <Link href="/dashboard/ai-usage" className="hover:text-slate-900 transition-colors">
                  AI 사용량 관제
                </Link>
              </li>
            </ul>
          </div>

          {/* 3열: 고객센터 및 지원 */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-800 text-xs">고객 지원 &amp; 문의</h4>
            <div className="space-y-1.5 text-slate-500">
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>support@sheetbot.io</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>평일 09:00 - 18:00 (주말/공휴일 휴무)</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-700 font-medium">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>우측 하단 이지봇(EasyBot) 실시간 AI 상담</span>
              </div>
            </div>
          </div>
        </div>

        {/* 하단: 사업자등록정보 및 법적 고지 */}
        <div className="pt-6 space-y-3 text-[11px] text-slate-400 leading-relaxed">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><strong>상호명:</strong> 시트봇 (SheetBot Co., Ltd.)</span>
            <span>|</span>
            <span><strong>대표자:</strong> 대표이사</span>
            <span>|</span>
            <span><strong>사업자등록번호:</strong> 123-45-67890</span>
            <span>|</span>
            <span><strong>통신판매업신고:</strong> 제2026-서울강남-0000호</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400" />
              <span><strong>주소:</strong> 서울특별시 강남구 테헤란로 123 시트봇 빌딩 8층</span>
            </span>
            <span>|</span>
            <span><strong>개인정보보호책임자:</strong> 관리자 (privacy@sheetbot.io)</span>
            <span>|</span>
            <span><strong>호스팅 및 백엔드:</strong> EGDesk Cloud Infrastructure</span>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100 text-slate-400">
            <p>© 2026 SheetBot Corp. All rights reserved.</p>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="hover:text-slate-600 cursor-pointer">이용약관</span>
              <span>•</span>
              <span className="hover:text-slate-600 font-bold cursor-pointer text-slate-600">개인정보처리방침</span>
              <span>•</span>
              <span className="hover:text-slate-600 cursor-pointer">전자금융거래 이용약관</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
