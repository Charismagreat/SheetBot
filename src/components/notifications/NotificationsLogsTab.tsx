import React from "react";
import { RefreshCw } from "lucide-react";

interface NotificationsLogsTabProps {
  logs: any[];
  loadingLogs: boolean;
  onRefresh: () => void;
}

export default function NotificationsLogsTab({
  logs,
  loadingLogs,
  onRefresh,
}: NotificationsLogsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">최근 문자 발송 이력</h3>
          <p className="text-xs text-slate-500">회원님의 폰을 통해 발송된 알림 문자의 성공 및 실패 기록입니다.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loadingLogs}
          className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${loadingLogs ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loadingLogs ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">발송 기록을 조회하는 중...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
          아직 발송된 알림 이력이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-extrabold border-b border-slate-200">
                  <th className="p-3.5">발송 일시</th>
                  <th className="p-3.5">규칙 / 이벤트</th>
                  <th className="p-3.5">수신 번호</th>
                  <th className="p-3.5">발송 내용</th>
                  <th className="p-3.5">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="p-3.5 text-slate-500 whitespace-nowrap">
                      {log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-"}
                    </td>
                    <td className="p-3.5 font-bold text-slate-800 whitespace-nowrap">
                      {log.rule_name || "스마트 알림"}
                    </td>
                    <td className="p-3.5 text-indigo-600 font-mono font-bold whitespace-nowrap">
                      {log.recipient}
                    </td>
                    <td className="p-3.5 text-slate-700 max-w-xs truncate" title={log.content}>
                      {log.content}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {log.status === "SUCCESS" ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-black border border-emerald-200 text-[10px]">
                          발송 성공
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-black border border-rose-200 text-[10px]"
                          title={log.error_message}
                        >
                          실패: {log.error_message || "오류"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
