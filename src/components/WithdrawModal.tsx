"use client";

import React, { useState } from "react";
import { AlertTriangle, X, ShieldAlert, Trash2, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { signOut } from "next-auth/react";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export default function WithdrawModal({ isOpen, onClose, userEmail }: WithdrawModalProps) {
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  if (!isOpen) return null;

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      alert("계정 삭제 안내 및 데이터 영구 파기 사항 확인에 동의해 주세요.");
      return;
    }

    if (
      !window.confirm(
        "정말로 SheetBot 계정을 영구 삭제하시겠습니까?\n모든 API 키, 브릿지 주소, 자동화 스케줄이 T=0초에 즉각 영구 삭제 및 차단됩니다."
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch("/api/user/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "사용자 직접 계정 삭제" }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setComplete(true);
        setTimeout(async () => {
          try {
            await signOut({ redirect: false }).catch(() => {});
          } catch {}
          window.location.href = "/";
        }, 2500);
      } else {
        alert(data.error || "계정 삭제 처리 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      alert("계정 삭제 요청 통신 오류: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-rose-100 max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between border-b border-rose-100 bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">계정 삭제 (영구 파기)</h3>
              <p className="text-xs text-rose-600 font-semibold mt-0.5">모든 연동 데이터 및 스케줄 영구 파기</p>
            </div>
          </div>
          {!complete && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {complete ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black text-slate-800">계정이 안전하게 삭제되었습니다</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                모든 개인 API 키와 구글 시트 연동 주소가 즉각 영구 삭제되었습니다.<br />
                그동안 SheetBot을 이용해 주셔서 진심으로 감사드립니다.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} className="p-6 space-y-5">
            {/* 주의 안내 경고문 */}
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-2 text-xs text-rose-900">
              <div className="font-extrabold flex items-center gap-1.5 text-rose-800 text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>계정 삭제 시 즉각 적용되는 정책</span>
              </div>
              <ul className="space-y-1.5 text-[11px] text-rose-700 pl-5 list-disc leading-relaxed">
                <li>
                  발급받은 모든 <strong>개인 에이전트 API 키(`sk_sheetbot_...`)</strong>가 <strong>T=0초에 즉시 영구 폐기(`REVOKED`)</strong>됩니다.
                </li>
                <li>
                  안티그라비티/Cursor 등 외부 AI 및 구글 시트에 연결된 <strong>모든 브릿지 주소와 스케줄이 100% 즉시 차단(HTTP 410)</strong>됩니다.
                </li>
                <li>
                  추후 동일한 구글 계정으로 재접속하더라도 <strong>과거의 기존 API 키는 보안상 재활성화되지 않으며</strong>, 새 키를 발급받아야 합니다.
                </li>
              </ul>
            </div>

            {/* 계정 정보 확인 */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-700">삭제 대상 계정</label>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-mono text-slate-800 text-xs">
                {userEmail}
              </div>
            </div>

            {/* 계정 삭제 사유 입력 */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-700">삭제 사유 (선택)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="서비스 이용 중 불편하셨던 점이나 계정 삭제 사유를 남겨주시면 품질 개선에 적극 반영하겠습니다."
                className="w-full h-20 p-3 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-hidden resize-none"
              />
            </div>

            {/* 동의 체크박스 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-[11px] font-bold text-slate-700 leading-snug">
                위 내용을 모두 확인하였으며, 모든 연동 데이터 및 API 키가 영구 삭제되는 것에 동의합니다.
              </span>
            </label>

            {/* 액션 버튼 */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!agreed || submitting}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                  agreed && !submitting
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{submitting ? "계정 삭제 처리 중..." : "계정 영구 삭제"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
