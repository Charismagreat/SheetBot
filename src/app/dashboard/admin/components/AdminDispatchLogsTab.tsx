"use client";

import React, { useState } from "react";
import {
  Radio,
  Smartphone,
  Mail,
  CheckCircle2,
  Ban,
  Search,
  RefreshCw,
  Trash2,
  ShieldAlert,
} from "lucide-react";

interface DispatchStats {
  total: number;
  smsTotal: number;
  smsSuccess: number;
  smsFailed: number;
  emailTotal: number;
  emailSuccess: number;
  emailFailed: number;
}

interface AdminDispatchLogsTabProps {
  logs: any[];
  stats: DispatchStats;
  channelFilter: string;
  onChannelFilterChange: (channel: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchInput: string;
  onSearchInputChange: (search: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onDeleteLog: (id: string) => void;
}

export default function AdminDispatchLogsTab({
  logs,
  stats,
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
  searchInput,
  onSearchInputChange,
  loading,
  onRefresh,
  onDeleteLog,
}: AdminDispatchLogsTabProps) {
  const [selectedLogDetail, setSelectedLogDetail] = useState<any | null>(null);

  const successRate =
    stats.total > 0
      ? Math.round(((stats.smsSuccess + stats.emailSuccess) / stats.total) * 100)
      : 100;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 발송 이력 지표 카드 4종 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">총 발송 시도</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {stats.total}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">📱 문자 (SMS)</span>
            <Smartphone className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-sky-700">
            {stats.smsTotal}
            <span className="text-xs font-normal text-slate-400 ml-1">
              (성공 {stats.smsSuccess} / 실패 {stats.smsFailed})
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">✉️ 이메일 (Email)</span>
            <Mail className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-700">
            {stats.emailTotal}
            <span className="text-xs font-normal text-slate-400 ml-1">
              (성공 {stats.emailSuccess} / 실패 {stats.emailFailed})
            </span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500">발송 성공률</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {successRate}
            <span className="text-xs font-normal text-slate-400 ml-1">%</span>
          </div>
        </div>
      </div>

      {/* 검색 및 필터 컨트롤 바 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onRefresh()}
            placeholder="수신번호/이메일, 제목, 규칙명 검색..."
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* 채널 필터 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
            {(["ALL", "SMS", "EMAIL"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => onChannelFilterChange(ch)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  channelFilter === ch
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {ch === "ALL" ? "전체 채널" : ch === "SMS" ? "📱 문자" : "✉️ 메일"}
              </button>
            ))}
          </div>

          {/* 상태 필터 */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
            {(["ALL", "SUCCESS", "FAILED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => onStatusFilterChange(st)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === st
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {st === "ALL" ? "전체 상태" : st === "SUCCESS" ? "✅ 성공" : "❌ 실패"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer border border-slate-200"
            title="새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* 발송 이력 목록 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">실시간 발송 완료 및 실패 이력 대장</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              고객 문의, 세금계산서, 결제 및 테스트 알림 발송 내역이 실시간으로 기록됩니다.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            총 {logs.length}건 표시 중
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-16 text-slate-400 space-y-3">
            <Radio className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm">기록된 발송 이력이 없습니다.</p>
            <p className="text-xs text-slate-400">
              문의 접수, 결제, 세금계산서 신청 또는 SMS/이메일 테스트 발송 시 자동으로 기록됩니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 font-bold">
                  <th className="py-3 px-4">발송 일시</th>
                  <th className="py-3 px-3">채널</th>
                  <th className="py-3 px-3">이벤트</th>
                  <th className="py-3 px-4">수신자</th>
                  <th className="py-3 px-4">적용 규칙 / 제목</th>
                  <th className="py-3 px-3 text-center">발송 결과</th>
                  <th className="py-3 px-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => {
                  const isSms = log.channel === "SMS";
                  const isSuccess = log.status === "SUCCESS";
                  const formattedDate = log.created_at
                    ? new Date(log.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
                    : "-";

                  let eventBadge = { label: "기타", bg: "bg-slate-100", text: "text-slate-700" };
                  if (log.event_type === "inquiry") eventBadge = { label: "1:1 문의", bg: "bg-indigo-50", text: "text-indigo-700" };
                  else if (log.event_type === "tax_invoice") eventBadge = { label: "세금계산서", bg: "bg-sky-50", text: "text-sky-700" };
                  else if (log.event_type === "payment") eventBadge = { label: "유료 결제", bg: "bg-amber-50", text: "text-amber-700" };
                  else if (log.event_type === "test") eventBadge = { label: "연동 테스트", bg: "bg-emerald-50", text: "text-emerald-700" };

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            isSms
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-purple-50 text-purple-700 border border-purple-200"
                          }`}
                        >
                          {isSms ? <Smartphone className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {log.channel}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${eventBadge.bg} ${eventBadge.text}`}>
                          {eventBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                              log.recipient_type === "CUSTOMER"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {log.recipient_type === "CUSTOMER" ? "고객" : "관리자"}
                          </span>
                          <span className="font-bold text-slate-800 font-mono text-xs">
                            {log.recipient}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-[260px] truncate">
                        <div className="font-bold text-slate-800 truncate" title={log.title || log.rule_name}>
                          {log.title || log.rule_name || "(제목 없음)"}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate" title={log.rule_name}>
                          규칙: {log.rule_name || "시스템 기본"}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            성공
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200 cursor-help"
                            title={log.error_message || "발송 실패"}
                          >
                            <Ban className="w-3 h-3" />
                            실패
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedLogDetail(log)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer transition-colors"
                          >
                            상세보기
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteLog(log.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="로그 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 알림 발송 이력 상세 모달 */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-xl ${
                    selectedLogDetail.channel === "SMS"
                      ? "bg-sky-50 text-sky-600"
                      : "bg-purple-50 text-purple-600"
                  }`}
                >
                  {selectedLogDetail.channel === "SMS" ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedLogDetail.channel === "SMS"
                      ? "문자 (SMS) 발송 상세"
                      : "이메일 (Email) 발송 상세"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {selectedLogDetail.created_at
                      ? new Date(selectedLogDetail.created_at).toLocaleString("ko-KR", {
                          timeZone: "Asia/Seoul",
                        })
                      : "-"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 발송 상태 뱃지 & 에러 사유 */}
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                selectedLogDetail.status === "SUCCESS"
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {selectedLogDetail.status === "SUCCESS" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Ban className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  발송 상태:{" "}
                  {selectedLogDetail.status === "SUCCESS" ? "정상 발송 완료" : "발송 실패"}
                </span>
              </div>
              <span className="text-[11px] font-mono opacity-80">
                ID: {selectedLogDetail.id}
              </span>
            </div>

            {selectedLogDetail.error_message && (
              <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-700 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>실패 사유 / 오류 메시지:</span>
                </div>
                <p className="font-mono text-[11px] break-all">
                  {selectedLogDetail.error_message}
                </p>
              </div>
            )}

            {/* 메타 정보 테이블 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">수신 대상:</span>
                <span className="font-bold text-slate-800">
                  [{selectedLogDetail.recipient_type === "CUSTOMER" ? "고객" : "관리자"}]{" "}
                  {selectedLogDetail.recipient}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">트리거 이벤트:</span>
                <span className="font-bold text-indigo-600">{selectedLogDetail.event_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">적용된 규칙:</span>
                <span className="font-bold text-slate-700">
                  {selectedLogDetail.rule_name || "시스템 기본"}
                </span>
              </div>
              {selectedLogDetail.title && (
                <div className="flex justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-slate-400">메시지 제목:</span>
                  <span className="font-bold text-slate-900">{selectedLogDetail.title}</span>
                </div>
              )}
            </div>

            {/* 본문 내용 */}
            <div className="space-y-1 flex-1 overflow-hidden flex flex-col">
              <label className="text-xs font-bold text-slate-700">발송된 본문 내용</label>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 whitespace-pre-line overflow-y-auto flex-1 max-h-56">
                {selectedLogDetail.channel === "EMAIL" &&
                selectedLogDetail.content?.includes("<") ? (
                  <div
                    className="prose prose-xs max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedLogDetail.content }}
                  />
                ) : (
                  selectedLogDetail.content || "(본문 내용 없음)"
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedLogDetail(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-900 cursor-pointer shadow-xs"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
