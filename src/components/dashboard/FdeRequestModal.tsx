import React, { useState, useEffect } from "react";
import { X, Briefcase, CheckCircle2, FileSpreadsheet, Smartphone, Sparkles, RefreshCw, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface FdeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSheetUrl?: string;
  initialRequirement?: string;
  userEmail?: string | null;
  userName?: string | null;
}

export default function FdeRequestModal({
  isOpen,
  onClose,
  initialSheetUrl = "",
  initialRequirement = "",
  userEmail,
  userName,
}: FdeRequestModalProps) {
  const [fdeForm, setFdeForm] = useState({
    sheetUrl: initialSheetUrl,
    requirement: initialRequirement,
    urgency: "NORMAL",
    contactPhone: "",
  });
  const [fdeSubmitting, setFdeSubmitting] = useState(false);
  const [fdeSubmitted, setFdeSubmitted] = useState(false);

  useEffect(() => {
    if (initialSheetUrl || initialRequirement) {
      setFdeForm((prev) => ({
        ...prev,
        sheetUrl: initialSheetUrl || prev.sheetUrl,
        requirement: initialRequirement || prev.requirement,
      }));
    }
  }, [initialSheetUrl, initialRequirement]);

  if (!isOpen) return null;

  const handleFdeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fdeForm.requirement.trim()) {
      alert("요구사항이나 희망하시는 자동화 내용을 입력해 주세요.");
      return;
    }

    try {
      setFdeSubmitting(true);
      const res = await apiFetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "FDE_REQUEST",
          title: `[FDE 맞춤 구축 의뢰] ${userName || "고객"}님의 자동화 프로젝트`,
          content: `
[의뢰자 정보]
- 이름: ${userName || "미지정"}
- 이메일: ${userEmail || "미지정"}
- 연락처: ${fdeForm.contactPhone || "미기재"}

[시트 정보]
- 구글 시트 URL: ${fdeForm.sheetUrl || "미제공 (별도 전달 예정)"}

[요구사항]
${fdeForm.requirement}

[희망 완료 일정]
${fdeForm.urgency === "URGENT" ? "급함 (24시간 이내)" : fdeForm.urgency === "RELAXED" ? "여유있음 (1주일 이상)" : "보통 (3~5일 이내)"}
          `.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFdeSubmitted(true);
        setTimeout(() => {
          onClose();
          setFdeSubmitted(false);
          setFdeForm({
            sheetUrl: "",
            requirement: "",
            urgency: "NORMAL",
            contactPhone: "",
          });
        }, 2200);
      } else {
        alert(data.error || "의뢰 접수 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      alert("서버 통신 오류가 발생했습니다: " + err.message);
    } finally {
      setFdeSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 모달 상단 헤더 배너 */}
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white relative">
          <button
            onClick={() => {
              if (!fdeSubmitting) onClose();
            }}
            className="absolute top-5 right-5 p-1.5 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-indigo-200 text-[11px] font-bold mb-2.5">
            <Briefcase className="w-3.5 h-3.5 text-indigo-300" />
            <span>Forward Deployed Engineer 1:1 맞춤 서비스</span>
          </div>

          <h3 className="text-xl font-black tracking-tight">
            전문가(FDE) 맞춤 구축 의뢰
          </h3>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            복잡한 구글 시트 수식, ERP/외부 시스템 연동, 고난도 Apps Script 자동화를 SheetBot 전문 엔지니어가 직접 100% 작동하도록 완벽히 구축해 드립니다.
          </p>
        </div>

        {/* 완료 상태 화면 */}
        {fdeSubmitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-black text-lg text-slate-800">
                FDE 맞춤 의뢰가 성공적으로 접수되었습니다!
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                담당 전담 엔지니어가 접수된 시트와 요구사항을 신속히 검토한 뒤, <strong>24시간 이내</strong>에 등록해 주신 연락처로 상담 안내를 드리겠습니다.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                안심 안내 문자가 발송되었습니다
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFdeSubmit} className="p-6 space-y-4">
            {/* 1. 구글 스프레드시트 URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>대상 구글 시트 URL (선택)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">시트가 없어도 접수 가능</span>
              </label>
              <input
                type="url"
                value={fdeForm.sheetUrl}
                onChange={(e) => setFdeForm({ ...fdeForm, sheetUrl: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            {/* 2. 업무 자동화 요구사항 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>원하시는 자동화 기능 및 해결하고 싶은 문제 <strong className="text-rose-500">*</strong></span>
                <span className="text-[10px] text-indigo-600 font-semibold">자세할수록 빠릅니다</span>
              </label>
              <textarea
                required
                rows={4}
                value={fdeForm.requirement}
                onChange={(e) => setFdeForm({ ...fdeForm, requirement: e.target.value })}
                placeholder="예시) 매일 오전 9시 재고가 부족한 품목을 찾아 담당자에게 문자를 보내고 싶습니다. 또한 세금계산서 PDF를 올리면 자동으로 시트에 입력되는 OCR 기능이 필요합니다."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400 resize-none leading-relaxed"
              />
            </div>

            {/* 3. 희망 완료 일정 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">희망 완료 일정</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "URGENT", label: "급함 (24시간 내)" },
                  { id: "NORMAL", label: "보통 (3~5일)" },
                  { id: "RELAXED", label: "여유 (1주일 이상)" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFdeForm({ ...fdeForm, urgency: opt.id })}
                    className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                      fdeForm.urgency === opt.id
                        ? "bg-indigo-50 text-indigo-900 border-indigo-400 shadow-2xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 연락처 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span>연락처 (휴대폰 번호)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">진행 현황 무료 안내용</span>
              </label>
              <input
                type="tel"
                value={fdeForm.contactPhone}
                onChange={(e) => setFdeForm({ ...fdeForm, contactPhone: e.target.value })}
                placeholder="010-XXXX-XXXX"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            {/* 혜택 안내 */}
            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>FDE 의뢰 특별 혜택</span>
              </div>
              <ul className="text-indigo-800/80 list-disc list-inside space-y-0.5 pl-0.5">
                <li>시트 구조 및 프로세스 무료 사전 진단</li>
                <li>100% 정상 작동 보증 및 30일 무상 사후 유지보수</li>
              </ul>
            </div>

            {/* 하단 버튼 */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                disabled={fdeSubmitting}
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={fdeSubmitting}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {fdeSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>접수 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>전문가(FDE)에게 의뢰하기</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
