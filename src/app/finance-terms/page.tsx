"use client";

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { CreditCard, FileText, Shield, ChevronRight, ShieldCheck } from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export default function FinanceTermsPage() {
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-bold border border-sky-200/60 mb-2">
                <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                <span>전자결제 및 금융 규정</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                전자금융거래 이용약관
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {footerInfo.company_name}의 토큰 충전 및 유료 결제 전자금융거래 규정입니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
              <Link
                href="/terms"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                이용약관
              </Link>
              <Link
                href="/privacy"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                개인정보처리방침
              </Link>
              <span className="px-3 py-1.5 rounded-lg bg-white text-sky-600 shadow-xs">
                전자금융거래
              </span>
            </div>
          </div>

          {/* 본문 카드 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-10 space-y-8 text-xs sm:text-sm leading-relaxed text-slate-600">
            {/* 기본 정보 */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong>시행일자:</strong> 2026년 1월 1일 (최신 개정: 2026년 9월 1일)</div>
              <div><strong>전자금융분쟁 처리책임자:</strong> {footerInfo.privacy_manager}</div>
              <div><strong>결제/정산 문의:</strong> {footerInfo.cs_email} | {footerInfo.cs_phone}</div>
            </div>

            {/* 결제 보안 안내 */}
            <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200/80 text-sky-900 space-y-1 text-xs">
              <div className="font-bold flex items-center gap-1.5 text-sky-800">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <span>SSL 256-bit 암호화 및 금융감독 안전 결제 준수</span>
              </div>
              <p className="text-sky-700">
                SheetBot의 모든 유료 결제 및 토큰 충전은 공인된 전자지급결제대행(PG)사를 통해 256비트 SSL 보안 채널로 안전하게 처리되며, 이용자의 카드번호나 금융 비밀번호를 당사 서버에 일체 보관하지 않습니다.
              </p>
            </div>

            {/* 제1조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제1조 (목적)
              </h2>
              <p>
                본 약관은 {footerInfo.company_name}(이하 &quot;회사&quot;라 합니다)가 제공하는 전자지급결제대행 서비스 및 선불전자지급수단(토큰) 관리 서비스 등을 이용자가 이용함에 있어 회사와 이용자 간의 전자금융거래에 관한 기본적인 사항을 정함을 목적으로 합니다.
              </p>
            </section>

            {/* 제2조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제2조 (용어의 정의)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>&quot;전자금융거래&quot;</strong>란 회사가 전자적 장치를 통하여 전자지급결제대행 및 토큰 충전 서비스를 제공하고, 이용자가 이를 이용하는 거래를 말합니다.
                </li>
                <li>
                  <strong>&quot;접근매체&quot;</strong>란 전자금융거래에 있어서 거래지시를 하거나 이용자 및 거래내용의 진실성과 정확성을 확보하기 위하여 사용되는 수단(구글 OAuth 계정 세션, 결제 수단 인증 정보 등)을 말합니다.
                </li>
                <li>
                  <strong>&quot;오류&quot;</strong>란 이용자의 고의 또는 과실 없이 전자금융거래가 약관 또는 이용자의 거래지시에 따라 이행되지 아니한 경우를 말합니다.
                </li>
              </ul>
            </section>

            {/* 제3조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제3조 (거래내역의 확인 및 보존)
              </h2>
              <p>
                1. 회사는 서비스 내 &quot;내 지갑 / 요금제&quot; 화면을 통하여 이용자의 토큰 충전, 사용 및 결제 내역을 언제든지 열람할 수 있도록 제공합니다.
              </p>
              <p>
                2. 회사는 전자금융거래의 내용을 추적, 검색하거나 그 내용에 오류가 발생한 경우 이를 확인하거나 정정할 수 있는 기록을 관련 법령(전자금융거래법 제22조)에 따라 5년간 보존합니다.
              </p>
            </section>

            {/* 제4조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제4조 (오류의 정정)
              </h2>
              <p>
                1. 이용자는 전자금융거래 서비스를 이용함에 있어 오류가 있음을 안 때에는 회사에 대하여 그 정정을 요구할 수 있습니다.
              </p>
              <p>
                2. 회사는 전항의 정정요구를 받은 때 또는 스스로 오류가 있음을 안 때에는 이를 즉시 조사하여 처리한 후 정정요구를 받은 날부터 2주 이내에 그 결과를 이용자에게 통지합니다.
              </p>
            </section>

            {/* 제5조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제5조 (회사의 책임 및 면책)
              </h2>
              <p>
                1. 회사는 접근매체의 위조나 변조로 발생한 사고, 계약체결 또는 거래지시의 전자적 전송이나 처리과정에서 발생한 사고로 인하여 이용자에게 손해가 발생한 경우에는 그 손해를 배상할 책임을 집니다.
              </p>
              <p>
                2. 단, 이용자가 접근매체를 제3자에게 대여하거나 사용을 위임한 경우 또는 이용자의 고의나 중대한 과실로 인하여 비밀번호 등 접근매체가 누설된 경우에는 이용자에게 책임의 전부 또는 일부가 귀속될 수 있습니다.
              </p>
            </section>

            {/* 제6조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제6조 (거래지시의 철회 및 환불)
              </h2>
              <p>
                1. 이용자가 충전한 유료 토큰은 결제 완료 시점으로부터 7일 이내에 전혀 사용하지 않은 경우에 한하여 전액 결제 취소(철회)가 가능합니다.
              </p>
              <p>
                2. 일부 토큰을 사용한 경우 잔여분에 대한 환불은 회사의 환불 정책 및 결제 수수료 공제 기준에 따라 진행됩니다.
              </p>
            </section>

            {/* 제7조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제7조 (분쟁 처리 및 이의 신청)
              </h2>
              <p>
                1. 이용자는 전자금융거래의 처리에 관하여 이의가 있을 때에는 회사의 분쟁처리기구에 그 해결을 요구하거나 금융감독원 등에 분쟁조정을 신청할 수 있습니다.
              </p>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 mt-2">
                <div><strong>분쟁처리 담당자:</strong> {footerInfo.privacy_manager}</div>
                <div><strong>연락처:</strong> {footerInfo.cs_phone} | <strong>이메일:</strong> {footerInfo.cs_email}</div>
                <div><strong>운영 시간:</strong> 평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00 제외)</div>
              </div>
            </section>

            {/* 문의 안내 */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                금융감독원 금융분쟁조정위원회: 국번없이 1332 (www.fss.or.kr)
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1 font-bold text-sky-600 hover:underline shrink-0"
              >
                <span>고객센터 문의하기</span>
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
