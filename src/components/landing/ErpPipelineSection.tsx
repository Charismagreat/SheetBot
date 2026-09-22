"use client";

import React from "react";
import { Layers, ShoppingBag, Building2, GraduationCap, Wrench } from "lucide-react";

export default function ErpPipelineSection() {
  return (
    <div className="w-full space-y-8 pt-4">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100/70 border border-teal-300 text-teal-800 text-[11px] sm:text-xs font-black mx-auto">
          <Layers className="w-3.5 h-3.5 text-teal-600" />
          <span>멀티 시트 오케스트레이션 (Multi-Sheet Automation)</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 break-keep">
          "구글 시트 3장으로 끝내는 초경량 ERP 파이프라인"
        </h2>
        <p className="text-xs sm:text-base text-slate-500 max-w-2xl mx-auto break-keep leading-relaxed">
          월 수십만 원 Zapier도, 수천만 원짜리 맞춤형 ERP도 필요 없습니다.<br className="hidden sm:inline" />
          A시트 입력 ➔ B시트 자동 가공 ➔ C시트 무료 고객 문자까지 1초 만에 유기적으로 연결됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto text-left">
        {/* Pipeline Card 1: 유통 / 쇼핑몰 */}
        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">사례 01 · 유통 &amp; 쇼핑몰</span>
                <h3 className="font-extrabold text-base text-slate-900">주문 접수 ➔ 창고 출고 ➔ 배송 안내</h3>
              </div>
            </div>
            <span className="text-[11px] font-black text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-lg">일 2시간 절약</span>
          </div>

          {/* Data Flow Visual */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
              <span>주문 접수처 (스마트스토어/자사몰 신규 주문 인입)</span>
            </div>
            <div className="pl-6 text-[11px] text-teal-600 font-bold flex items-center gap-1">
              ↓ 박스 규격·창고 위치 자동 연산 &amp; 포장팀으로 실시간 이관
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded font-mono text-[11px] border border-teal-200">B시트</span>
              <span>창고 출고 대장 (출고 지시서 자동 생성, 매출 시트 보안 격리)</span>
            </div>
            <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              ↓ 송장 번호 입력 시 매핑된 고객 스마트폰 무료 SMS 즉시 발송
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
              <span>고객 알림 DB ("OO님 주문이 출고되었습니다" 무료 SMS)</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
            <span className="font-bold text-slate-700">💡 핵심 가치:</span>
            <span>창고 직원에게 매출 시트 노출 원천 차단 + 오배송 사고 0건</span>
          </div>
        </div>

        {/* Pipeline Card 2: B2B 기업 / 에이전시 */}
        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wide">사례 02 · B2B 전문직 &amp; 에이전시</span>
                <h3 className="font-extrabold text-base text-slate-900">영업 수주 ➔ 회계 정산 ➔ 입금 요청</h3>
              </div>
            </div>
            <span className="text-[11px] font-black text-indigo-700 bg-indigo-100/70 px-2.5 py-1 rounded-lg">미수금 누락 0%</span>
          </div>

          {/* Data Flow Visual */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
              <span>영업 수주 대장 (영업팀 계약 체결 및 발주 품목 입력)</span>
            </div>
            <div className="pl-6 text-[11px] text-indigo-600 font-bold flex items-center gap-1">
              ↓ 공급가액, 세액(10%), 마진율 자동 계산 후 회계 원장 전송
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-800 rounded font-mono text-[11px] border border-indigo-200">B시트</span>
              <span>회계 미수금 원장 (입금 기한별 정산 원장 기입, 영업팀 차단)</span>
            </div>
            <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              ↓ 결제일 D-3일 전 거래처 경리 담당자 스마트폰으로 무료 SMS
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
              <span>거래처 경리 DB ("[OO상사] 세금계산서 입금 예정일 안내")</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
            <span className="font-bold text-slate-700">💡 핵심 가치:</span>
            <span>영업·회계팀 간 엑셀 대조 업무 0건 + 미수금 회수 속도 3배 향상</span>
          </div>
        </div>

        {/* Pipeline Card 3: 학원 / 병의원 / 컨설팅 */}
        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide">사례 03 · 학원 &amp; 병의원 &amp; 상담</span>
                <h3 className="font-extrabold text-base text-slate-900">상담 신청 ➔ 강사 배정 ➔ 노쇼 방지</h3>
              </div>
            </div>
            <span className="text-[11px] font-black text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-lg">노쇼율 80% 감소</span>
          </div>

          {/* Data Flow Visual */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
              <span>신규 상담·예약 접수처 (웹 설문지/홈페이지 신청서 접수)</span>
            </div>
            <div className="pl-6 text-[11px] text-amber-600 font-bold flex items-center gap-1">
              ↓ 희망 시간대 분석 후 담당 강사/의사별 빈 시간대 자동 배정
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded font-mono text-[11px] border border-amber-200">B시트</span>
              <span>스케줄 캘린더 대장 (강사·의사별 진료/수업 일정 자동 기입)</span>
            </div>
            <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              ↓ 배정 즉시 확정 안내 및 방문 D-1일 리마인드 무료 SMS 발송
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
              <span>수강생·환자 DB (약도/준비물 포함 확정 &amp; 리마인드 SMS)</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
            <span className="font-bold text-slate-700">💡 핵심 가치:</span>
            <span>월 10만 원대 예약 솔루션 구독료 0원 + 노쇼(No-Show) 손실 원천 차단</span>
          </div>
        </div>

        {/* Pipeline Card 4: 제조 / 현장 AS */}
        <div className="bg-gradient-to-br from-white to-slate-50/50 rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs hover:shadow-lg transition-all space-y-4 group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-teal-50 text-teal-600 rounded-2xl group-hover:scale-110 transition-transform">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-teal-600 uppercase tracking-wide">사례 04 · 제조업 &amp; 현장 AS 센터</span>
                <h3 className="font-extrabold text-base text-slate-900">고장 접수 ➔ 부품 출고 ➔ 기사 출동</h3>
              </div>
            </div>
            <span className="text-[11px] font-black text-teal-700 bg-teal-100/70 px-2.5 py-1 rounded-lg">전화 통화 0건</span>
          </div>

          {/* Data Flow Visual */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">A시트</span>
              <span>고객 AS 접수 센터 (장비 모델명 및 고장 증상 접수)</span>
            </div>
            <div className="pl-6 text-[11px] text-teal-600 font-bold flex items-center gap-1">
              ↓ 수리 소요 부품 본사 재고 자동 차감 &amp; 수리 이력 대장 이관
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-teal-50 text-teal-800 rounded font-mono text-[11px] border border-teal-200">B시트</span>
              <span>본사 부품 재고 &amp; 수리 대장 (부품 재고 실시간 동기화)</span>
            </div>
            <div className="pl-6 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              ↓ 지역 관할 현장 기사에게 고객 정보·증상 담긴 출동 SMS 전송
            </div>
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-mono text-[11px] border border-emerald-200">C시트</span>
              <span>현장 기사 및 고객 DB (출동 지시 SMS &amp; 고객 방문 예정 알림)</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-100/80 p-2.5 rounded-xl flex items-center gap-1.5 font-medium">
            <span className="font-bold text-slate-700">💡 핵심 가치:</span>
            <span>현장-창고-기사 간 전화 통화 0건 + 고객 AS 접수 당일 즉시 출동</span>
          </div>
        </div>
      </div>
    </div>
  );
}
