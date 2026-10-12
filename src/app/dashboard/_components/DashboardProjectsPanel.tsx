"use client";

import {
  ArrowRight,
  Bot,
  Briefcase,
  Calendar,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileCode,
  FileSpreadsheet,
  Globe,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { formatDateTime, getProjectDisplayId } from "../_lib/helpers";
import type { DashboardAlertMessage } from "../_lib/types";

export function DashboardProjectsPanel({
  showTrashed,
  projects,
  trashedProjects,
  syncingProjectId,
  syncingCodeProjectId,
  copyingBridgeProjectId,
  onShowTrashedChange,
  onOpenNewProjectModal,
  onRestoreProject,
  onSyncProjectTitle,
  onSyncProjectCode,
  onCopyAgentBridgeUrl,
  onDeleteProject,
  onEditProject,
  onFeedbackProject,
  showAlert,
  onOpenFdeRecruit,
  onOpenFdeModal,
  onSetApplyingFde,
}: {
  showTrashed: boolean;
  projects: any[];
  trashedProjects: any[];
  syncingProjectId: string | null;
  syncingCodeProjectId: string | null;
  copyingBridgeProjectId: string | null;
  onShowTrashedChange: (show: boolean) => void;
  onOpenNewProjectModal: () => void;
  onRestoreProject: (p: any) => void;
  onSyncProjectTitle: (p: any) => void;
  onSyncProjectCode: (p: any) => void;
  onCopyAgentBridgeUrl: (p: any) => void;
  onDeleteProject: (p: any) => void;
  onEditProject: (p: any) => void;
  onFeedbackProject: (p: any) => void;
  showAlert: (msg: DashboardAlertMessage) => void;
  onOpenFdeRecruit: () => void;
  onOpenFdeModal: () => void;
  onSetApplyingFde: (v: boolean) => void;
}) {
  return (
    <>
        {/* 2. 래핑된 내 자동화 프로젝트 목록 */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-600" />
                <span>내 자동화 프로젝트</span>
              </h4>

              {/* 활성 vs 휴지통(14일 유예) 탭 스위처 */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => onShowTrashedChange(false)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    !showTrashed
                      ? "bg-white text-emerald-800 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  활성 ({projects.length})
                </button>
                <button
                  type="button"
                  onClick={() => onShowTrashedChange(true)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    showTrashed
                      ? "bg-white text-rose-700 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="삭제된 프로젝트 (14일 복구 유예)"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>휴지통 ({trashedProjects.length})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!showTrashed && (
                <button
                  onClick={onOpenNewProjectModal}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
                  data-easybot-hint="새 구글 시트 생성: 새 구글 스프레드시트를 생성하거나 기존 시트를 래핑하여 AI 자동화 코드를 주입합니다."
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>새 구글 시트 생성</span>
                </button>
              )}
            </div>
          </div>

          {showTrashed ? (
            trashedProjects.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Trash2 className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">휴지통에 보관된 삭제 프로젝트가 없습니다.</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  삭제된 프로젝트는 방치된 트리거 차단(HTTP 410) 후 14일간 유예 보관되며 언제든 복원할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {trashedProjects.map((p) => {
                  const deletedTime = p.deleted_at ? new Date(p.deleted_at).getTime() : Date.now();
                  const daysLeft = Math.max(0, Math.ceil(14 - (Date.now() - deletedTime) / (1000 * 60 * 60 * 24)));

                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <h5 className="font-bold text-xs text-slate-800 truncate" title={p.name}>
                            {p.name}
                          </h5>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            ID: {getProjectDisplayId(p)}
                          </div>
                          {/* 📅 생성일자 및 삭제일시 */}
                          <div className="flex items-center gap-2.5 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                            {(p.created_at || p.createdAt) && (
                              <span>생성: {formatDateTime(p.created_at || p.createdAt)}</span>
                            )}
                            {(p.deleted_at || p.updated_at) && (
                              <span className="text-rose-500">삭제: {formatDateTime(p.deleted_at || p.updated_at)}</span>
                            )}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-md flex items-center gap-1 shrink-0">
                          <span>차단됨 (D-{daysLeft})</span>
                        </span>
                      </div>

                      <div className="p-2.5 bg-white rounded-xl border border-rose-100 text-[11px] text-slate-600 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-700">⚠️ 외부 호출 즉시 차단 (HTTP 410)</span>
                          <span className="text-[10px] text-slate-400">유예 기간: {daysLeft}일 남음</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          삭제되어 외부 AI 및 구글 시트에서의 호출이 차단된 상태입니다. 복원 시 모든 래핑과 스케줄이 다시 활성화됩니다.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-100/60">
                        <button
                          type="button"
                          onClick={() => onRestoreProject(p)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>프로젝트 복원하기</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 새 프로젝트 추가 점선 카드 */}
              <div
                onClick={onOpenNewProjectModal}
                className="p-5 rounded-2xl border-2 border-dashed border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400/90 transition-all cursor-pointer flex flex-col justify-between gap-3 group text-left min-h-[110px]"
                data-easybot-hint="새 프로젝트 생성 카드: 클릭하여 새 구글 시트 자동화 프로젝트 마법사를 시작합니다."
              >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white text-emerald-600 rounded-xl shadow-xs group-hover:scale-110 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h5 className="font-extrabold text-xs text-emerald-950 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <span>새 프로젝트 추가</span>
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                  </h5>
                  <p className="text-[11px] text-emerald-900/70 leading-relaxed">
                    구글 시트 URL을 입력하고 자연어로 Apps Script 코드를 자동 주입합니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-100/60 flex items-center justify-between text-[11px] font-bold text-emerald-600">
                <span>원스톱 AI 생성 시작하기</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 기존 프로젝트 목록 */}
            {projects.map((p) => {
              const isSyncing = Boolean(syncingProjectId && p.id && syncingProjectId === p.id);
              return (
                <div
                  key={p.id || p.gasProjectId || p.spreadsheetId}
                  className="p-4 rounded-2xl border border-emerald-100 shadow-xs hover:border-emerald-300 bg-white transition-all flex flex-col justify-between gap-3"
                  data-easybot-hint={`프로젝트 카드: '${p.name}' 자동화 프로젝트입니다. 구글 시트 바인딩 및 코드 배포 상태를 확인합니다.`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="font-bold text-xs text-slate-800 truncate max-w-[180px] sm:max-w-[240px]" title={p.name}>
                          {p.name}
                        </h5>
                        <button
                          type="button"
                          onClick={() => onSyncProjectTitle(p)}
                          disabled={isSyncing}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 rounded-md text-[10px] font-bold transition-all border border-slate-200 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                          title="구글 시트의 원래 최신 제목으로 프로젝트 이름을 동기화합니다."
                          data-easybot-hint="시트명 동기화: 구글 스프레드시트의 원본 제목을 조회하여 이 카드의 프로젝트 이름을 즉시 일치시킵니다."
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                          <span>{isSyncing ? "동기화 중..." : "동기화"}</span>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <span className="shrink-0 font-bold text-slate-500">ID:</span>
                        <span
                          className="truncate max-w-[200px] sm:max-w-[280px] select-all cursor-pointer hover:text-slate-600 transition-colors"
                          title={`전체 ID: ${getProjectDisplayId(p)} (클릭 시 복사)`}
                          onClick={() => {
                            const fullId = getProjectDisplayId(p);
                            if (fullId) {
                              navigator.clipboard.writeText(fullId);
                              showAlert({ type: "success", text: "프로젝트 ID가 클립보드에 복사되었습니다." });
                            }
                          }}
                        >
                          {getProjectDisplayId(p)}
                        </span>
                      </div>

                      {/* 📅 생성일자 및 최종수정일시 */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                        {(p.created_at || p.createdAt) && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>생성: {formatDateTime(p.created_at || p.createdAt)}</span>
                          </span>
                        )}
                        {(p.updated_at || p.updatedAt) && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>수정: {formatDateTime(p.updated_at || p.updatedAt)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.scriptId || p.gasProjectId ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>래핑 완료</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-violet-100 text-violet-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                          <span>래핑 완료</span>
                        </span>
                      )}

                      <button
                        onClick={() => onDeleteProject(p)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="프로젝트 삭제"
                        data-easybot-hint="프로젝트 삭제: 프로젝트를 안전하게 소프트 삭제(휴지통 처리)합니다."
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                {p.summary && (
                  <p className="text-[11px] text-slate-500 line-clamp-1">{p.summary}</p>
                )}

                {/* 프로젝트 카드 하단 액션 영역 (2단 논리 분할 구조로 정돈) */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2 text-[11px]">
                  {/* 1단: 구글 시트 / Apps Script 바로가기 링크 그룹 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 구글 시트 열기 링크 버튼 */}
                      {p.spreadsheetUrl && (
                        <a
                          href={p.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg transition-colors border border-emerald-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="구글 시트 열기: 연결된 실제 구글 스프레드시트 웹 페이지를 새 창에서 엽니다."
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>구글 시트 열기</span>
                          <ExternalLink className="w-3 h-3 text-emerald-600/70 shrink-0" />
                        </a>
                      )}

                      {/* 스크립트 편집기 직접 열기 버튼 (미생성 시 '코드 주입 대기 중' 안내 버튼 제공) */}
                      {(() => {
                        const editorUrl =
                          p.scriptUrl ||
                          (p.scriptId ? `https://script.google.com/d/${p.scriptId}/edit` : (p.gasProjectId ? `https://script.google.com/d/${p.gasProjectId}/edit` : ""));
                        return editorUrl ? (
                          <a
                            href={editorUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors border border-indigo-200/60 shadow-2xs whitespace-nowrap text-xs"
                            data-easybot-hint="스크립트 편집기 열기: 구글 시트의 프로젝트 선택창을 거치지 않고 이 Apps Script 코드 편집 화면으로 1초 만에 바로 진입합니다."
                          >
                            <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>스크립트 편집기</span>
                            <ExternalLink className="w-3 h-3 text-indigo-600/70 shrink-0" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCopyAgentBridgeUrl(p)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-violet-50 text-slate-500 hover:text-violet-700 font-bold rounded-lg transition-all border border-slate-200/80 hover:border-violet-200 shadow-2xs whitespace-nowrap text-xs cursor-pointer group"
                            title="안티그라비티/AI에 래핑 주소를 전달해 첫 코드를 주입하면 스크립트 편집기가 활성화됩니다. (클릭 시 래핑 주소 복사)"
                            data-easybot-hint="코드 주입 대기: 래핑 주소는 발급되었으나 아직 AI가 첫 코드를 주입하기 전 상태입니다. 클릭하면 AI 연동 주소가 복사됩니다."
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
                            <span>코드 주입 대기 중</span>
                          </button>
                        );
                      })()}

                      {/* 🌐 공개 웹페이지 바로가기 (Web App인 경우) */}
                      {(p.webapp_url || p.webappUrl) && (
                        <a
                          href={p.webapp_url || p.webappUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg transition-colors border border-sky-200/80 shadow-2xs whitespace-nowrap text-xs"
                          data-easybot-hint="공개 웹페이지 열기: 일반 대중에게 배포할 수 있는 실시간 독립 접수/설문 웹페이지를 새 창에서 엽니다."
                          title="일반 대중 배포용 독립 웹페이지 바로가기"
                        >
                          <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>공개 웹 폼</span>
                          <ExternalLink className="w-3 h-3 text-sky-600/70 shrink-0" />
                        </a>
                      )}

                      {/* 🤖 AI 에이전트 연동 주소 복사 버튼 */}
                      <button
                        type="button"
                        onClick={() => onCopyAgentBridgeUrl(p)}
                        disabled={Boolean(copyingBridgeProjectId && p.id && copyingBridgeProjectId === p.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg transition-colors border border-purple-200/80 shadow-2xs whitespace-nowrap text-xs cursor-pointer active:scale-95 disabled:opacity-50"
                        data-easybot-hint="AI 에이전트 연동: 안티그라비티나 외부 AI에 전달할 원격 코드 주입용 웹 주소와 프롬프트를 원클릭 복사합니다."
                        title="안티그라비티/외부 AI에 전달하여 코드를 자동 주입할 웹 주소를 복사합니다."
                      >
                        <Bot className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>{Boolean(copyingBridgeProjectId && p.id && copyingBridgeProjectId === p.id) ? "링크 생성 중..." : "래핑 링크 복사"}</span>
                        <Copy className="w-3 h-3 text-purple-600/70 shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* 2단: 관리 도구 (코드 동기화 / 요구사항 수정 / 만족도 평가) */}
                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100/80 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 🔄 최신 코드 동기화 버튼 */}
                      <button
                        type="button"
                        onClick={() => onSyncProjectCode(p)}
                        disabled={Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap disabled:opacity-50"
                        title="구글 시트에서 직접 수정한 최신 Apps Script 코드를 SheetBot DB로 가져옵니다."
                        data-easybot-hint="최신 코드 동기화: 사용자가 구글 시트에서 직접 수정한 Apps Script 최신 코드를 즉시 읽어와 SheetBot에 일치시킵니다."
                      >
                        <RefreshCw className={`w-3 h-3 ${Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id) ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
                        <span>{Boolean(syncingCodeProjectId && p.id && syncingCodeProjectId === p.id) ? "동기화 중..." : "코드 동기화"}</span>
                      </button>

                      {/* ✏️ 자연어 요구사항 수정 및 AI 코드 재배포 버튼 */}
                      <button
                        type="button"
                        onClick={() => onEditProject(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-600 font-bold rounded-lg transition-all border border-slate-200 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap active:scale-95"
                        data-easybot-hint="요구사항 수정: 기존 프롬프트를 확인하고 수정/추가하여 새 코드를 AI로 재작성 및 구글 시트에 재배포합니다."
                        title="자연어 요구사항을 수정하거나 추가하여 새 코드로 재배포합니다."
                      >
                        <Edit3 className="w-3 h-3 text-slate-500" />
                        <span>요구사항 수정</span>
                      </button>
                    </div>

                    {/* ⭐ 만족도 평가 및 AI 자가 학습 피드백 버튼 */}
                    <button
                      type="button"
                      onClick={() => onFeedbackProject(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg transition-all border border-amber-200/80 cursor-pointer shadow-2xs text-[11px] whitespace-nowrap ml-auto"
                      data-easybot-hint="만족도 평가: AI 생성 코드에 대한 별점과 피드백을 제출하여 AI가 자가 학습하도록 합니다."
                      title="AI 코드 만족도 평가 및 자가 학습 피드백"
                    >
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      <span>만족도 평가</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

          {/* 전문가(FDE) 맞춤 제작 안내 슬림 배너 */}
          <div className="pt-3 mt-1 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-slate-50 p-3.5 rounded-2xl border border-indigo-100/80">
            <div className="flex items-center gap-2.5 text-slate-700">
              <div className="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-indigo-950">혼자 제작하기 복잡하거나 시간이 부족하신가요?</span>
                <span className="text-slate-500 block sm:inline sm:ml-1.5 text-[11px]">
                  SheetBot 전담 엔지니어(FDE)가 귀사 시트 양식에 맞춰 100% 동작하는 자동화 코드를 직접 구축해 드립니다.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => { onSetApplyingFde(false); onOpenFdeRecruit(); }}
                className="px-2 py-1 text-purple-700 hover:text-purple-900 text-xs font-bold hover:underline cursor-pointer whitespace-nowrap"
                title="시트 자동화 외주 수주 및 개발자 파트너 등록 안내"
              >
                <span>FDE 파트너 지원 &gt;</span>
              </button>

              <button
                type="button"
                onClick={onOpenFdeModal}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-all shadow-2xs shrink-0 whitespace-nowrap cursor-pointer active:scale-95"
              >
                <span>FDE 1:1 맞춤 의뢰</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
