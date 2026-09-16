"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Printer,
  Copy,
  Check,
  X,
  FileText,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  Send,
  AlertCircle,
  Move,
  Maximize2,
} from "lucide-react";
import { buildProposalData, type ProposalData } from "@/lib/proposal-generator";
import { apiFetch } from "@/lib/api";

interface AdminProposalModalProps {
  inquiry: any;
  onClose: () => void;
}

/**
 * 숫자를 한글 금액 표기(예: 일천이백삼십만원)로 변환하는 헬퍼
 */
function numberToKoreanWon(amount: number): string {
  if (!amount || isNaN(amount)) return "영";
  const units = ["", "만", "억", "조"];
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

  let result = "";
  let unitIdx = 0;
  let num = Math.floor(amount);

  while (num > 0 && unitIdx < units.length) {
    const part = num % 10000;
    if (part > 0) {
      let partStr = "";
      const p1000 = Math.floor(part / 1000);
      const p100 = Math.floor((part % 1000) / 100);
      const p10 = Math.floor((part % 100) / 10);
      const p1 = part % 10;

      if (p1000 > 0) partStr += (p1000 > 1 ? digits[p1000] : "") + "천";
      if (p100 > 0) partStr += (p100 > 1 ? digits[p100] : "") + "백";
      if (p10 > 0) partStr += (p10 > 1 ? digits[p10] : "") + "십";
      if (p1 > 0) partStr += digits[p1];

      result = partStr + units[unitIdx] + " " + result;
    }
    num = Math.floor(num / 10000);
    unitIdx++;
  }

  return result.trim();
}

export default function AdminProposalModal({ inquiry, onClose }: AdminProposalModalProps) {
  // 초기 견적서 데이터 빌드 및 상태화
  const [initialData] = useState<ProposalData>(() => buildProposalData(inquiry));
  const [data, setData] = useState<ProposalData>(initialData);

  const [copied, setCopied] = useState(false);
  const [isModified, setIsModified] = useState(false);

  // ✨ 드래그 & 리사이즈 가능한 AI 자연어 수정 팝업창 상태
  const [isAiEditorOpen, setIsAiEditorOpen] = useState(true); // 편의를 위해 기본 열림 상태
  const [aiPrompt, setAiPrompt] = useState("");
  const [isEditingWithAi, setIsEditingWithAi] = useState(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);

  // 팝업 위치 및 크기 상태 (기본 우측 상단 배치)
  const [popupPos, setPopupPos] = useState({ x: 80, y: 70 });
  const [popupSize, setPopupSize] = useState({ width: 500, height: 420 });

  // 마우스 드래그 이동 참조
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    // 닫기 버튼 등 컨트롤 클릭 시 드래그 방지
    if ((e.target as HTMLElement).closest("button")) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: popupPos.x,
      posY: popupPos.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPopupPos({
        x: Math.max(10, Math.min(window.innerWidth - 120, dragRef.current.posX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 100, dragRef.current.posY + dy)),
      });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 마우스 드래그 크기 조절 참조
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: popupSize.width,
      startH: popupSize.height,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setPopupSize({
        width: Math.max(340, Math.min(window.innerWidth - 40, resizeRef.current.startW + dw)),
        height: Math.max(300, Math.min(window.innerHeight - 40, resizeRef.current.startH + dh)),
      });
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 초기 위치를 화면 오른쪽 편안한 곳으로 자동 배치
  useEffect(() => {
    if (typeof window !== "undefined") {
      const initialX = Math.max(20, window.innerWidth - 560);
      setPopupPos({ x: initialX, y: 75 });
    }
  }, []);

  const handlePrint = () => {
    const printArea = document.getElementById("proposal-print-area");
    if (!printArea) {
      window.print();
      return;
    }

    // 인쇄 전용 숨김 iframe을 생성하여 브라우저 모달 인쇄 빈 화면 버그 완벽 차단
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1024px"; // 데스크톱 규격 너비로 렌더링하여 반응형 붕괴 방지
    iframe.style.height = "768px";
    iframe.style.border = "none";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "-9999";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    // 현재 페이지의 모든 스타일 태그 및 CSS 복제
    let stylesHtml = "";
    document.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => {
      stylesHtml += el.outerHTML;
    });

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <title>${data.project.title || "SheetBot 맞춤 구축 제안서 및 견적서"}</title>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 12mm;
            }
            body {
              background: white !important;
              color: #0f172a !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #proposal-print-area {
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            /* 인쇄 시에도 [공급받는자] / [공급자] 테이블이 반드시 좌우 2열로 나란히 고정 */
            .proposal-grid-2cols {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 1rem !important;
            }
            /* 인쇄 시 섹션 중간 절단 방지 */
            .print-avoid-break {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .print-hide {
              display: none !important;
            }
          </style>
        </head>
        <body>
          <div id="proposal-print-area">
            ${printArea.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 350);
  };

  // AI 자연어 견적서 수정 요청 핸들러
  const handleAiEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiPrompt.trim() || isEditingWithAi) return;

    setIsEditingWithAi(true);
    setEditErrorMsg(null);
    setEditSuccessMsg(null);

    try {
      const res = await apiFetch("/api/admin/proposal/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentProposal: data,
          prompt: aiPrompt.trim(),
        }),
      });

      const resData = await res.json();
      if (resData.success && resData.updatedProposal) {
        setData(resData.updatedProposal);
        setIsModified(true);
        setEditSuccessMsg("✨ 자연어 지시사항에 따라 견적서가 성공적으로 수정되었습니다.");
        setAiPrompt("");
        setTimeout(() => setEditSuccessMsg(null), 4000);
      } else {
        setEditErrorMsg(resData.error || "견적서 수정 처리에 실패했습니다.");
      }
    } catch (err: any) {
      setEditErrorMsg("견적서 수정 서버 통신 중 오류가 발생했습니다.");
    } finally {
      setIsEditingWithAi(false);
    }
  };

  // 텍스트에어리어 키보드 단축키 (Ctrl+Enter)
  const handleKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleAiEdit();
    }
  };

  // 최초 원본 견적서로 초기화
  const handleResetToOriginal = () => {
    if (confirm("수정된 모든 내용을 취소하고 최초 자동 생성된 견적서로 되돌리시겠습니까?")) {
      setData(initialData);
      setIsModified(false);
      setEditSuccessMsg("최초 생성 견적서로 복원되었습니다.");
      setTimeout(() => setEditSuccessMsg(null), 3000);
    }
  };

  const handleCopySummary = async () => {
    const summaryText = `[SheetBot Enterprise AX 맞춤 구축 견적서 요약]
- 고객사: ${data.client.companyName} (${data.client.contactName} 귀하)
- 제안건명: ${data.project.title}
- 공급가액: ₩${data.quotation.subtotal.toLocaleString()}
- 부가세: ₩${data.quotation.vat.toLocaleString()}
- 총 견적금액: ₩${data.quotation.total.toLocaleString()} (VAT 포함)
${
  data.voucherDiscount
    ? `\n* 🏛️ ${data.voucherDiscount.voucherName} 매칭 시:
  - 정부 지원금 (${data.voucherDiscount.supportRatio}%): ₩${data.voucherDiscount.governmentSupportAmount.toLocaleString()}
  - 기업 실부담금: ₩${data.voucherDiscount.clientSelfPayAmount.toLocaleString()} (VAT 별도)`
    : ""
}
- 견적 유효기간: ${data.validUntil}까지
- 문의: ${data.provider.contactPhone} / ${data.provider.contactEmail}`;

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("클립보드 복사 실패:", err);
    }
  };

  // 통화 포맷터 (KRW)
  const formatKrw = (num: number) => {
    return new Intl.NumberFormat("ko-KR").format(num) + "원";
  };

  /**
   * 사업장소재지 주소 축약 헬퍼
   * - 1차: 시/도/구/시/군 간소화 및 도로명 공백 축소 ('서울특별시 -> 서울', '강남구 -> 강남', '테헤란로 152 -> 테헤란로152')
   * - 2차: 여전히 길어서 모두 표시하기 어려울 경우(길이 초과 시) 주소의 뒷부분(도로명 + 상세주소) 위주로 표시 ('테헤란로152 강남파이낸스센터 19층')
   */
  function compactAddress(addr: string | undefined | null, maxChars: number = 22): string {
    if (!addr || addr.trim() === "" || addr.trim() === "-") return "-";
    const original = addr.trim();

    // 원본이 이미 충분히 짧으면 그대로 반환
    if (original.length <= maxChars) {
      return original;
    }

    // 1단계: 주요 시/도 명칭 축약
    let s = original
      .replace(/서울특별시|서울시/g, "서울")
      .replace(/경기도/g, "경기")
      .replace(/인천광역시|인천시/g, "인천")
      .replace(/부산광역시|부산시/g, "부산")
      .replace(/대구광역시|대구시/g, "대구")
      .replace(/대전광역시|대전시/g, "대전")
      .replace(/광주광역시|광주시/g, "광주")
      .replace(/울산광역시|울산시/g, "울산")
      .replace(/세종특별자치시|세종시/g, "세종")
      .replace(/강원특별자치도|강원도/g, "강원")
      .replace(/충청북도|충북도/g, "충북")
      .replace(/충청남도|충남도/g, "충남")
      .replace(/전북특별자치도|전라북도|전북도/g, "전북")
      .replace(/전라남도|전남도/g, "전남")
      .replace(/경상북도|경북도/g, "경북")
      .replace(/경상남도|경남도/g, "경남")
      .replace(/제주특별자치도|제주도/g, "제주");

    // 2단계: '구', '시', '군' 접미사 간소화 (예: 강남구 -> 강남, 시흥시 -> 시흥, 분당구 -> 분당)
    s = s.replace(/([가-힣]{2,})[시구군]\b/g, "$1");

    // 3단계: 도로명과 번지 사이 공백 제거 (예: '테헤란로 152' -> '테헤란로152', '엠티브이25로 58번길' -> '엠티브이25로58번길')
    s = s.replace(/([가-힣0-9]+[로길])\s+([0-9]+(?:번길|-?[0-9]+)?)/g, "$1$2");

    // 1~3단계 축약 결과가 maxChars 이하이면 반환
    if (s.length <= maxChars) {
      return s;
    }

    // 4단계: 그래도 다 표시하지 못할 때 -> 주소의 마지막 부분(도로명 + 상세건물/층수 등) 위주로 추출
    const roadIndex = s.search(/[가-힣0-9]+[로길]/);
    if (roadIndex !== -1) {
      const tail = s.substring(roadIndex).trim();
      if (tail.length <= maxChars) {
        return tail;
      }
      return tail.slice(0, maxChars);
    }

    // 도로명 패턴이 없으면 뒷부분을 maxChars만큼 반환
    return s.slice(-maxChars);
  }

  const koreanTotal = numberToKoreanWon(data.quotation.total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* 스타일 주입 (인쇄 최적화) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #proposal-print-area,
          #proposal-print-area * {
            visibility: visible;
          }
          #proposal-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20mm;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-hide {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      {/* 1. ✨ [신규] 마우스 드래그 이동 & 크기 조절 가능한 AI 자연어 수정 플로팅 팝업창 */}
      {isAiEditorOpen && (
        <div
          className="fixed z-[70] bg-slate-950/95 text-white backdrop-blur-md rounded-2xl shadow-2xl border border-indigo-500/50 flex flex-col print-hide overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: `${popupPos.x}px`,
            top: `${popupPos.y}px`,
            width: `${popupSize.width}px`,
            height: `${popupSize.height}px`,
          }}
        >
          {/* 드래그 가능한 상단 타이틀 헤더 바 */}
          <div
            onMouseDown={handleMouseDownHeader}
            className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border-b border-indigo-900/60 cursor-move select-none shrink-0"
            title="마우스로 드래그하여 창을 원하는 위치로 이동하세요"
          >
            <div className="flex items-center gap-2">
              <Move className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="font-black text-xs text-white flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI 자연어 견적서 스마트 수정</span>
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:inline">(드래그 이동 / 크기 조절)</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsAiEditorOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="수정 창 닫기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 여러 줄 입력 다이얼로그 본문 */}
          <div className="flex-1 p-3.5 flex flex-col gap-2.5 overflow-hidden text-xs">
            <div className="flex items-center justify-between text-[11px] text-indigo-200">
              <span className="font-medium">수정하고 싶은 내용을 자유롭게 여러 줄로 작성하세요:</span>
              <span className="text-[10px] text-slate-400">Ctrl + Enter로 바로 적용</span>
            </div>

            {/* 여러 줄 textarea */}
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={handleKeyDownTextarea}
              placeholder="예시:
1. 공급받는자의 담당자 이름을 '홍길동'으로 변경해줘
2. 구축 범위에서 '설비 가동률 기록'을 빼고 '실시간 불량률 모니터링'을 추가해줘
3. 산출 내역에서 1번 코어 엔진 단가를 180만원으로 수정하고, 4번 항목은 삭제해줘"
              className="flex-1 w-full bg-slate-900/90 border border-indigo-400/40 focus:border-amber-400 text-white placeholder:text-slate-500 rounded-xl p-3 text-xs focus:outline-none leading-relaxed resize-none shadow-inner"
              disabled={isEditingWithAi}
            />

            {/* 빠른 추천 지시 칩 버튼 */}
            <div className="space-y-1 shrink-0">
              <div className="text-[10px] text-slate-400">자주 쓰는 예시 문구 (클릭 시 입력):</div>
              <div className="flex flex-wrap gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setAiPrompt((prev) => (prev ? prev + "\n" : "") + "공급받는자의 담당자 이름을 홍길동으로 변경해줘")}
                  className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-indigo-200 border border-white/10 cursor-pointer"
                >
                  + 담당자명 변경
                </button>
                <button
                  type="button"
                  onClick={() => setAiPrompt((prev) => (prev ? prev + "\n" : "") + "구축 범위에 '실시간 불량률 분석 및 경고 알림' 항목을 추가해줘")}
                  className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-indigo-200 border border-white/10 cursor-pointer"
                >
                  + 구축 범위 추가
                </button>
                <button
                  type="button"
                  onClick={() => setAiPrompt((prev) => (prev ? prev + "\n" : "") + "산출 내역에서 4번 유지보수 항목을 삭제하고 총 합계를 재계산해줘")}
                  className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-indigo-200 border border-white/10 cursor-pointer"
                >
                  + 4번 항목 삭제
                </button>
                <button
                  type="button"
                  onClick={() => setAiPrompt((prev) => (prev ? prev + "\n" : "") + "총 공급가액이 350만원이 되도록 세부 항목들의 단가를 비율에 맞게 조정해줘")}
                  className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-indigo-200 border border-white/10 cursor-pointer"
                >
                  + 총액 350만원 맞춤
                </button>
              </div>
            </div>

            {/* 성공/오류 피드백 */}
            {editSuccessMsg && (
              <div className="text-[11px] font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 animate-in fade-in shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{editSuccessMsg}</span>
              </div>
            )}
            {editErrorMsg && (
              <div className="text-[11px] font-bold text-rose-300 bg-rose-950/70 border border-rose-500/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 animate-in fade-in shrink-0">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>{editErrorMsg}</span>
              </div>
            )}

            {/* 하단 제어 버튼 바 */}
            <div className="flex items-center justify-between pt-1 shrink-0 border-t border-slate-800">
              <div className="flex items-center gap-1.5">
                {isModified && (
                  <button
                    type="button"
                    onClick={handleResetToOriginal}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="최초 원본 견적서로 되돌리기"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>원본 복원</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAiEditorOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  창 숨기기
                </button>
                <button
                  type="button"
                  onClick={() => handleAiEdit()}
                  disabled={isEditingWithAi || !aiPrompt.trim()}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-sm active:scale-95"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isEditingWithAi ? "animate-spin" : ""}`} />
                  <span>{isEditingWithAi ? "AI 반영 중..." : "AI 수정 적용"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 우측 하단 마우스 드래그 크기 조절 핸들 */}
          <div
            onMouseDown={handleMouseDownResize}
            className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 text-slate-500 hover:text-amber-400 select-none"
            title="마우스로 드래그하여 창 크기를 조절하세요"
          >
            <Maximize2 className="w-3 h-3 rotate-90 opacity-70" />
          </div>
        </div>
      )}

      {/* 메인 견적서 A4 뷰어 다이얼로그 */}
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[96vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 print:max-h-none print:border-none print:shadow-none print:rounded-none">
        {/* 상단 메인 액션 툴바 (화면 표시용, 인쇄 시 숨김) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 text-white border-b border-slate-800 shrink-0 print-hide gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black flex items-center gap-1.5 whitespace-nowrap truncate">
                <span>📑 SheetBot Enterprise AX 공식 제안서 & 견적서</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 whitespace-nowrap">
                  A4 표준 규격
                </span>
                {isModified && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 text-[10px] font-bold border border-indigo-400/40 whitespace-nowrap animate-in fade-in">
                    AI 커스텀 수정됨
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400 whitespace-nowrap truncate">
                문서번호: {data.docNumber} (유효기간: {data.validUntil}까지)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 플로팅 AI 수정 팝업창 토글 버튼 */}
            <button
              type="button"
              onClick={() => setIsAiEditorOpen(!isAiEditorOpen)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap ${
                isAiEditorOpen
                  ? "bg-amber-400 text-slate-950 ring-2 ring-amber-300"
                  : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white"
              }`}
              title="마우스로 자유롭게 이동하고 크기를 조절하는 AI 자연어 수정 팝업창 열기"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAiEditorOpen ? "AI 수정창 닫기" : "✨ AI 자연어 수정"}</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700 active:scale-95 whitespace-nowrap"
              title="카카오톡/메신저 발송용 요약 텍스트 복사"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "복사완료!" : "요약 복사"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 sm:px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF 저장 / 인쇄</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer ml-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 제안서 / 견적서 본문 (스크롤 및 인쇄 대상 영역) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100/70 print:p-0 print:bg-white print:overflow-visible">
          <div
            id="proposal-print-area"
            className="max-w-[210mm] mx-auto bg-white p-8 sm:p-12 rounded-2xl shadow-md border border-slate-200/80 text-slate-900 space-y-6 print:shadow-none print:border-none print:p-0 print:rounded-none"
          >
            {/* 1. 문서 헤더 */}
            <div className="border-b-2 border-slate-900 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tracking-tight text-emerald-700">SheetBot</span>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Enterprise AX</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
                    맞춤 구축 제안서 및 견적서
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    Google Workspace & Apps Script 기반 엔터프라이즈 워크플로우 자동화
                  </p>
                </div>

                <div className="text-right text-xs space-y-1 shrink-0">
                  <div className="text-slate-500">
                    문서번호: <span className="font-bold text-slate-800">{data.docNumber}</span>
                  </div>
                  <div className="text-slate-500">
                    발행일자: <span className="font-bold text-slate-800">{data.issueDate}</span>
                  </div>
                  <div className="text-slate-500">
                    견적유효기간: <span className="font-bold text-emerald-700">{data.validUntil} (30일간)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 공급자 및 공급받는자 정보 (2단 균형 공식 테이블) */}
            <div className="grid grid-cols-2 gap-4 text-xs proposal-grid-2cols">
              {/* 공급받는자 (고객사) */}
              <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-100 px-3.5 py-2 font-black text-slate-700 border-b border-slate-300 flex items-center justify-between text-xs">
                  <span>[공급받는자]</span>
                  <span className="text-[10px] text-slate-500">고객사 정보</span>
                </div>
                <table className="w-full table-fixed divide-y divide-slate-200 border-collapse">
                  <tbody className="divide-y divide-slate-200">
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        상호 (기업명)
                      </th>
                      <td className="py-2 px-3 font-bold text-slate-900 text-xs truncate align-middle">
                        {data.client.companyName}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        사업자번호
                      </th>
                      <td className="py-2 px-3 text-slate-800 text-xs truncate align-middle font-medium">
                        {data.client.bizNumber || "-"}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        담당자 / 직함
                      </th>
                      <td className="py-2 px-3 font-bold text-slate-900 text-xs truncate align-middle">
                        {data.client.contactName}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        연락처 / 메일
                      </th>
                      <td className="py-2 px-3 text-slate-700 text-[11px] truncate align-middle font-medium">
                        {data.client.phone} / {data.client.email}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        사업장 소재지
                      </th>
                      <td
                        className="py-2 px-3 text-slate-700 text-[11px] truncate align-middle font-medium"
                        title={data.client.address || "-"}
                      >
                        {compactAddress(data.client.address)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 공급자 (SheetBot) */}
              <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-100 px-3.5 py-2 font-black text-slate-700 border-b border-slate-300 flex items-center justify-between text-xs">
                  <span>[공급자]</span>
                  <span className="text-[10px] text-slate-500">공식 솔루션 사업부</span>
                </div>
                <table className="w-full table-fixed divide-y divide-slate-200 border-collapse">
                  <tbody className="divide-y divide-slate-200">
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        상호 (법인명)
                      </th>
                      <td
                        className="py-2 px-3 font-bold text-slate-900 text-xs truncate align-middle"
                        title={data.provider.companyName}
                      >
                        {data.provider.companyName}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        사업자번호
                      </th>
                      <td className="py-2 px-3 text-slate-800 text-xs truncate align-middle font-medium">
                        {data.provider.bizNumber}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        대표자 성명
                      </th>
                      <td className="py-2 px-3 font-bold text-slate-900 text-xs align-middle">
                        <div className="flex items-center justify-between">
                          <span className="truncate">{data.provider.ceoName}</span>
                          <div className="w-7 h-7 rounded-full border border-rose-600 text-rose-600 flex items-center justify-center text-[8px] font-black leading-tight rotate-12 select-none shadow-2xs shrink-0 mr-1">
                            <span className="text-center">Sheet<br/>Bot인</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        소재지
                      </th>
                      <td
                        className="py-2 px-3 text-slate-700 text-[11px] truncate align-middle font-medium"
                        title={data.provider.address}
                      >
                        {compactAddress(data.provider.address)}
                      </td>
                    </tr>
                    <tr className="h-[38px] divide-x divide-slate-200">
                      <th className="w-24 sm:w-28 py-2 px-2.5 bg-slate-50 text-slate-600 font-bold text-center text-[11px] whitespace-nowrap align-middle">
                        대표 연락처
                      </th>
                      <td className="py-2 px-3 text-slate-700 text-[11px] truncate align-middle font-medium">
                        {data.provider.contactPhone} | {data.provider.contactEmail}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. 견적 총액 배너 (공식 한글 및 아라비아 금액 표기) */}
            <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">총 견적 금액 (부가가치세 포함)</span>
                <div className="text-lg sm:text-xl font-black tracking-tight text-emerald-400">
                  일금 {koreanTotal} 원정 (₩{data.quotation.total.toLocaleString()})
                </div>
              </div>
              <div className="text-xs text-right text-slate-300 space-y-0.5">
                <div>공급가액: ₩{data.quotation.subtotal.toLocaleString()}</div>
                <div>부가가치세 (10%): ₩{data.quotation.vat.toLocaleString()}</div>
              </div>
            </div>

            {/* 4. 프로젝트 개요 & 맞춤 구축 범위 */}
            <div className="space-y-2 text-xs">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>1. 프로젝트 목적 및 맞춤형 구축 범위 (Scope of Work)</span>
              </h2>
              <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                {data.project.objective}
              </p>

              {/* 고객 원본 요구사항 & 메모 반영 요약 카드 */}
              {data.customerRequestInfo && (
                <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-2">
                  <div className="font-black text-indigo-950 text-[11px] flex items-center justify-between">
                    <span>📋 고객 접수 요구사항 및 요청 내역 상세</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                      맞춤 제작 반영됨
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {data.customerRequestInfo.userRequirement && (
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                        <span className="text-slate-400 block text-[10px] font-bold">사용자 원본 요구사항</span>
                        <strong className="text-indigo-950 text-xs font-black block mt-0.5">
                          {data.customerRequestInfo.userRequirement}
                        </strong>
                      </div>
                    )}
                    {data.customerRequestInfo.customerNotes && (
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                        <span className="text-slate-400 block text-[10px] font-bold">고객 추가 메모</span>
                        <strong className="text-slate-800 text-xs font-semibold block mt-0.5">
                          {data.customerRequestInfo.customerNotes}
                        </strong>
                      </div>
                    )}
                    {data.customerRequestInfo.sheetSchema && (
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
                        <span className="text-slate-400 block text-[10px] font-bold">시트 분석 스키마</span>
                        <span className="text-slate-700 font-medium">{data.customerRequestInfo.sheetSchema}</span>
                      </div>
                    )}
                    {data.customerRequestInfo.sheetUrl && (
                      <div className="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs truncate">
                        <span className="text-slate-400 block text-[10px] font-bold">대상 구글 스프레드시트</span>
                        <a
                          href={data.customerRequestInfo.sheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline text-[10px] font-mono truncate block mt-0.5"
                        >
                          {data.customerRequestInfo.sheetUrl}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {data.project.targetAreas.map((area, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/60 flex items-start gap-2 text-[11px]"
                  >
                    <span className="text-emerald-700 font-bold">✓</span>
                    <span className="font-semibold text-slate-800">{area}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. 견적 세부 산출 내역서 (공식 테이블) */}
            <div className="space-y-2 text-xs print-avoid-break">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>2. 세부 견적 산출 내역</span>
              </h2>
              <div className="border border-slate-300 rounded-xl overflow-hidden print-avoid-break">
                <table className="w-full text-left divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">품명 및 구축 항목</th>
                      <th className="py-2.5 px-3">규격 / 세부 내용</th>
                      <th className="py-2.5 px-3 w-14 text-center">수량</th>
                      <th className="py-2.5 px-3 w-28 text-right">단가 (원)</th>
                      <th className="py-2.5 px-3 w-28 text-right">금액 (원)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {data.quotation.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                        <td className="py-2.5 px-3 text-slate-600 text-[10px] leading-relaxed">{item.description}</td>
                        <td className="py-2.5 px-3 text-center text-slate-700 font-medium">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 font-medium">
                          {item.unitPrice.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {item.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50/80 font-bold divide-y divide-slate-200 text-xs">
                    <tr>
                      <td colSpan={5} className="py-2 px-3 text-right text-slate-600">
                        공급가액 소계:
                      </td>
                      <td className="py-2 px-3 text-right text-slate-900 font-bold">
                        ₩{data.quotation.subtotal.toLocaleString()}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="py-2 px-3 text-right text-slate-600">
                        부가가치세 (VAT 10%):
                      </td>
                      <td className="py-2 px-3 text-right text-slate-900 font-bold">
                        ₩{data.quotation.vat.toLocaleString()}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/60 text-emerald-950">
                      <td colSpan={5} className="py-2.5 px-3 text-right font-black">
                        총 합계 금액 (VAT 포함):
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-sm text-emerald-700">
                        ₩{data.quotation.total.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 6. 🏛️ 정부지원사업(바우처) 연계 혜택 산출표 (기업 고객 대상일 때만 표시) */}
            {data.voucherDiscount && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-50/60 to-emerald-50/60 border-2 border-amber-400/80 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-amber-300">
                  <span className="font-black text-amber-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>🏛️ 정부지원사업(바우처) 매칭 연계 시 기업 실부담금 혜택 안내</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-black text-[10px]">
                    최대 {data.voucherDiscount.supportRatio}% 국비 지원 대상
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  본 기업은 <strong>{data.voucherDiscount.voucherName}</strong> 적격 대상 기업으로, 정부지원사업 연계 승인 시 다음과 같이 도입 비용이 획기적으로 절감됩니다.
                </p>

                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 block">총 공급가액</span>
                    <strong className="text-xs text-slate-800 font-bold">
                      ₩{data.quotation.subtotal.toLocaleString()}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
                    <span className="text-[10px] text-emerald-800 font-bold block">
                      정부 지원금 ({data.voucherDiscount.supportRatio}%)
                    </span>
                    <strong className="text-xs text-emerald-700 font-black">
                      - ₩{data.voucherDiscount.governmentSupportAmount.toLocaleString()}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 shadow-2xs">
                    <span className="text-[10px] text-amber-900 font-black block">기업 최종 실부담금</span>
                    <strong className="text-sm text-rose-700 font-black">
                      ₩{data.voucherDiscount.clientSelfPayAmount.toLocaleString()}
                    </strong>
                    <span className="text-[9px] text-amber-800 block">(VAT 별도)</span>
                  </div>
                </div>
              </div>
            )}

            {/* 7. 추진 일정 로드맵 (Timeline) */}
            <div className="space-y-2 text-xs">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>3. 맞춤형 구축 추진 일정 (표준 4주 로드맵)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                {data.project.timeline.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-black text-emerald-800 flex items-center justify-between">
                      <span>{item.stage}</span>
                      <span className="text-[10px] text-slate-500 font-normal">{item.period}</span>
                    </div>
                    <p className="text-slate-600 text-[10px] leading-relaxed">{item.details}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 8. 특약 사항 및 보증 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>특약 및 품질 보증 조건</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[10px]">
                <li>본 견적은 착수 시점의 세부 요구사항 확정에 따라 일부 조정될 수 있습니다.</li>
                <li>오픈일로부터 <strong>12개월간 무상 하자보수 및 기술지원</strong>이 제공됩니다.</li>
                <li>Google Workspace 클라우드 보안 규정 및 사내 데이터 무결성을 100% 준수합니다.</li>
              </ul>
            </div>

            {/* 직인 푸터 */}
            <div className="pt-6 border-t-2 border-slate-900 text-center space-y-2">
              <p className="text-xs text-slate-700 font-bold">
                위와 같이 SheetBot Enterprise AX 솔루션 맞춤 구축을 제안하며 견적서를 제출합니다.
              </p>
              <div className="text-sm font-black text-slate-900 flex items-center justify-center gap-2">
                <span>{data.issueDate}</span>
                <span className="mx-2">|</span>
                <span>{data.provider.companyName}</span>
                <span className="text-xs font-semibold text-slate-600">대표이사 {data.provider.ceoName}</span>
                <div className="w-7 h-7 rounded-full border border-rose-600 text-rose-600 flex items-center justify-center text-[8px] font-bold rotate-12 inline-flex ml-1">
                  인
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 닫기 바 (인쇄 시 숨김) */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print-hide">
          <span>💡 [PDF 저장 / 인쇄] 버튼을 누른 후 대상 프린터를 'PDF로 저장'으로 선택하시면 즉시 파일로 보관됩니다.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
