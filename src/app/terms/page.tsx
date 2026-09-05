"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FileText, Shield, CreditCard, ChevronRight } from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export default function TermsPage() {
  const [footerInfo, setFooterInfo] = useState<FooterInfo>(DEFAULT_FOOTER);

  useEffect(() => {
    apiFetch("/api/footer")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.footer) {
          setFooterInfo(data.footer);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      <div>
        <Navbar />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
          {/* 상단 네비게이션 탭 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200/60 mb-2">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>법적 고지 및 규정</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                서비스 이용약관
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {footerInfo.company_name}이(가) 제공하는 SheetBot SaaS 서비스 이용 규정입니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
              <span className="px-3 py-1.5 rounded-lg bg-white text-indigo-600 shadow-xs">
                이용약관
              </span>
              <Link
                href="/privacy"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                개인정보처리방침
              </Link>
              <Link
                href="/finance-terms"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                전자금융거래
              </Link>
            </div>
          </div>

          {/* 약관 본문 카드 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-10 space-y-8 text-xs sm:text-sm leading-relaxed text-slate-600">
            {/* 기본 정보 */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong>시행일자:</strong> 2026년 1월 1일 (최신 개정: 2026년 9월 1일)</div>
              <div><strong>서비스명:</strong> SheetBot (구글 스프레드시트 수식 및 Apps Script AI 자동화 플랫폼)</div>
              <div><strong>운영 주체:</strong> {footerInfo.company_name} (대표자: {footerInfo.ceo_name})</div>
            </div>

            {/* 제1조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제1조 (목적)
              </h2>
              <p>
                본 약관은 {footerInfo.company_name}(이하 &quot;회사&quot;라 합니다)가 제공하는 구글 스프레드시트 수식 생성, Google Apps Script(GAS) 코드 변환, 스케줄 트리거 제어 및 AI 업무 자동화 서비스인 &quot;SheetBot&quot;(이하 &quot;서비스&quot;라 합니다)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
            </section>

            {/* 제2조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제2조 (용어의 정의)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>&quot;서비스&quot;</strong>란 회사가 웹 브라우저 및 확장 프로그램을 통해 제공하는 자연어 기반 시트 수식 변환, Apps Script 자동 생성, 스케줄러 관리 등의 일체의 디지털 솔루션을 의미합니다.
                </li>
                <li>
                  <strong>&quot;이용자&quot;</strong>란 본 약관에 동의하고 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.
                </li>
                <li>
                  <strong>&quot;토큰(Token)&quot;</strong>이란 서비스 내에서 AI 코드 생성 및 자동화 작업을 수행하기 위해 차감 또는 충전되는 디지털 크레딧을 의미합니다.
                </li>
                <li>
                  <strong>&quot;구글 연동&quot;</strong>이란 이용자가 본인의 Google 계정을 통해 스프레드시트 접근 권한을 안전하게 위임하는 OAuth 2.0 기반 연결을 말합니다.
                </li>
              </ul>
            </section>

            {/* 제3조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제3조 (약관의 효력 및 변경)
              </h2>
              <p>
                1. 본 약관은 서비스 웹사이트 초기 화면 또는 연결 화면에 게시함으로써 효력이 발생합니다.
              </p>
              <p>
                2. 회사는 관계 법령을 위배하지 않는 범위 내에서 본 약관을 개정할 수 있으며, 약관이 개정되는 경우 적용일자 및 개정사유를 명시하여 적용일자 7일 전(중요 변경 시 30일 전)부터 웹사이트 공지사항을 통해 고지합니다.
              </p>
            </section>

            {/* 제4조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제4조 (회원가입 및 계정 관리)
              </h2>
              <p>
                1. 회원가입은 이용자가 구글(Google) 로그인 또는 회사가 정한 절차에 따라 약관 동의 후 완료됩니다.
              </p>
              <p>
                2. 이용자는 본인의 계정 정보를 타인에게 양도하거나 대여할 수 없으며, 계정 관리 소홀로 인해 발생하는 모든 불이익에 대한 책임은 이용자 본인에게 있습니다.
              </p>
            </section>

            {/* 제5조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제5조 (서비스 제공 및 유료 토큰 결제)
              </h2>
              <p>
                1. 회사는 기본 무료 티어(Free Tier) 및 유료 요금제(Pro, Enterprise)를 제공하며, AI 기능 호출 시 사전에 고지된 토큰이 차감됩니다.
              </p>
              <p>
                2. 유료 토큰 충전 및 구독 결제는 신용카드, 계좌이체 등 전자지급결제 수단을 통해 이루어집니다.
              </p>
              <p>
                3. 사용하지 않은 유료 충전 토큰은 결제일로부터 7일 이내에 전액 환불을 요청할 수 있습니다. 단, 이미 사용된 토큰 분량에 대해서는 환불이 제한될 수 있습니다.
              </p>
            </section>

            {/* 제6조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제6조 (데이터 보안 및 격리)
              </h2>
              <p>
                1. 회사는 이용자의 구글 스프레드시트 본문 데이터나 민감 정보를 임의로 열람하거나 외부에 저장하지 않습니다.
              </p>
              <p>
                2. 이용자별 워크스페이스 데이터는 철저한 멀티유저 데이터 격리(Multi-User Isolation) 원칙에 따라 분리되어 보관 및 처리됩니다.
              </p>
            </section>

            {/* 제7조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제7조 (면책 조항)
              </h2>
              <p>
                1. 회사는 천재지변, 구글(Google) API의 장애 또는 정책 변경, 기타 불가항력적인 사유로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
              </p>
              <p>
                2. AI가 자동 생성한 Apps Script 코드나 수식의 실행 결과로 인해 이용자의 시트 데이터가 덮어씌워지거나 삭제된 경우, 회사는 중대한 과실이 없는 한 법적 책임을 부담하지 않습니다. 이용자는 사전 시트 백업을 권장받습니다.
              </p>
            </section>

            {/* 제8조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제8조 (분쟁 해결 및 관할법원)
              </h2>
              <p>
                본 약관과 관련하여 회사와 이용자 간에 발생한 분쟁에 대해서는 대한민국 법률을 준거법으로 하며, 회사의 본사 소재지를 관할하는 법원을 전속 관할법원으로 합니다.
              </p>
            </section>

            {/* 문의 안내 */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                문의사항: {footerInfo.cs_email} | 고객센터: {footerInfo.cs_phone}
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
              >
                <span>1:1 고객 문의 접수하기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
