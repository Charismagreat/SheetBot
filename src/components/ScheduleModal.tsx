"use client";

import React, { useState, useEffect } from "react";
import { X, Clock, Zap, Check, RefreshCw, AlertCircle } from "lucide-react";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: any[];
  scheduleToEdit?: any | null;
}

export default function ScheduleModal({
  isOpen,
  onClose,
  onSuccess,
  projects,
  scheduleToEdit,
}: ScheduleModalProps) {
  const [projectId, setProjectId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [functionName, setFunctionName] = useState<string>("runSheetBotAutomatedTask");
  const [triggerType, setTriggerType] = useState<"TIME_DRIVEN" | "EVENT_DRIVEN">("TIME_DRIVEN");
  const [timeFrequency, setTimeFrequency] = useState<"MINUTES" | "HOURS" | "DAILY" | "WEEKLY">("DAILY");
  const [intervalValue, setIntervalValue] = useState<number>(1);
  const [atHour, setAtHour] = useState<number>(9);
  const [weekDay, setWeekDay] = useState<string>("MONDAY");
  const [eventType, setEventType] = useState<"ON_OPEN" | "ON_EDIT" | "ON_CHANGE" | "ON_FORM_SUBMIT">("ON_EDIT");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (scheduleToEdit) {
      setProjectId(scheduleToEdit.projectId || projects[0]?.id || "");
      setName(scheduleToEdit.name || "");
      setDescription(scheduleToEdit.description || "");
      setFunctionName(scheduleToEdit.functionName || "runSheetBotAutomatedTask");
      setTriggerType(scheduleToEdit.triggerType || "TIME_DRIVEN");
      setTimeFrequency(scheduleToEdit.timeFrequency || "DAILY");
      setIntervalValue(scheduleToEdit.intervalValue || 1);
      setAtHour(scheduleToEdit.atHour ?? 9);
      setWeekDay(scheduleToEdit.weekDay || "MONDAY");
      setEventType(scheduleToEdit.eventType || "ON_EDIT");
    } else {
      const defaultProj = projects[0];
      setProjectId(defaultProj?.id || "");
      setName("일일 대장 자동 마감 및 집계");
      setDescription("매일 오전 9시에 데이터를 자동 집계하고 요약 시트로 백업합니다.");
      setFunctionName("runSheetBotAutomatedTask");
      setTriggerType("TIME_DRIVEN");
      setTimeFrequency("DAILY");
      setIntervalValue(1);
      setAtHour(9);
      setWeekDay("MONDAY");
      setEventType("ON_EDIT");
    }
    setError(null);
  }, [isOpen, scheduleToEdit, projects]);

  if (!isOpen) return null;

  const selectedProject = projects.find((p) => p.id === projectId) || projects[0];

  const handleApplyTemplate = (type: "daily_9am" | "on_edit" | "hourly") => {
    if (type === "daily_9am") {
      setName("일일 대장 자동 마감 및 집계");
      setDescription("매일 오전 09시에 당일 데이터를 마감 시트로 집계 백업합니다.");
      setFunctionName("runSheetBotAutomatedTask");
      setTriggerType("TIME_DRIVEN");
      setTimeFrequency("DAILY");
      setAtHour(9);
    } else if (type === "on_edit") {
      setName("시트 수정 시 실시간 웹훅 동기화");
      setDescription("구글 시트 셀 내용이 수정되면 실시간으로 변경 내역을 동기화합니다.");
      setFunctionName("onEdit");
      setTriggerType("EVENT_DRIVEN");
      setEventType("ON_EDIT");
    } else if (type === "hourly") {
      setName("매 1시간 주기 정기 동기화");
      setDescription("1시간마다 최신 내역을 동기화하여 시트를 갱신합니다.");
      setFunctionName("runSheetBotAutomatedTask");
      setTriggerType("TIME_DRIVEN");
      setTimeFrequency("HOURS");
      setIntervalValue(1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("스케줄 명칭을 입력해 주세요.");
      return;
    }
    if (!functionName.trim()) {
      setError("실행할 함수명을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        id: scheduleToEdit?.id,
        projectId: projectId || selectedProject?.id || "proj_default",
        projectName: selectedProject?.name || "기본 프로젝트",
        spreadsheetId: selectedProject?.spreadsheetId || "",
        spreadsheetUrl: selectedProject?.spreadsheetUrl || "",
        name: name.trim(),
        description: description.trim(),
        functionName: functionName.trim(),
        triggerType,
        timeFrequency,
        intervalValue,
        atHour,
        weekDay,
        eventType,
        status: scheduleToEdit?.status || "ACTIVE",
      };

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || "스케줄 저장에 실패했습니다.");
      }
    } catch (err: any) {
      setError(err.message || "통신 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-800">
                {scheduleToEdit ? "자동화 스케줄 설정 수정" : "새 자동화 스케줄(트리거) 등록"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                정해진 시간이나 시트 이벤트에 맞춰 Apps Script를 자동 실행합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!scheduleToEdit && (
          <div className="space-y-1.5" data-easybot-hint="스케줄 템플릿: 자주 사용되는 실행 주기(매일 9시, onEdit, 1시간 주기)를 즉시 적용합니다.">
            <span className="text-[11px] font-bold text-slate-400 block">⚡ 추천 스케줄 템플릿:</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyTemplate("daily_9am")}
                className="p-2 text-left bg-slate-50 hover:bg-amber-50/70 border border-slate-200/80 hover:border-amber-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
              >
                <span className="text-amber-600">🕒 매일 09:00</span>
                <span className="text-[10px] text-slate-500 truncate">일일 마감 집계</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyTemplate("on_edit")}
                className="p-2 text-left bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
              >
                <span className="text-indigo-600">⚡ 시트 수정 시</span>
                <span className="text-[10px] text-slate-500 truncate">onEdit 실시간</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyTemplate("hourly")}
                className="p-2 text-left bg-slate-50 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-slate-700 transition-all cursor-pointer flex flex-col gap-0.5"
              >
                <span className="text-emerald-600">⏱️ 매 1시간마다</span>
                <span className="text-[10px] text-slate-500 truncate">정기 동기화</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 대상 프로젝트 선택 */}
          <div className="space-y-1" data-easybot-hint="프로젝트 선택: 스케줄을 실행할 대상 Google Apps Script 프로젝트를 지정합니다.">
            <label className="font-bold text-slate-700 block">대상 프로젝트</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>

          {/* 명칭 및 함수 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1" data-easybot-hint="스케줄 이름: 대시보드에서 식별할 수 있는 스케줄 목적을 입력합니다.">
              <label className="font-bold text-slate-700 block">스케줄 명칭 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 매일 오전 9시 대장 자동 마감"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
              />
            </div>
            <div className="space-y-1" data-easybot-hint="실행 함수명: 구글 시트의 Code.gs 파일에 선언되어 있는 실행 대상 함수명(예: runSheetBotAutomatedTask)을 입력합니다.">
              <label className="font-bold text-slate-700 block">실행할 Apps Script 함수명 *</label>
              <input
                type="text"
                value={functionName}
                onChange={(e) => setFunctionName(e.target.value)}
                placeholder="예: runSheetBotAutomatedTask"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* 트리거 유형 선택 */}
          <div className="space-y-2 pt-1" data-easybot-hint="트리거 유형: 시간 경과(정기 스케줄) 또는 시트 사용자 조작(onEdit/onOpen 이벤트) 중 실행 방식을 선택합니다.">
            <label className="font-bold text-slate-700 block">트리거 유형</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTriggerType("TIME_DRIVEN")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  triggerType === "TIME_DRIVEN"
                    ? "bg-amber-50/70 border-amber-400 text-amber-900 shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className={`p-2 rounded-xl ${triggerType === "TIME_DRIVEN" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">시간 기반 스케줄</div>
                  <div className="text-[10px] text-slate-400">정해진 시간에 자동 실행</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTriggerType("EVENT_DRIVEN")}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  triggerType === "EVENT_DRIVEN"
                    ? "bg-indigo-50/70 border-indigo-400 text-indigo-900 shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className={`p-2 rounded-xl ${triggerType === "EVENT_DRIVEN" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">시트 이벤트 트리거</div>
                  <div className="text-[10px] text-slate-400">셀 수정 발생 시 실행</div>
                </div>
              </button>
            </div>
          </div>

          {/* 주기 세부 설정 */}
          {triggerType === "TIME_DRIVEN" ? (
            <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-200/70 space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-amber-950 block">실행 주기 단위</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "MINUTES", label: "분 단위" },
                    { id: "HOURS", label: "시간 단위" },
                    { id: "DAILY", label: "매일 (일간)" },
                    { id: "WEEKLY", label: "매주 (주간)" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setTimeFrequency(f.id as any)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        timeFrequency === f.id
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-white text-slate-600 border border-amber-200/80 hover:bg-amber-100/60"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {timeFrequency === "DAILY" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">매일</span>
                  <select
                    value={atHour}
                    onChange={(e) => setAtHour(Number(e.target.value))}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>
                        {h.toString().padStart(2, "0")}:00 ({h < 12 ? "오전" : "오후"} {h % 12 === 0 ? 12 : h % 12}시)
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-500">에 정기 실행</span>
                </div>
              )}

              {timeFrequency === "HOURS" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">매</span>
                  <select
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(Number(e.target.value))}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value={1}>1시간마다</option>
                    <option value={2}>2시간마다</option>
                    <option value={4}>4시간마다</option>
                    <option value={6}>6시간마다</option>
                    <option value={12}>12시간마다</option>
                  </select>
                  <span className="text-xs text-slate-500">자동 실행</span>
                </div>
              )}

              {timeFrequency === "MINUTES" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">매</span>
                  <select
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(Number(e.target.value))}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value={1}>1분마다</option>
                    <option value={5}>5분마다</option>
                    <option value={10}>10분마다</option>
                    <option value={15}>15분마다</option>
                    <option value={30}>30분마다</option>
                  </select>
                  <span className="text-xs text-slate-500">자동 실행</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-200/70 space-y-2">
              <label className="font-bold text-indigo-950 block">이벤트 발생 조건</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "ON_EDIT", label: "✏️ 셀 내용 수정 시 (onEdit)" },
                  { id: "ON_OPEN", label: "📂 시트 열릴 때 (onOpen)" },
                ].map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setEventType(ev.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer font-bold text-xs ${
                      eventType === ev.id
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-700 border-indigo-100 hover:bg-indigo-100/50"
                    }`}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 설명 */}
          <div className="space-y-1">
            <label className="font-bold text-slate-700 block">설명 및 비고 (선택)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="스케줄 동작 목적을 입력하세요."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              data-easybot-hint="스케줄 저장: 설정한 스케줄 및 트리거를 My DB에 영구 등록합니다."
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>저장 중...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{scheduleToEdit ? "수정 완료" : "스케줄 등록"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
