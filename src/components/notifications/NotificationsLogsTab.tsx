import React from "react";
import { RefreshCw, FileSpreadsheet, ShieldCheck, CheckCircle2, AlertTriangle, ArrowUpRight } from "lucide-react";

interface NotificationsLogsTabProps {
  logs: any[];
  loadingLogs: boolean;
  onRefresh: () => void;
  dispatchSheetUrl?: string | null;
}

export default function NotificationsLogsTab({
  logs,
  loadingLogs,
  onRefresh,
  dispatchSheetUrl,
}: NotificationsLogsTabProps) {
  const successCount = logs.filter((l) => l.status === "SUCCESS").length;
  const inboundCount = logs.filter((l) => l.status === "INBOUND").length;
  const failedCount = logs.filter((l) => l.status === "FAILED" || (l.status !== "SUCCESS" && l.status !== "INBOUND" && l.status !== "PENDING")).length;

  return (
    <div className="space-y-4">
      {/* 🛡️ Zero-Retention 구글 시트 직통 대장 카드 */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 rounded-2xl p-5 sm:p-6 text-white border border-emerald-500/20 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-left">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[11px] font-bold border border-emerald-400/30">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero-Retention 프라이버시 안심</span>
            </span>
            <span className="text-xs text-slate-300 font-medium">서버 무보관 100%</span>
          </div>
          <h4 className="text-sm sm:text-base font-black text-white">
            고객 알림 발송 및 수신 내역이 회원님의 구글 시트에 실시간 기록됩니다
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            고객 연락처와 문자 전문은 시트봇 서버에 절대 보관되지 않으며, 오직 회원님 본인의 구글 드라이브(스프레드시트)에만 100% 안전하게 저장되어 엑셀 수식(=COUNTIF), 필터, 피벗 테이블로 자유롭게 조회·분석할 수 있습니다.
          </p>
        </div>

        {dispatchSheetUrl ? (
          <a
            href={dispatchSheetUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all shrink-0 cursor-pointer active:scale-95"
            title="새 창으로 구글 스프레드시트 전체 발송 대장 열기"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>구글 시트에서 전체 대장 열기</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
          </a>
        ) : (
          <div className="text-[11px] text-emerald-400/80 bg-emerald-950/60 px-3 py-2 rounded-xl border border-emerald-500/20 shrink-0">
            문자 발송 시 구글 시트가 자동 생성됩니다
          </div>
        )}
      </div>

      {/* 헤더 및 통계 요약 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-extrabold text-slate-900">최근 실시간 발송 내역</h3>
          <span className="text-xs text-slate-400">|</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
            총 {logs.length}건
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100">
            성공 {successCount}건
          </span>
          {inboundCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-100">
              수신 {inboundCount}건
            </span>
          )}
          {failedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-100">
              실패 {failedCount}건
            </span>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={loadingLogs}
          className="self-end sm:self-auto p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-bold"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin text-emerald-600" : ""}`} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      {loadingLogs ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">발송 기록을 동기화하는 중...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs space-y-2">
          <p>아직 발송된 알림 이력이 없습니다.</p>
          <p className="text-[11px] text-slate-400">
            스마트폰을 연동하고 테스트 문자를 발송해 보세요. 모든 내역은 회원님의 구글 시트에 안전하게 자동 기록됩니다.
          </p>
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
                      ) : log.status === "INBOUND" ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-black border border-blue-200 text-[10px]">
                          📥 수신 완료
                        </span>
                      ) : log.status === "PENDING" ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-black border border-amber-200 text-[10px] animate-pulse">
                          ⏳ 대기 중 (스마트폰 발송 대기)
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
