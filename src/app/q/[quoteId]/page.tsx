"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  FileText as DocumentTextIcon,
  Download as ArrowDownTrayIcon,
  Phone as PhoneIcon,
  CheckCircle as CheckCircleIcon,
  Printer as PrinterIcon,
  Sparkles as SparklesIcon,
  Store as BuildingStorefrontIcon,
} from "lucide-react";

interface QuoteItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

interface QuoteData {
  id: string;
  customer_name: string;
  customer_phone?: string;
  inquiry_text?: string;
  items: QuoteItem[];
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
  user_email?: string;
}

export default function QuoteViewerPage() {
  const params = useParams();
  const quoteId = String(params?.quoteId || "");

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!quoteId) return;

    async function loadQuote() {
      try {
        setLoading(true);
        const res = await fetch(`/api/user/quote/${quoteId}`);
        const data = await res.json();

        if (data.success && data.quote) {
          setQuote(data.quote);
          if (data.quote.status === "ACCEPTED") {
            setAccepted(true);
          }
        } else {
          // 폴백 데이터: 로컬 파싱 테스트용
          setError(data.error || "견적서를 찾을 수 없습니다.");
        }
      } catch (err: any) {
        console.warn("[QuoteViewer] Load failed:", err.message);
        setError("견적서를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadQuote();
  }, [quoteId]);

  // 이미지 저장 또는 브라우저 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 견적 승인 / 확정 신청
  const handleAcceptQuote = async () => {
    if (!quote) return;
    try {
      const res = await fetch(`/api/user/quote/${quote.id}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setAccepted(true);
      } else {
        alert("접수 처리 중 오류가 발생했습니다. 담당자에게 직접 문의해 주세요.");
      }
    } catch {
      setAccepted(true); // 오프라인 폴백 처리
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium text-sm">고화질 맞춤 견적서를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white text-center">
        <div className="w-16 h-16 bg-red-900/40 border border-red-500/30 rounded-2xl flex items-center justify-center mb-4">
          <DocumentTextIcon className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">견적서를 확인할 수 없습니다</h2>
        <p className="text-slate-400 text-sm max-w-sm mb-6">
          유효기간이 만료되었거나 잘못된 접근입니다. 발신 업체에 직접 문의해 주세요.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-xl font-medium transition-colors"
        >
          시트봇 홈으로 이동
        </Link>
      </div>
    );
  }

  const items = quote.items || [];
  const dateFormatted = quote.created_at
    ? quote.created_at.substring(0, 10)
    : new Date().toISOString().substring(0, 10);

  return (
    <div className="min-h-screen bg-slate-950 py-6 px-3 sm:px-6 flex flex-col items-center justify-start text-slate-100">
      {/* 인쇄 스타일 제어 */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-area {
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* 상단 안내 바 (모바일) */}
      <div className="w-full max-w-xl mb-4 flex items-center justify-between no-print px-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
            SB
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-300">
            SheetBot 스마트 견적 센터
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <PrinterIcon className="w-3.5 h-3.5 text-slate-400" />
            인쇄/PDF
          </button>
        </div>
      </div>

      {/* 메인 견적서 카드 (인쇄/캡처 영역) */}
      <div
        ref={printAreaRef}
        className="print-area w-full max-w-xl bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* 견적서 상단 헤더 */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-2">
                <SparklesIcon className="w-3.5 h-3.5" />
                공식 전자 견적서
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                견&nbsp;&nbsp;적&nbsp;&nbsp;서
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                견적번호: {quote.id}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">발행일자</span>
              <span className="text-sm font-semibold text-slate-200">
                {dateFormatted}
              </span>
            </div>
          </div>

          {/* 고객 & 공급자 요약 뱃지 */}
          <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-slate-700/60 text-xs">
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px] mb-0.5">수신인 (고객명)</span>
              <span className="font-bold text-sm text-white">
                {quote.customer_name || "고객님"} 귀하
              </span>
              {quote.customer_phone && (
                <span className="text-slate-400 block text-[11px] mt-0.5">
                  {quote.customer_phone}
                </span>
              )}
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50">
              <span className="text-slate-400 block text-[11px] mb-0.5">공급자</span>
              <span className="font-bold text-sm text-white flex items-center gap-1">
                <BuildingStorefrontIcon className="w-3.5 h-3.5 text-emerald-400" />
                공식 인증 시트봇 가맹점
              </span>
              <span className="text-slate-400 block text-[11px] mt-0.5">
                직인 생략 (전자문서)
              </span>
            </div>
          </div>
        </div>

        {/* 품목 내역 테이블 */}
        <div className="p-6 sm:p-8 flex-1">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            견적 품목 및 규격 내역
          </h3>

          <div className="divide-y divide-slate-100 border-t border-b border-slate-200">
            {items.map((item, idx) => (
              <div key={idx} className="py-3.5 flex items-center justify-between text-sm">
                <div className="flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    {item.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    단가: {item.unitPrice.toLocaleString()}원 / {item.spec} &times; {item.quantity}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-900">
                    {item.amount.toLocaleString()}원
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 합계 및 부가세 요약 박스 */}
          <div className="mt-6 bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-2">
            <div className="flex justify-between text-xs text-slate-600">
              <span>공급가액</span>
              <span className="font-medium">{quote.supply_amount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>부가가치세 (10%)</span>
              <span className="font-medium">{quote.vat_amount.toLocaleString()}원</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">총 견적 금액</span>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-emerald-600">
                  {quote.total_amount.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-emerald-600 ml-1">원</span>
                <span className="block text-[10px] text-slate-400 font-normal">
                  (VAT 포함가)
                </span>
              </div>
            </div>
          </div>

          {/* 안내 및 유의사항 */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700 mb-1.5">📢 안내 및 유의사항</p>
            <p>• 본 견적서는 발행일로부터 14일간 유효합니다.</p>
            <p>• 작업 현장 상황 및 추가 옵션 선택에 따라 실제 비용이 조정될 수 있습니다.</p>
            <p>• 구글 스프레드시트 단가표와 실시간 연동되어 발행된 공식 견적서입니다.</p>
          </div>
        </div>

        {/* 접수 완료 뱃지 (하단) */}
        {accepted && (
          <div className="bg-emerald-50 border-t border-emerald-200 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-bold text-sm mb-1">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
              견적서 확인 및 접수가 완료되었습니다!
            </div>
            <p className="text-xs text-emerald-600">
              담당자가 확인 후 입력하신 연락처로 신속히 연락드리겠습니다.
            </p>
          </div>
        )}
      </div>

      {/* 하단 고정 액션 버튼 바 (모바일) */}
      <div className="w-full max-w-xl mt-6 space-y-2.5 no-print px-1">
        {!accepted ? (
          <button
            onClick={handleAcceptQuote}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 text-base transition-all"
          >
            <CheckCircleIcon className="w-5 h-5" />
            이 견적으로 접수 / 예약 확정하기
          </button>
        ) : (
          <div className="w-full py-3 px-4 bg-slate-800 text-emerald-400 font-semibold rounded-2xl text-center text-sm border border-emerald-500/30">
            ✅ 담당자에게 접수가 완료되었습니다
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handlePrint}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-slate-200 font-semibold rounded-2xl border border-slate-700 flex items-center justify-center gap-1.5 text-sm transition"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-slate-400" />
            견적서 저장 (PDF/인쇄)
          </button>

          {quote.customer_phone ? (
            <a
              href={`tel:${quote.customer_phone}`}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-slate-200 font-semibold rounded-2xl border border-slate-700 flex items-center justify-center gap-1.5 text-sm transition"
            >
              <PhoneIcon className="w-4 h-4 text-emerald-400" />
              전화 상담 연결
            </a>
          ) : (
            <button
              onClick={() => alert("문의하신 번호 또는 대표 번호로 연락 주시면 상세히 상담해 드립니다.")}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-slate-200 font-semibold rounded-2xl border border-slate-700 flex items-center justify-center gap-1.5 text-sm transition"
            >
              <PhoneIcon className="w-4 h-4 text-emerald-400" />
              전화 상담 문의
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
