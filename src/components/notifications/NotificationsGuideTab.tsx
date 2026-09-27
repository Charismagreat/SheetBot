import React from "react";
import { Smartphone, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function NotificationsGuideTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-black rounded-full border border-emerald-200">
          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
          <span>시트봇 에이전트(SheetBot Agent) 양방향 자동화 매뉴얼</span>
        </div>
        <h3 className="text-xl font-black text-slate-900">
          내 스마트폰을 24시간 0원 문자 발송 &amp; 시트 수신 서버로 활용하기
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
          복잡한 코드를 복사하거나 붙여넣을 필요가 없습니다. 
          스마트폰에 <strong>시트봇 에이전트(SheetBot Agent)</strong> 앱을 설치하고 QR 코드를 1초 만에 스캔하면,
          구글 스프레드시트와 스마트폰이 안전하게 1:1로 결합되어 완벽한 양방향 문자 자동화가 시작됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 카드 1: 발신 (시트 -> 고객) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-200 shadow-sm space-y-4 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs">
              1
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Outbound • 발신</span>
              <h4 className="text-sm font-extrabold text-slate-900">구글 시트 ➔ 고객 알림 0원 일괄 발송</h4>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            시중 유료 알림톡/문자 서비스(건당 20~40원) 대신, 스마트폰 요금제의 <strong>무제한 무료 문자</strong>를 사용하여 시트 고객들에게 대량 문자를 자동 발송합니다.
          </p>

          <div className="space-y-2.5 pt-1 text-xs text-slate-700">
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">A열 체크박스 선택:</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">시트에서 문자를 보낼 고객 행의 체크박스를 선택합니다.</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">[📱 선택 행 문자 일괄 발송] 메뉴 클릭:</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">시트 상단 🚀 SheetBot 메뉴에서 원클릭으로 발송을 실행합니다.</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">기기 점검 &amp; 원스톱 승인:</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">기기 연결 상태와 대상 건수를 확인 후 승인 시 즉시 0원으로 전송됩니다.</div>
              </div>
            </div>
          </div>
        </div>

        {/* 카드 2: 수신 (스마트폰 -> 시트) */}
        <div className="bg-white rounded-3xl p-6 sm:p-7 border border-indigo-200 shadow-sm space-y-4 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
              2
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">Inbound • 수신 SMS</span>
              <h4 className="text-sm font-extrabold text-slate-900">스마트폰 수신 문자 ➔ 구글 시트 자동 기록</h4>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            스마트폰으로 들어온 <strong>쇼핑몰 결제 문자, 법인카드 승인 SMS, 고객의 회신 답장</strong>을 실시간 감지하여 구글 시트에 1초 만에 자동 기록합니다.
          </p>

          <div className="space-y-2.5 pt-1 text-xs text-slate-700">
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">키워드 자동 필터링:</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">[입금완료], [결제], 은행명 등 지정한 조건의 SMS만 정확히 수집합니다.</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">구글 시트 1행 추가 (Realtime):</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">일시, 발신번호, 결제금액, 주문내역을 분리하여 다음 빈 행에 자동 기입합니다.</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">스마트 후속 자동화 연계:</strong>
                <div className="text-[11px] text-slate-500 mt-0.5">기록과 동시에 재고 차감이나 감사 이메일 발송 등 연쇄 파이프라인이 즉시 작동합니다.</div>
              </div>
            </div>
          </div>
        </div>

        {/* 카드 3: 매장 POS 결제 & 배달앱 푸시 실시간 감지 (0원 자동 장부) */}
        <div className="bg-gradient-to-br from-white via-amber-50/20 to-orange-50/30 rounded-3xl p-6 sm:p-7 border-2 border-amber-200/90 shadow-sm space-y-4 md:col-span-2 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shadow-xs">
                🏪
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    킬러 기능 • POS &amp; 배달앱 푸시 감지
                  </span>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    API 연동비 0원
                  </span>
                </div>
                <h4 className="text-base font-black text-slate-900 mt-0.5">
                  페이히어 · 오케이포스 · 나이스포스 · 배민사장님 결제 푸시 ➔ 실시간 매출 시트 자동 기록
                </h4>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">페이히어</span>
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">오케이포스</span>
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">나이스포스</span>
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">토스플레이스</span>
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">배민사장님</span>
              <span className="px-2 py-0.5 bg-white border border-amber-300 rounded-md text-[10.5px] font-bold text-slate-700 shadow-2xs">쿠팡이츠</span>
            </div>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">
            포스사/VAN사의 비싼 API 연동 없이도, 점주 스마트폰에 설치된 <strong>포스 앱이나 배달앱의 실시간 결제 승인 푸시 알림</strong>을 시트봇 에이전트가 0.05초 만에 캡처합니다. 승인금액, 결제수단, 시간, 매장명을 발라내어 구글 시트 매출 장부에 자동으로 1행씩 누적합니다.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="p-3.5 rounded-2xl bg-white/90 border border-amber-200/80 shadow-2xs space-y-1">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <span className="text-amber-600">⚡</span>
                <span>실시간 마감 대기 0초</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                매일 밤 영수증 모아 엑셀에 수작업 입력하거나 POS 사이트에서 엑셀을 내려받을 필요가 없습니다. 손님이 카드 긁는 즉시 시트에 기록됩니다.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/90 border border-amber-200/80 shadow-2xs space-y-1">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <span className="text-emerald-600">📊</span>
                <span>홀 + 배달앱 통합 장부</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                매장 포스(오케이포스·페이히어)와 배달앱(배민·쿠팡이츠) 알림을 한 구글 시트에 모아 실시간 일일 총매출과 채널별 비중을 자동 피벗 집계합니다.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/90 border border-amber-200/80 shadow-2xs space-y-1">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <span className="text-indigo-600">🎯</span>
                <span>목표 &amp; VIP 자동 알림</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                "일 매출 150만원 달성 시 사장님 폰으로 축하 문자", "15만원 이상 단체 결제 시 VIP 고객 시트로 자동 분류" 등 무제한 자동화가 가능합니다.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 원클릭 AI 자동 주입 안내 배너 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-7 text-white border border-indigo-500/20 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
            <Sparkles className="w-4 h-4" />
            <span>수동 복붙 없이 0초 만에 시트에 기능 주입</span>
          </div>
          <h4 className="text-base font-extrabold text-white">
            새 시트에 문자 발송 기능을 넣고 싶으신가요?
          </h4>
          <p className="text-slate-300 text-xs leading-relaxed max-w-2xl">
            시트 상단 <strong>[🚀 SheetBot 메뉴] ➔ [🤖 SheetBot AI 코파일럿]</strong>을 열고 
            <em>"A열 체크박스 선택 행으로 고객에게 문자 발송하는 메뉴 만들어줘"</em>라고 말씀만 하시면, 
            시트봇 AI가 필요한 Apps Script 코드를 구글 클라우드에 원클릭으로 직접 주입합니다.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 flex-shrink-0 active:scale-95"
        >
          <span>내 워크스페이스 바로가기</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
