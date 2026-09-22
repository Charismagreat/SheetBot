import React, { useState, useEffect } from "react";
import { X, Sparkles, CheckCircle2, RefreshCw, Send, ArrowRight, Briefcase } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface FdeRecruitModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialApply?: boolean;
  userEmail?: string | null;
  userName?: string | null;
}

export default function FdeRecruitModal({
  isOpen,
  onClose,
  initialApply = false,
  userEmail,
  userName,
}: FdeRecruitModalProps) {
  const [isApplyingFde, setIsApplyingFde] = useState(initialApply);
  const [recruitForm, setRecruitForm] = useState({
    name: userName || "",
    email: userEmail || "",
    phone: "",
    experience: "INTERMEDIATE",
    portfolioUrl: "",
    introduction: "",
  });
  const [recruitSubmitting, setRecruitSubmitting] = useState(false);
  const [recruitSubmitted, setRecruitSubmitted] = useState(false);

  useEffect(() => {
    setIsApplyingFde(initialApply);
  }, [initialApply]);

  useEffect(() => {
    setRecruitForm((prev) => ({
      ...prev,
      name: prev.name || userName || "",
      email: prev.email || userEmail || "",
    }));
  }, [userName, userEmail]);

  if (!isOpen) return null;

  const handleDismissToday = () => {
    if (typeof window !== "undefined") {
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem("sheetbot_fde_recruit_hide_until", String(tomorrow));
    }
    onClose();
    setIsApplyingFde(false);
  };

  const handleRecruitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recruitForm.introduction.trim()) {
      alert("자기소개 및 보유 기술이나 경험을 입력해 주세요.");
      return;
    }

    try {
      setRecruitSubmitting(true);
      const res = await apiFetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "FDE_APPLICATION",
          title: `[FDE 1기 파트너 지원] ${recruitForm.name || userName || "지원자"}님의 지원서`,
          content: `
[지원자 정보]
- 성명: ${recruitForm.name || userName || "미지정"}
- 이메일: ${recruitForm.email || userEmail || "미지정"}
- 연락처: ${recruitForm.phone || "미기재"}

[스프레드시트/코딩 숙련도]
${recruitForm.experience === "EXPERT" ? "전문가 (Apps Script, Python, API 연동 능숙)" : recruitForm.experience === "INTERMEDIATE" ? "중급 (수식 및 기본 스크립트 작성 가능)" : "초급 (시트 기본 및 AI 활용 가능)"}

[포트폴리오/GitHub/블로그]
${recruitForm.portfolioUrl || "미제공"}

[자기소개 및 포부]
${recruitForm.introduction}
          `.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRecruitSubmitted(true);
        setTimeout(() => {
          onClose();
          setIsApplyingFde(false);
          setRecruitSubmitted(false);
          handleDismissToday();
        }, 2200);
      } else {
        alert(data.error || "지원서 접수 중 오류가 발생했습니다.");
      }
    } catch (err: any) {
      alert("서버 통신 오류: " + err.message);
    } finally {
      setRecruitSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 모달 상단 배너 */}
        <div className="bg-gradient-to-r from-purple-950 via-indigo-900 to-slate-900 p-6 sm:p-7 text-white relative">
          <button
            onClick={() => {
              if (!recruitSubmitting) onClose();
            }}
            className="absolute top-5 right-5 p-1.5 text-slate-300 hover:text-white rounded-xl hover:bg-white/10 transition-all cursor-pointer"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-black tracking-wide border border-purple-400/30 mb-2.5 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>공식 1기 파트너 파트너스 모집</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-snug">
            SheetBot 공인 FDE 파트너 모집
          </h3>
          <p className="text-xs sm:text-sm text-purple-200/90 mt-1 font-medium">
            Google Apps Script와 스프레드시트로 퇴근 후 <strong>월 100~300만원</strong>의 확실한 부수입을 창출하세요.
          </p>
        </div>

        {/* 완료 상태 */}
        {recruitSubmitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-black text-xl text-slate-900">
                FDE 1기 파트너 지원이 완료되었습니다!
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                제출해 주신 지원서를 면밀히 검토한 뒤, <strong>48시간 이내</strong>에 등록해 주신 연락처로 파트너십 안내 및 의뢰 매칭 절차를 안내해 드리겠습니다.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs text-purple-800 font-bold bg-purple-50 px-3.5 py-1.5 rounded-xl border border-purple-200">
                🎉 SheetBot의 혁신 생태계에 합류하신 것을 환영합니다!
              </span>
            </div>
          </div>
        ) : isApplyingFde ? (
          /* 지원서 작성 폼 뷰 */
          <form onSubmit={handleRecruitSubmit} className="p-6 sm:p-7 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-slate-800 text-sm">FDE 1기 간편 지원서 작성</h4>
                <p className="text-[11px] text-slate-400">간단한 정보만 입력하시면 운영팀에서 신속히 검토합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyingFde(false)}
                className="text-xs text-purple-700 font-bold hover:underline"
              >
                ← 혜택 다시보기
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  성명 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recruitForm.name}
                  onChange={(e) => setRecruitForm({ ...recruitForm, name: e.target.value })}
                  placeholder="홍길동"
                  className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-purple-500 rounded-xl outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  연락처 (휴대폰) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={recruitForm.phone}
                  onChange={(e) => setRecruitForm({ ...recruitForm, phone: e.target.value })}
                  placeholder="010-XXXX-XXXX"
                  className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-purple-500 rounded-xl outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                이메일 주소 <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={recruitForm.email}
                onChange={(e) => setRecruitForm({ ...recruitForm, email: e.target.value })}
                placeholder="partner@example.com"
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-purple-500 rounded-xl outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">스프레드시트 및 코딩 숙련도</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "EXPERT", label: "전문가", sub: "GAS/API 연동" },
                  { id: "INTERMEDIATE", label: "중급", sub: "수식·스크립트 작성" },
                  { id: "BEGINNER", label: "초급", sub: "시트기본·AI활용" },
                ].map((lv) => (
                  <button
                    key={lv.id}
                    type="button"
                    onClick={() => setRecruitForm({ ...recruitForm, experience: lv.id })}
                    className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                      recruitForm.experience === lv.id
                        ? "bg-purple-50 border-purple-400 text-purple-900 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="font-extrabold text-xs">{lv.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{lv.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>포트폴리오 / GitHub / 블로그 링크 (선택)</span>
                <span className="text-[10px] text-slate-400 font-normal">작업물 링크</span>
              </label>
              <input
                type="url"
                value={recruitForm.portfolioUrl}
                onChange={(e) => setRecruitForm({ ...recruitForm, portfolioUrl: e.target.value })}
                placeholder="https://github.com/... 또는 블로그 주소"
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-purple-500 rounded-xl outline-none transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                자기소개 및 다룰 수 있는 기술 <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={recruitForm.introduction}
                onChange={(e) => setRecruitForm({ ...recruitForm, introduction: e.target.value })}
                placeholder="예시) 현직 개발자이며 구글 시트 Apps Script로 사내 업무 자동화를 다수 구축해 보았습니다. 주말이나 평일 저녁에 월 2~3건의 외주를 진행하고 싶습니다."
                className="w-full px-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-200 focus:border-purple-500 rounded-xl outline-none transition-all resize-none leading-relaxed"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                disabled={recruitSubmitting}
                onClick={() => setIsApplyingFde(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                이전
              </button>
              <button
                type="submit"
                disabled={recruitSubmitting}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-purple-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {recruitSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>제출 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>FDE 1기 파트너 지원 완료</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* FDE 모집 홍보 뷰 */
          <div className="p-6 sm:p-7 space-y-5">
            {/* FDE 개념 소개 */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-1.5 text-xs">
              <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-purple-600" />
                <span>FDE (Forward Deployed Engineer)란?</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                팔란티어(Palantir)에서 유래한 최정예 현장 엔지니어 개념입니다. 복잡한 업무로 고민하는 기업/소상공인 고객에게 직접 투입되어, <strong>SheetBot의 AI 인프라와 Apps Script를 활용해 100% 작동하는 맞춤 자동화 시스템을 완성</strong>해 주는 해결사입니다.
              </p>
            </div>

            {/* 4대 핵심 혜택 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-purple-950">
                  <span className="text-base">💰</span>
                  <span>건당 10~50만원 고수익 매칭</span>
                </div>
                <p className="text-[11px] text-purple-900/70 leading-relaxed">
                  시트봇으로 유입되는 실전 유료 외주를 연결해 드리며, 업계 최고 수준인 <strong>수수료 70~80%</strong>를 정산해 드립니다.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-950">
                  <span className="text-base">🤖</span>
                  <span>시트봇 Pro 인프라 무상 지원</span>
                </div>
                <p className="text-[11px] text-indigo-900/70 leading-relaxed">
                  코드 자동 생성기, Gemini 2.5/3.8 모델, 브릿지 API 및 0원 문자 게이트웨이를 프로젝트 개발 시 무상 지원합니다.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950">
                  <span className="text-base">⏰</span>
                  <span>100% 비대면 재택 자율 부업</span>
                </div>
                <p className="text-[11px] text-emerald-900/70 leading-relaxed">
                  출퇴근 없이 본업과 자유롭게 병행 가능하며, 내 스케줄에 맞춰 원하는 의뢰만 선택하여 수주할 수 있습니다.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
                  <span className="text-base">🎖️</span>
                  <span>공인 FDE 공식 인증 뱃지</span>
                </div>
                <p className="text-[11px] text-amber-900/70 leading-relaxed">
                  SheetBot 1기 공인 파트너 인증 뱃지와 공식 프로필을 부여하여 프리랜서로서의 전문성과 신뢰도를 극대화합니다.
                </p>
              </div>
            </div>

            {/* 하단 액션 버튼 그룹 */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleDismissToday}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline cursor-pointer order-2 sm:order-1"
              >
                오늘 하루 이 창 보지 않기
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={() => setIsApplyingFde(true)}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-teal-600 hover:opacity-95 text-white text-xs font-extrabold rounded-xl transition-all shadow-md shadow-purple-500/25 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>FDE 1기 파트너 간편 지원하기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
