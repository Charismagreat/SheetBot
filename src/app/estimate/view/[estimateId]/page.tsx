"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Printer,
  Copy,
  CheckCircle2,
  Phone,
  FileCheck,
  Calendar,
  MapPin,
  Building2,
  Mail,
  Share2,
  Check,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

interface EstimateItem {
  code: string;
  category: string;
  name: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
}

interface EstimateData {
  id: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  valid_until?: string;
  notes?: string;
  items: EstimateItem[];
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
  viewed_at?: string;
  user_email?: string;
  businessInfo: {
    companyName?: string;
    ownerName?: string;
    bizNumber?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    sealImageUrl?: string;
    paymentNotice?: string;
    extraNotice?: string;
  };
}

/** 숫자를 한글 금액 표기로 변환 (예: 1350000 -> 일백삼십오만 원정) */
function numberToKoreanCurrency(num: number): string {
  if (!num || num === 0) return "영 원정";
  const units = ["", "만", "억", "조"];
  const smallUnits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const tenUnits = ["", "십", "백", "천"];

  let result = "";
  let unitIndex = 0;
  let temp = Math.floor(Math.abs(num));

  while (temp > 0) {
    const chunk = temp % 10000;
    if (chunk > 0) {
      let chunkStr = "";
      let chunkTemp = chunk;
      for (let i = 0; i < 4; i++) {
        const digit = chunkTemp % 10;
        if (digit > 0) {
          const digitStr = digit === 1 && i > 0 ? "" : smallUnits[digit];
          chunkStr = digitStr + tenUnits[i] + chunkStr;
        }
        chunkTemp = Math.floor(chunkTemp / 10);
      }
      result = chunkStr + units[unitIndex] + " " + result;
    }
    unitIndex++;
    temp = Math.floor(temp / 10000);
  }

  return `일금 ${result.trim()} 원정`;
}

export default function EstimateViewerPage() {
  const params = useParams();
  const estimateId = String(params?.estimateId || "");

  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [copied, setCopied] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!estimateId) return;

    async function loadEstimate() {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/user/estimate/${estimateId}`);
        const data = await res.json();

        if (data.success && data.estimate) {
          setEstimate(data.estimate);
          if (data.estimate.status === "ACCEPTED") {
            setAccepted(true);
          }
        } else {
          setError(data.error || "견적서를 찾을 수 없습니다.");
        }
      } catch (err: any) {
        console.warn("[EstimateViewer] Load failed:", err.message);
        setError("견적서를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }

    loadEstimate();
  }, [estimateId]);

  // A4 브라우저 인쇄
  const handlePrint = () => {
    window.print();
  };

  // 링크 복사
  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 고객 견적 승인
  const handleAcceptEstimate = async () => {
    if (!estimate || accepted || accepting) return;
    const confirmAccept = window.confirm("본 견적 내용을 승인하고 작업을 확정하시겠습니까?");
    if (!confirmAccept) return;

    try {
      setAccepting(true);
      const res = await apiFetch(`/api/user/estimate/${estimate.id}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setAccepted(true);
        alert("견적이 성공적으로 승인되었습니다! 담당자가 신속히 확인 후 안내해 드립니다.");
      } else {
        alert(data.error || "승인 처리 중 오류가 발생했습니다. 담당자에게 직접 문의해 주세요.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">전자 견적서를 안전하게 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">견적서를 찾을 수 없습니다</h2>
          <p className="text-xs text-slate-500">{error || "유효하지 않거나 삭제된 견적서입니다."}</p>
        </div>
      </div>
    );
  }

  const { businessInfo } = estimate;
  const isExpired = estimate.valid_until && new Date(estimate.valid_until).getTime() < new Date().setHours(0, 0, 0, 0);

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3 sm:px-6 print:p-0 print:bg-white text-slate-800">
      {/* 상단 툴바 (인쇄 시 숨김) */}
      <div className="max-w-4xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <FileCheck className="w-3.5 h-3.5" /> 정식 공인 전자 견적서
          </span>
          {accepted ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> 승인 완료
            </span>
          ) : isExpired ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
              유효기간 만료
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
              유효 견적
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "복사됨" : "링크 복사"}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5" /> 인쇄 / PDF 저장
          </button>
        </div>
      </div>

      {/* 정식 견적서 본체 (A4 스타일 용지 규격) */}
      <div
        ref={printAreaRef}
        className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-300 p-6 sm:p-10 print:shadow-none print:border-none print:p-0 print:m-0"
      >
        {/* 견적서 대제목 및 기본 발행 정보 */}
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-widest text-slate-900 mb-2">
            견 적 서
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-mono tracking-wider">
            QUOTATION • 견적번호: {estimate.id}
          </p>
        </div>

        {/* 상단 2단 정보 테이블: 공급받는자(좌) vs 공급자(우) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 공급받는 자 (고객) */}
          <div className="border border-slate-300 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                <span className="text-xs font-bold text-slate-500 tracking-wider">공급받는 자 (귀하)</span>
                <span className="text-xs font-semibold text-slate-500">발행일: {estimate.created_at.split(" ")[0]}</span>
              </div>
              <div className="space-y-1.5 text-xs sm:text-sm">
                <div className="text-base sm:text-lg font-extrabold text-slate-900">
                  {estimate.customer_name} <span className="text-xs font-normal text-slate-600">귀하</span>
                </div>
                {estimate.customer_phone && (
                  <p className="text-slate-600">
                    <span className="font-semibold text-slate-500">연락처:</span> {estimate.customer_phone}
                  </p>
                )}
                {estimate.customer_address && (
                  <p className="text-slate-600">
                    <span className="font-semibold text-slate-500">시공/납품지:</span> {estimate.customer_address}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>견적 유효기간:</span>
              <span className="font-bold text-indigo-700">
                {estimate.valid_until ? `${estimate.valid_until}까지 (발행일 기준)` : "발행일로부터 14일간"}
              </span>
            </div>
          </div>

          {/* 공급자 정보 (사업자 및 직인 날인) */}
          <div className="border border-slate-300 rounded-xl p-4 bg-white relative">
            <div className="border-b border-slate-200 pb-2 mb-2 text-xs font-bold text-slate-500 tracking-wider">
              공 급 자
            </div>
            <table className="w-full text-xs text-slate-700">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1 font-bold text-slate-500 w-20">등록번호</td>
                  <td className="py-1 font-mono font-semibold" colSpan={3}>
                    {businessInfo.bizNumber || "미등록 (간이/개인)"}
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1 font-bold text-slate-500">상호(법인명)</td>
                  <td className="py-1 font-bold text-slate-900">{businessInfo.companyName || "스마트 견적센터"}</td>
                  <td className="py-1 font-bold text-slate-500 w-14">대표자</td>
                  <td className="py-1 font-bold text-slate-900 relative">
                    <span>{businessInfo.ownerName || "대표자"}</span>
                    {/* 직인(도장) 이미지 */}
                    {businessInfo.sealImageUrl && (
                      <img
                        src={businessInfo.sealImageUrl}
                        alt="직인"
                        className="absolute -top-3 left-8 w-12 h-12 object-contain opacity-85 pointer-events-none"
                      />
                    )}
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1 font-bold text-slate-500">사업장 주소</td>
                  <td className="py-1" colSpan={3}>
                    {businessInfo.address || "사업장 소재지"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-500">연락처/메일</td>
                  <td className="py-1" colSpan={3}>
                    {businessInfo.phone || "고객센터"} {businessInfo.email ? `| ${businessInfo.email}` : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 견적 총합계 금액 배너 */}
        <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">총 견적 합계 (VAT 포함)</span>
            <span className="text-sm font-medium text-slate-200">
              {numberToKoreanCurrency(estimate.total_amount)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
              ₩{estimate.total_amount.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-1">원</span>
          </div>
        </div>

        {/* 견적 품목 상세 명세표 */}
        <div className="border border-slate-300 rounded-xl overflow-hidden mb-6">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold">
                <th className="py-2.5 px-3 text-center w-12">순번</th>
                <th className="py-2.5 px-3">품목명 / 사양</th>
                <th className="py-2.5 px-3 text-center w-16">규격</th>
                <th className="py-2.5 px-3 text-center w-16">수량</th>
                <th className="py-2.5 px-3 text-right w-24">단가</th>
                <th className="py-2.5 px-3 text-right w-28">공급가액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {estimate.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-slate-900 block">{item.name}</span>
                    <span className="text-xs text-slate-500">[{item.category}] {item.code}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600">{item.spec || "1식"}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-800">{item.quantity}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                    {item.unitPrice.toLocaleString()}원
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    {item.amount.toLocaleString()}원
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-slate-700">
                <td colSpan={4} className="py-2 px-3 text-right text-slate-500">
                  공급가액 합계:
                </td>
                <td colSpan={2} className="py-2 px-3 text-right font-mono text-slate-800">
                  {estimate.supply_amount.toLocaleString()}원
                </td>
              </tr>
              <tr className="bg-slate-50 text-slate-700 font-semibold">
                <td colSpan={4} className="py-2 px-3 text-right text-slate-500">
                  부가가치세 (10%):
                </td>
                <td colSpan={2} className="py-2 px-3 text-right font-mono text-slate-800">
                  {estimate.vat_amount.toLocaleString()}원
                </td>
              </tr>
              <tr className="bg-slate-100 border-t border-slate-300 font-extrabold text-slate-900">
                <td colSpan={4} className="py-3 px-3 text-right text-sm">
                  총 견적금액:
                </td>
                <td colSpan={2} className="py-3 px-3 text-right font-mono text-base text-indigo-700">
                  {estimate.total_amount.toLocaleString()}원
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 특약 및 비고 안내문 */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-xs text-slate-600 space-y-2 mb-6">
          <p className="font-bold text-slate-800 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600" /> 견적 조건 및 안내 사항
          </p>
          {estimate.notes && (
            <p className="text-slate-700">
              <span className="font-semibold text-slate-600">• 고객 요청/비고:</span> {estimate.notes}
            </p>
          )}
          {businessInfo.paymentNotice && (
            <p className="text-slate-700">• {businessInfo.paymentNotice}</p>
          )}
          {businessInfo.extraNotice && (
            <p className="text-slate-700">• {businessInfo.extraNotice}</p>
          )}
          <p className="text-slate-500">• 본 견적서는 전자 방식으로 발행되었으며 공인 인감 날인 효력을 갖습니다.</p>
        </div>

        {/* 하단 고객 액션 영역 (인쇄 시 숨김) */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
          <div className="text-xs text-slate-500 text-center sm:text-left">
            궁금하신 사항은 언제든 담당자(
            <a href={`tel:${businessInfo.phone}`} className="text-indigo-600 font-bold underline">
              {businessInfo.phone || "문의처"}
            </a>
            )에게 연락해 주세요.
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {accepted ? (
              <div className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> 견적 승인 완료 (주문/작업 확정)
              </div>
            ) : isExpired ? (
              <div className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-200 text-slate-500 font-bold text-sm text-center">
                유효기간이 만료된 견적서입니다
              </div>
            ) : (
              <button
                onClick={handleAcceptEstimate}
                disabled={accepting}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {accepting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    승인 처리 중...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-indigo-200" />
                    견적 승인 및 주문/작업 확정하기
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
