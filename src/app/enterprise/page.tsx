"use client";

import { apiFetch } from '@/lib/api';
import React, { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  Sparkles,
  Building2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Clock,
  Coins,
  Send,
  HelpCircle,
  FileSpreadsheet,
  Layers,
  Cpu,
  Landmark,
  PhoneCall,
  Printer,
  Scale,
  Award,
  AlertCircle,
  Briefcase,
  TrendingUp,
} from "lucide-react";

export default function EnterprisePage() {
  const [formData, setFormData] = useState({
    companyName: "",
    bizNumber: "",
    websiteUrl: "",
    contactName: "",
    contactPosition: "",
    phone: "",
    email: "",
    industry: "제조·생산",
    targetAreas: [] as string[],
    useVoucher: "YES",
    content: "",
  });

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetAreaOptions = [
    "📦 자재 발주·재고 관리 & QR 라벨 인쇄",
    "🚚 스마트스토어/쿠팡 발주서 ➔ 택배 송장 변환",
    "🏦 국세청 홈택스 세금계산서 & 법인통장 자동 정산",
    "✉️ 고객·거래처 개인화 안내 메일/0원 문자 자동 발송",
    "🏛️ 기업마당 정부지원금 & 조달청 나라장터 입찰 스크랩",
    "🎙️ 고객 통화 녹음 AI 전사 & 상담 일지 자동 기입",
    "📑 견적서·계약서 PDF 자동 빌드 & 구글 드라이브 백업",
    "🖨️ 시트 주문 접수 즉시 현장 실물 프린터 자동 인쇄",
    "🔒 사내 전용 온프레미스(On-Premise) 서버 구축",
    "🔄 기존 ERP/MES(더존, 이카운트, 영림원, 자체MES 등) 연동",
  ];

  const handleCheckboxChange = (area: string) => {
    setFormData((prev) => {
      const exists = prev.targetAreas.includes(area);
      if (exists) {
        return { ...prev, targetAreas: prev.targetAreas.filter((a) => a !== area) };
      } else {
        return { ...prev, targetAreas: [...prev.targetAreas, area] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.companyName.trim() || !formData.contactName.trim() || !formData.phone.trim() || !formData.email.trim()) {
      setErrorMessage("회사명, 담당자명, 연락처, 이메일은 필수 입력 항목입니다.");
      return;
    }

    try {
      setLoading(true);
      const res = await apiFetch("/api/enterprise/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setErrorMessage(data.error || "신청 처리 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800">
      <Navbar />

      {/* Hero 섹션 */}
      <section className="relative overflow-hidden bg-slate-900 text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/30 via-slate-900 to-slate-950 pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-bold backdrop-blur-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>중소기업·소상공인 맞춤형 경량 ERP &amp; AX(AI 전환) 구축 솔루션</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight break-keep">
            직원들이 안 쓰는 무거운 ERP 대신,<br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              매일 쓰던 엑셀 그대로 1주일 완성 경량 ERP
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed font-normal break-keep">
            수천만 원의 SI 구축비와 수개월의 교육 없이, 기존 엑셀 장부에 AI 엔진과 홈택스·은행·조달청을 결합합니다.
            이미 사용 중인 <strong className="text-emerald-300 font-bold">더존·이카운트 등 기존 ERP/MES와의 양방향 연동</strong>도 완벽 지원하며,
            <strong className="text-teal-300 font-bold"> 정부지원금 최대 90% 매칭</strong>으로 실부담을 최소화하세요.
          </p>

          {/* 핵심 지표 4선 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto pt-4 text-left">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
              <span className="text-xs font-bold text-slate-400">구축 소요 기간</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">1 ~ 2주 완성</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">당일 프로토타입 PoC 제공</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
              <span className="text-xs font-bold text-slate-400">구축 비용 절감</span>
              <div className="text-xl sm:text-2xl font-black text-teal-300 mt-1">기존 1/10 수준</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">정부지원금 80~90% 매칭</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
              <span className="text-xs font-bold text-slate-400">현업 직원 적응률</span>
              <div className="text-xl sm:text-2xl font-black text-sky-400 mt-1">100% 즉시 정착</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">익숙한 구글 시트/엑셀 화면</span>
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4">
              <span className="text-xs font-bold text-slate-400">AI 및 외부 연동</span>
              <div className="text-xl sm:text-2xl font-black text-indigo-300 mt-1">33종 킬러 기능</div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">홈택스·은행·문자·인쇄 직결</span>
            </div>
          </div>

          <div className="pt-2">
            <a
              href="#inquiry-form"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm sm:text-base rounded-2xl transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-98"
            >
              <span>무료 엑셀 AX 진단 &amp; 맞춤 견적 신청하기</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* 비교 검증 섹션 */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-extrabold tracking-wider uppercase text-teal-700">Fair Comparison</span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
            기존 상용 ERP vs SheetBot 맞춤형 경량 ERP
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl mx-auto break-keep">
            왜 많은 중소기업과 소상공인이 값비싼 ERP를 도입하고도 결국 다시 엑셀로 돌아갈까요?
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-200/80 shadow-xs bg-white">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 sm:p-5 font-bold text-slate-500">비교 항목</th>
                <th className="p-4 sm:p-5 font-bold text-slate-500 w-1/3">기존 전통 SI / 상용 ERP</th>
                <th className="p-4 sm:p-5 font-black text-emerald-800 bg-emerald-50/70 w-1/2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>SheetBot 기반 맞춤 경량 ERP</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">초기 구축 비용</td>
                <td className="p-4 sm:p-5 text-slate-500">수천만 원 ~ 수억 원 (막대한 초기 부담)</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  수백만 원대 패키지 (정부지원금 80~90% 매칭 가능)
                </td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">구축 소요 기간</td>
                <td className="p-4 sm:p-5 text-slate-500">최소 3개월 ~ 1년 (프로젝트 지연 빈번)</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  1 ~ 2주 내 현장 초고속 론칭 (당일 프로토타입 시연)
                </td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">현업 직원 적응도</td>
                <td className="p-4 sm:p-5 text-slate-500">복잡한 새 화면 적응 실패로 결국 엑셀 병행 사용</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  매일 쓰던 엑셀/구글 시트 화면 그대로 100% 즉시 정착
                </td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">데이터 소유권 &amp; 보안</td>
                <td className="p-4 sm:p-5 text-slate-500">외부 ERP 클라우드 종속 (해지 시 데이터 이전 곤란 &amp; 외부 서버 유출 우려)</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  대표님 구글 드라이브에 100% 소유 귀속 (벤더 락인 제로)
                  <span className="block text-xs font-semibold text-teal-800 mt-1.5 bg-teal-100/70 px-2.5 py-1 rounded-lg border border-teal-200">
                    ★ 사내 보안·망분리 규정 시: 사내 로컬망/사내 서버에 <strong>이지데스크(EGDesk) 독립 온프레미스(On-Premise) 환경 구축 완벽 지원</strong>
                  </span>
                </td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">AI &amp; 공공망 연동</td>
                <td className="p-4 sm:p-5 text-slate-500">기능 추가마다 수백~수천만 원 추가 개발비 청구</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  Gemini AI, 홈택스, 은행 통장, 나라장터, 영수증 OCR 기본 지원
                </td>
              </tr>
              <tr>
                <td className="p-4 sm:p-5 font-bold text-slate-900 bg-slate-50/50">기존 ERP/MES 호환</td>
                <td className="p-4 sm:p-5 text-slate-500">기존 시스템 전면 교체 강요 또는 연동 시 수천만 원 SI 비용 청구</td>
                <td className="p-4 sm:p-5 font-bold text-emerald-700 bg-emerald-50/30">
                  더존, 이카운트, 영림원, 자체MES 100% 공존! 양방향 DB/API/엑셀 연동 지원
                  <span className="block text-xs font-semibold text-teal-800 mt-1 bg-teal-100/70 px-2.5 py-0.5 rounded border border-teal-200">
                    ★ 기존 ERP를 버릴 필요 없이, AI 자동화 엔진만 얹는 하이브리드 확장 가능
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 3대 맞춤 솔루션 패키지 */}
      <section className="py-14 bg-slate-100/70 border-y border-slate-200/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-extrabold tracking-wider uppercase text-indigo-700">Turn-Key Packages</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
              기업 규모와 업종에 맞춘 3대 턴키 패키지
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto break-keep">
              사업장의 현재 상황에 맞춰 가장 부담 없고 효과가 확실한 패키지를 선택하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 패키지 1 */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                    소상공인 / 1인 셀러
                  </span>
                  <Coins className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 break-keep">Smart Starter</h3>
                  <p className="text-xs text-slate-500 mt-1 break-keep">고객 관리 &amp; 0원 문자 자동 알림 중심</p>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>영수증/명함 파일 업로드 AI OCR 사이드바</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>A열 체크박스 선택 행 스마트폰 0원 문자 발송</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>매일 저녁 당일 매출 요약 Gmail 리포트</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>구글 폼 접수 즉시 고객 맞춤 안내 발송</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400">추천 도입 비용</div>
                <div className="text-xl font-black text-slate-900 mt-0.5">150만 ~ 300만 원</div>
                <span className="text-[11px] text-teal-600 font-semibold block mt-1">1주일 내 구축 완료</span>
              </div>
            </div>

            {/* 패키지 2 (BEST) */}
            <div className="bg-white rounded-3xl p-7 border-2 border-emerald-500 shadow-lg relative flex flex-col justify-between space-y-6">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-emerald-600 text-white rounded-full text-[11px] font-black uppercase tracking-wider">
                인기 &amp; 추천 솔루션
              </div>
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                    중소 제조·유통사
                  </span>
                  <Cpu className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 break-keep">경량 ERP / MES</h3>
                  <p className="text-xs text-slate-500 mt-1 break-keep">생산·발주·재고·정산 올인원 통합</p>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>자재 발주 ➔ 재고 실사 ➔ QR 라벨 자동 인쇄</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>쇼핑몰 발주서 ➔ 택배사 송장 양식 1초 변환</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>홈택스 전자세금계산서 &amp; 은행통장 실시간 정산</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>기존 상용 ERP/MES(더존, 이카운트 등) 데이터 양방향 연동</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>사업자등록 상태(휴·폐업) 원클릭 대조</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400">추천 도입 비용</div>
                <div className="text-xl font-black text-emerald-700 mt-0.5">500만 ~ 1,200만 원</div>
                <span className="text-[11px] text-emerald-600 font-semibold block mt-1">
                  정부지원 바우처 매칭 시 자부담 10~20%
                </span>
              </div>
            </div>

            {/* 패키지 3 */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200">
                    중소기업 / B2B 전문사
                  </span>
                  <Landmark className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 break-keep">Enterprise AX 전환</h3>
                  <p className="text-xs text-slate-500 mt-1 break-keep">전사 엑셀 클라우드화 &amp; 온프레미스 연동</p>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 font-medium">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span>기업마당 지원금 &amp; 조달청 나라장터 공고 스크랩</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span>기존 레거시 ERP·DB(더존, SAP, Oracle, MSSQL) 맞춤 연동</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span>사내 전용 온프레미스 서버 지원</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span>사무실/물류창고 프린터 원격 실물 자동 출력</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-400">추천 도입 비용</div>
                <div className="text-xl font-black text-slate-900 mt-0.5">1,500만 ~ 3,000만 원</div>
                <span className="text-[11px] text-indigo-600 font-semibold block mt-1">전담 컨설턴트 1:1 밀착 구축</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 정부지원사업 안내 배너 */}
      <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-teal-900 via-indigo-950 to-slate-900 rounded-3xl p-8 sm:p-10 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-3 text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-300 text-xs font-bold border border-teal-400/30">
              <Award className="w-3.5 h-3.5" />
              <span>정부지원사업(바우처) 연계 지원</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black break-keep">
              정부지원금 최대 80~90% 매칭으로 도입 비용을 아끼세요
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed break-keep">
              중소벤처기업부 <strong>비대면 서비스 바우처, 스마트공방 기술보급사업, 소상공인 스마트상점, AI 바우처</strong> 등 
              활용 가능한 정부지원사업 매칭과 사업계획서 작성 컨설팅을 원스톱으로 지원해 드립니다.
            </p>
          </div>
          <a
            href="#inquiry-form"
            className="shrink-0 px-6 py-3.5 bg-teal-400 hover:bg-teal-300 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-md active:scale-95"
          >
            지원사업 매칭 상담 신청
          </a>
        </div>
      </section>

      {/* 문의 폼 섹션 */}
      <section id="inquiry-form" className="py-16 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-12 space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-extrabold tracking-wider uppercase text-emerald-600">Free AX Diagnosis</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 break-keep">
              무료 엑셀 AX 진단 &amp; 맞춤 견적 신청
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 break-keep">
              현재 사용 중인 엑셀 장부의 비효율을 진단하고, 24시간 이내에 최적의 구축 방안과 예상 견적을 회신드립니다.
            </p>
          </div>

          {submitted ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-4 animate-in fade-in duration-200">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-emerald-950 break-keep">
                무료 AX 진단 및 구축 상담 신청이 접수되었습니다!
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800 max-w-md mx-auto leading-relaxed break-keep">
                보내주신 기업 정보와 요구사항을 면밀히 분석한 후, <strong>24시간 이내</strong>에 전문 AX 컨설턴트가 1차 진단 리포트 및 유선 상담을 위해 연락드리겠습니다.
              </p>
              <div className="pt-2">
                <Link
                  href="/use-cases"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <span>33종 실전 활용사례 둘러보기</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 text-left">
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 기본 정보 4개 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>회사명 / 상호</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: (주)한국제조"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>담당자 성함</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 홍길동"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>연락처 (휴대폰)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="예: 010-1234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>이메일 주소</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="예: contact@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                  />
                </div>
              </div>

              {/* 업종 및 직함 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">주요 업종</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all"
                  >
                    <option value="제조·생산">제조·생산 / 공방 / 가공</option>
                    <option value="도소매·유통">도소매·유통 / 이커머스 쇼핑몰</option>
                    <option value="F&B·외식">F&amp;B / 외식 프랜차이즈</option>
                    <option value="학원·교육">학원·교육 / 체육 교습소</option>
                    <option value="의료·뷰티">의료 / 치과 / 피부 뷰티샵</option>
                    <option value="B2B전문서비스">B2B 전문서비스 / IT / 용역</option>
                    <option value="기타">기타 업종</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">직함 / 부서</label>
                  <input
                    type="text"
                    placeholder="예: 대표이사 / 생산관리팀장"
                    value={formData.contactPosition}
                    onChange={(e) => setFormData({ ...formData, contactPosition: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* 고유 식별 정보 (선택): 사업자등록번호 & 웹사이트 URL */}
              <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>정밀 기업 진단 &amp; 정부지원사업 즉시 매칭 (선택)</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full border border-emerald-200">
                    실시간 공공데이터 연동
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <span>사업자등록번호 (선택)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="예: 123-45-67890"
                      value={formData.bizNumber}
                      onChange={(e) => setFormData({ ...formData, bizNumber: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <span>회사 웹사이트 / 쇼핑몰 URL (선택)</span>
                    </label>
                    <input
                      type="url"
                      placeholder="예: https://example.com"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* 필요 자동화 영역 다중 선택 */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-800 block">
                  가장 시급하게 해결하고 싶은 자동화 영역 (복수 선택 가능)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {targetAreaOptions.map((area) => {
                    const isChecked = formData.targetAreas.includes(area);
                    return (
                      <label
                        key={area}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? "bg-emerald-50/80 border-emerald-500 font-bold text-emerald-950"
                            : "bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleCheckboxChange(area)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <span>{area}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 정부지원사업 활용 희망 여부 */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-800 block">
                  정부지원사업(비대면바우처/스마트공방 등) 연계 희망 여부
                </label>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {[
                    { id: "YES", label: "희망함 (국비 80~90%)" },
                    { id: "MAYBE", label: "상담 후 결정" },
                    { id: "NO", label: "자부담 자체 구축" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, useVoucher: item.id })}
                      className={`py-3 px-2 text-center rounded-xl border font-bold transition-all ${
                        formData.useVoucher === item.id
                          ? "bg-teal-900 text-white border-teal-900 shadow-xs"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세 요구사항 */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-slate-700">
                  현재 엑셀 업무의 문제점이나 원하시는 기능 (선택)
                </label>
                <textarea
                  rows={4}
                  placeholder="예: 3개 지점 엑셀 발주서를 매일 1시간씩 취합하고 있는데 자동화하고 싶습니다. 재고 부족 시 담당자 문자 알림도 필요합니다."
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 outline-none transition-all leading-relaxed"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl font-black text-sm sm:text-base transition-all shadow-lg hover:shadow-xl active:scale-98 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span>접수 처리 중...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>무료 AX 진단 &amp; 맞춤 견적 신청 완료</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2.5">
                  🔒 입력하신 기업 정보는 안전하게 암호화되어 견적 및 진단 목적으로만 사용됩니다.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
