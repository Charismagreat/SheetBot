"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Shield, FileText, CreditCard, ChevronRight, Lock, CheckCircle2 } from "lucide-react";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

export default function PrivacyPage() {
  const [footerInfo, setFooterInfo] = useState<FooterInfo>(DEFAULT_FOOTER);

  useEffect(() => {
    fetch("/api/footer")
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 mb-2">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span>개인정보 및 보안 규정</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                개인정보처리방침
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {footerInfo.company_name}은(는) 이용자의 개인정보 및 구글 시트 데이터를 안전하게 보호합니다.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
              <Link
                href="/terms"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                이용약관
              </Link>
              <span className="px-3 py-1.5 rounded-lg bg-white text-emerald-600 shadow-xs">
                개인정보처리방침
              </span>
              <Link
                href="/finance-terms"
                className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
              >
                전자금융거래
              </Link>
            </div>
          </div>

          {/* 본문 카드 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 sm:p-10 space-y-8 text-xs sm:text-sm leading-relaxed text-slate-600">
            {/* 기본 정보 및 핵심 원칙 */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div><strong>시행일자:</strong> 2026년 1월 1일 (최신 개정: 2026년 9월 1일)</div>
              <div><strong>개인정보보호책임자:</strong> {footerInfo.privacy_manager}</div>
              <div><strong>문의처:</strong> {footerInfo.cs_email} | {footerInfo.cs_phone}</div>
            </div>

            {/* 핵심 보안 선언 */}
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-emerald-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>SheetBot의 구글 스프레드시트 데이터 보호 원칙</span>
              </div>
              <ul className="text-xs space-y-1 text-emerald-700">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>회사는 이용자의 구글 스프레드시트 본문 셀 데이터를 서버 DB에 영구 저장하지 않습니다.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>구글 OAuth 연동 토큰은 은행 수준의 256-bit 암호화를 통해 보안 금고에 안전하게 격리됩니다.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>이용자의 업무 자동화 데이터는 철저한 멀티유저 데이터 격리(Multi-User Isolation)를 통해 타 회원과 완벽히 차단됩니다.</span>
                </li>
              </ul>
            </div>

            {/* 제1조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제1조 (수집하는 개인정보의 항목 및 수집 방법)
              </h2>
              <p>
                회사는 편리한 서비스 제공 및 본인 확인을 위해 최소한의 개인정보만을 수집합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>회원가입 및 로그인 시:</strong> 이메일 주소, 이름, 프로필 사진 URL (구글 계정 연동 정보)
                </li>
                <li>
                  <strong>스프레드시트 자동화 연동 시:</strong> 구글 사용자 고유 식별자, OAuth 엑세스/리프레시 토큰(암호화 보관)
                </li>
                <li>
                  <strong>유료 결제 및 세금계산서 발행 시:</strong> 신용카드 결제 승인번호, 상호명, 사업자등록번호, 대표자명, 담당자 이메일
                </li>
                <li>
                  <strong>서비스 이용 과정에서 자동 생성되는 정보:</strong> 접속 IP 주소, 브라우저 종류, 쿠키, AI 토큰 사용 로그, 접속 일시
                </li>
              </ul>
            </section>

            {/* 제2조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제2조 (개인정보의 이용 목적)
              </h2>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>서비스 제공:</strong> 구글 스프레드시트 수식 생성, Apps Script 자동 배포 및 트리거 스케줄링 실행
                </li>
                <li>
                  <strong>회원 관리:</strong> 회원제 서비스 이용에 따른 본인확인, 개인식별, 불량회원의 부정 이용 방지, 가입의사 확인
                </li>
                <li>
                  <strong>유료 결제 정산:</strong> 토큰 충전, 요금 정산, 세금계산서 발행 및 환불 처리
                </li>
                <li>
                  <strong>고객 지원:</strong> 1:1 고객 문의 응답, 서비스 장애 공지사항 전달
                </li>
              </ul>
            </section>

            {/* 제3조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제3조 (개인정보의 보유 및 파기 절차)
              </h2>
              <p>
                1. 회사는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
              </p>
              <p>
                2. 단, 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 다음과 같이 법정 기간 동안 보관합니다:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</li>
                <li>웹사이트 방문 기록: 3개월 (통신비밀보호법)</li>
              </ul>
            </section>

            {/* 제4조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제4조 (개인정보의 제3자 제공 및 위탁)
              </h2>
              <p>
                1. 회사는 이용자의 사전 동의 없이 개인정보를 외부에 제공하지 않습니다.
              </p>
              <p>
                2. 서비스 운영 및 결제 처리를 위해 다음과 같이 업무를 위탁하고 있습니다:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>전자결제 대행(PG): 나이스페이먼츠 / 토스페이먼츠 (결제 처리 및 에스크로)</li>
                <li>클라우드 인프라 및 DB 호스팅: {footerInfo.hosting_provider}</li>
              </ul>
            </section>

            {/* 제5조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제5조 (이용자의 권리와 행사 방법)
              </h2>
              <p>
                1. 이용자는 언제든지 본인의 개인정보를 열람하거나 수정을 요구할 수 있으며, 회원 탈퇴를 통해 개인정보 이용 동의를 철회할 수 있습니다.
              </p>
              <p>
                2. 구글 계정 연동 권한은 Google 계정 보안 설정(&quot;보안 &gt; 서드 파티 앱 액세스 관리&quot;)에서 즉시 철회할 수 있습니다.
              </p>
            </section>

            {/* 제6조 */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-1">
                제6조 (개인정보보호책임자 및 권익침해 구제)
              </h2>
              <p>
                회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보보호책임자를 지정하고 있습니다.
              </p>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 mt-2">
                <div><strong>개인정보보호책임자:</strong> {footerInfo.privacy_manager}</div>
                <div><strong>직책:</strong> 개인정보보호최고책임자(CPO)</div>
                <div><strong>연락처:</strong> {footerInfo.cs_phone} | <strong>이메일:</strong> {footerInfo.cs_email}</div>
              </div>
            </section>

            {/* 문의 안내 */}
            <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                개인정보 침해 관련 신고는 한국인터넷진흥원(KISA) 개인정보침해신고센터(국번없이 118)에 문의하실 수 있습니다.
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1 font-bold text-emerald-600 hover:underline shrink-0"
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
