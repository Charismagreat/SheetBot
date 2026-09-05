"use client";

import { apiFetch } from '@/lib/api';
import React, { useState } from "react";
import { Clock, Zap, Play, RefreshCw, ToggleLeft, ToggleRight, Wrench, Trash2, Plus, ExternalLink, Activity } from "lucide-react";
import ScheduleModal from "./ScheduleModal";

interface ScheduleManagerProps {
  schedules: any[];
  projects: any[];
  onRefresh: () => void;
  onShowAlert: (msg: { type: "success" | "error"; text: string }) => void;
}

export default function ScheduleManager({
  schedules,
  projects,
  onRefresh,
  onShowAlert,
}: ScheduleManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string>("all");

  const handleToggle = async (schedule: any) => {
    const next = schedule.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await apiFetch("/api/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: schedule.id, status: next }),
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert({ type: "success", text: `[${schedule.name}] 스케줄이 ${next === "ACTIVE" ? "활성화" : "일시정지"}되었습니다.` });
        onRefresh();
      } else {
        onShowAlert({ type: "error", text: data.error || "상태 변경에 실패했습니다." });
      }
    } catch (err: any) {
      onShowAlert({ type: "error", text: err.message || "오류가 발생했습니다." });
    }
  };

  const handleRunNow = async (schedule: any) => {
    setRunningId(schedule.id);
    try {
      const res = await apiFetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_now", scheduleId: schedule.id }),
      });
      const data = await res.json();
      if (data.success) {
        onShowAlert({ type: "success", text: `[${schedule.name}] ${data.message || "스케줄 함수가 실행되었습니다."}` });
        onRefresh();
      } else {
        onShowAlert({ type: "error", text: data.error || "실행 요청 실패" });
      }
    } catch (err: any) {
      onShowAlert({ type: "error", text: err.message || "실행 중 통신 오류" });
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (schedule: any) => {
    if (!window.confirm(`'${schedule.name}' 스케줄을 삭제하시겠습니까?`)) return;

    try {
      const res = await apiFetch(`/api/schedules?id=${schedule.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onShowAlert({ type: "success", text: "스케줄이 성공적으로 삭제되었습니다." });
        onRefresh();
      } else {
        onShowAlert({ type: "error", text: data.error || "삭제 실패" });
      }
    } catch (err: any) {
      onShowAlert({ type: "error", text: err.message || "통신 오류" });
    }
  };

  const filtered = schedules.filter((s) => {
    if (filterProjectId !== "all" && s.projectId !== filterProjectId) return false;
    return true;
  });

  return (
    <div
      className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-left"
      data-easybot-hint="스케줄 관리자: 분/시/일/주 단위 시간 기반 정기 실행 및 onEdit 이벤트 트리거의 등록, 제어, 즉시 테스트를 총괄 관리합니다."
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
              <span>자동화 스케줄 & 트리거 관리</span>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-md">
                {schedules.length}개 등록됨
              </span>
            </h4>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none"
              data-easybot-hint="프로젝트 필터: 특정 스프레드시트 프로젝트에 속한 스케줄만 선별하여 조회합니다."
            >
              <option value="all">전체 프로젝트 ({schedules.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => {
              setEditingSchedule(null);
              setIsModalOpen(true);
            }}
            disabled={projects.length === 0}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40"
            data-easybot-hint="새 스케줄 등록: 선택한 프로젝트의 Apps Script 함수를 특정 시간 또는 셀 수정 시 자동 실행하도록 예약합니다."
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 스케줄 등록</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-3 bg-slate-50/50">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h5 className="font-bold text-slate-800 text-sm">등록된 자동화 스케줄이 없습니다.</h5>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              프로젝트를 선택하고 정기 실행 시간(매일/매시간 등) 또는 셀 수정 시 자동 실행 트리거를 등록해 보세요.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((s) => {
            const isRunning = runningId === s.id;
            const isTime = s.triggerType === "TIME_DRIVEN";

            let freqLabel = "";
            if (isTime) {
              if (s.timeFrequency === "MINUTES") freqLabel = `매 ${s.intervalValue || 1}분마다`;
              else if (s.timeFrequency === "HOURS") freqLabel = `매 ${s.intervalValue || 1}시간마다`;
              else if (s.timeFrequency === "DAILY") freqLabel = `매일 ${s.atHour?.toString().padStart(2, "0") || "09"}:00`;
              else if (s.timeFrequency === "WEEKLY") freqLabel = `매주 ${s.weekDay} ${s.atHour?.toString().padStart(2, "0") || "09"}:00`;
              else freqLabel = "시간 기반";
            } else {
              freqLabel = s.eventType === "ON_EDIT" ? "시트 셀 수정 시 (onEdit)" : "시트 열릴 때 (onOpen)";
            }

            return (
              <div
                key={s.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  s.status === "ACTIVE"
                    ? "bg-white border-amber-200/80 shadow-xs hover:border-amber-400"
                    : "bg-slate-50/70 border-slate-200 opacity-70 hover:opacity-100"
                }`}
                data-easybot-hint={`스케줄 항목: '${s.name}' 스케줄입니다. (${freqLabel}) 설정에 맞춰 구글 클라우드에서 자동 실행됩니다.`}
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 ${
                      isTime ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"
                    }`}>
                      {isTime ? <Clock className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      <span>{freqLabel}</span>
                    </span>

                    <h5 className="font-extrabold text-xs text-slate-800 truncate">{s.name}</h5>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                      s.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                      <span>{s.status === "ACTIVE" ? "활성 가동 중" : "일시정지"}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-bold">
                      fx: {s.functionName}()
                    </span>
                    <span>프로젝트: {s.projectName}</span>
                    {s.spreadsheetUrl && (
                      <a href={s.spreadsheetUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1">
                        <span>시트 열기</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {s.lastRunAt && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                      <Activity className="w-3 h-3" />
                      <span>최근 실행: {s.lastRunAt}</span>
                      {s.lastStatus === "SUCCESS" && <span className="text-emerald-600 font-bold">● 성공</span>}
                      {s.lastStatus === "FAILED" && <span className="text-rose-600 font-bold">● 오류</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  <button
                    onClick={() => handleRunNow(s)}
                    disabled={isRunning}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    data-easybot-hint="즉시 실행: 예약 시간을 기다리지 않고 지금 즉시 Apps Script 함수를 원격 테스트 실행합니다."
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                        <span>실행 중...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
                        <span>즉시 실행</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleToggle(s)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1 cursor-pointer ${
                      s.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                    data-easybot-hint="활성/정지 토글: 스케줄 자동 실행을 켜거나 일시 중단합니다."
                  >
                    {s.status === "ACTIVE" ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                    <span>{s.status === "ACTIVE" ? "활성" : "정지"}</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingSchedule(s);
                      setIsModalOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl cursor-pointer"
                    title="스케줄 수정"
                    data-easybot-hint="스케줄 수정: 실행 시간, 주기, 실행할 Apps Script 함수명을 변경합니다."
                  >
                    <Wrench className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(s)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                    title="스케줄 삭제"
                    data-easybot-hint="스케줄 삭제: 스케줄을 휴지통으로 이동(소프트 삭제)합니다."
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ScheduleModal
        isOpen={isModalOpen}
        projects={projects}
        scheduleToEdit={editingSchedule}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSchedule(null);
        }}
        onSuccess={() => {
          onRefresh();
          onShowAlert({
            type: "success",
            text: editingSchedule ? "스케줄 설정이 수정되었습니다." : "새 스케줄이 성공적으로 등록되었습니다.",
          });
          setEditingSchedule(null);
        }}
      />
    </div>
  );
}
