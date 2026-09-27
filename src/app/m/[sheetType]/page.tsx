"use client";

import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface SheetDataResponse {
  success: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  title?: string;
  headers?: string[];
  rows?: string[][];
  totalCount?: number;
  error?: string;
}

const TYPE_NAMES: Record<string, { title: string; icon: string; desc: string }> = {
  recording: {
    title: "통화 녹음 대장",
    icon: "🎙️",
    desc: "스마트폰 통화 녹음 파일 및 구글 드라이브 백업 내역",
  },
  file_upload: {
    title: "파일 보관함 대장",
    icon: "📁",
    desc: "구글 드라이브에 안전하게 보관된 사진 및 문서 파일",
  },
  sms: {
    title: "문자(SMS) 송수신 대장",
    icon: "💬",
    desc: "고객과 주고받은 문자 및 입금/알림 메시지 기록",
  },
  kakao: {
    title: "카카오톡 메시지 대장",
    icon: "🟡",
    desc: "카카오톡 알림 및 주요 고객 메시지 실시간 기록",
  },
  missed_call: {
    title: "부재중 전화 대장",
    icon: "📞",
    desc: "부재중 전화 감지 및 0원 스마트 자동 회신 이력",
  },
  link_bookmark: {
    title: "웹 링크 & 유튜브 스크랩",
    icon: "🌐",
    desc: "원클릭 공유로 AI가 3줄 요약한 웹/유튜브 지식",
  },
  call_ended_card: {
    title: "모바일 명함 발송 대장",
    icon: "💼",
    desc: "통화 종료 직후 원터치 발송된 모바일 명함 및 안내 이력",
  },
  payment_push: {
    title: "매장 결제 및 매출 대장",
    icon: "💳",
    desc: "금융/결제 앱 푸시를 실시간 감지하여 자동 장부화한 내역",
  },
  receipt_sms: {
    title: "고객 영수증 문자 발송 대장",
    icon: "🧾",
    desc: "결제 완료 후 고객에게 자동 전송된 0원 스마트 영수증",
  },
  website_monitor: {
    title: "웹사이트 모니터링 & 장애 대장",
    icon: "🚨",
    desc: "내 홈페이지/사이트 실시간 24시간 장애 감시 및 복구 이력",
  },
};

function MobileSheetWebAppContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const sheetTypeParam = (params?.sheetType as string) || "sms";
  const userEmail = searchParams?.get("email") || "";
  const sheetIdParam = searchParams?.get("sheetId") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SheetDataResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<string[] | null>(null);

  const meta = TYPE_NAMES[sheetTypeParam.toLowerCase()] || {
    title: "스마트 대장",
    icon: "📊",
    desc: "구글 스프레드시트 모바일 전용 스마트 웹앱",
  };

  const fetchData = async () => {
    if (!userEmail) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const queryUrl = `/api/user/sheets/data?email=${encodeURIComponent(userEmail)}&sheetType=${encodeURIComponent(sheetTypeParam)}${
        sheetIdParam ? `&sheetId=${encodeURIComponent(sheetIdParam)}` : ""
      }`;
      const res = await apiFetch(queryUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const json: SheetDataResponse = await res.json();
      setData(json);
    } catch (e: any) {
      clearTimeout(timeoutId);
      const isAbort = e.name === "AbortError";
      setData({
        success: false,
        error: isAbort
          ? "구글 드라이브 응답 지연으로 대장을 불러오지 못했습니다. 상단 새로고침을 눌러주세요."
          : e.message || "데이터 조회 실패",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sheetTypeParam, userEmail, sheetIdParam]);

  // 실시간 검색 필터링
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!searchQuery.trim()) return data.rows;
    const q = searchQuery.toLowerCase().trim();
    return data.rows.filter((row) =>
      row.some((cell) => cell && cell.toString().toLowerCase().includes(q))
    );
  }, [data?.rows, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* 1. 상단 모바일 앱 바 */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-lg shadow-md">
            {meta.icon}
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="text-base font-bold text-white tracking-tight">
                {data?.title || meta.title}
              </h1>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                WEB APP
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
              {userEmail || "계정 미확인"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {data?.spreadsheetUrl && (
            <a
              href={data.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-lg flex items-center space-x-1 shadow transition"
            >
              <span>📊 시트 원본</span>
            </a>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 rounded-lg text-slate-300 hover:text-white transition"
            title="새로고침"
          >
            <svg
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* 2. 본문 컨테이너 */}
      <main className="flex-1 p-4 max-w-lg w-full mx-auto space-y-4">
        {/* 검색 및 요약 바 */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="대장 내역 실시간 검색 (이름, 번호, 내용)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 pl-10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
            <svg
              className="w-4 h-4 text-slate-500 absolute left-3.5 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>
              총 <strong className="text-indigo-400 font-bold">{filteredRows.length}</strong>건
              {searchQuery && ` (검색 결과)`}
            </span>
            <span className="flex items-center space-x-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>구글 드라이브 실시간 동기화</span>
            </span>
          </div>
        </div>

        {/* 로딩 상태 */}
        {loading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400">구글 시트에서 최신 대장 불러오는 중...</p>
          </div>
        )}

        {/* 에러 상태 */}
        {!loading && data && !data.success && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-6 text-center space-y-3">
            <div className="text-3xl">⚠️</div>
            <h3 className="text-sm font-bold text-rose-300">대장을 불러올 수 없습니다</h3>
            <p className="text-xs text-rose-200/80 leading-relaxed">
              {data.error || "구글 시트가 아직 생성되지 않았거나 권한이 없습니다."}
            </p>
            <p className="text-[11px] text-slate-400">
              스마트폰 모바일 앱에서 해당 기능의 스위치를 켜주시면 즉시 자동 생성됩니다.
            </p>
          </div>
        )}

        {/* 빈 상태 */}
        {!loading && data?.success && filteredRows.length === 0 && (
          <div className="py-16 text-center space-y-3 bg-slate-900/50 rounded-2xl border border-slate-800/60 p-6">
            <div className="text-4xl">📭</div>
            <h3 className="text-sm font-semibold text-slate-200">기록된 내역이 없습니다</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              {searchQuery
                ? "검색 조건에 맞는 내역을 찾을 수 없습니다."
                : meta.desc}
            </p>
          </div>
        )}

        {/* 카드 리스트 (모바일 최적화) */}
        {!loading && data?.success && filteredRows.length > 0 && (
          <div className="space-y-3 pb-8">
            {filteredRows.map((row, idx) => {
              const headers = data.headers || [];
              const timeCol = row[0] || "";
              const mainCol = row[1] || "";
              const subCol = row[2] || "";
              const contentCol = row[3] || row[4] || "";

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedRow(row)}
                  className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 space-y-2 cursor-pointer transition active:scale-[0.99] shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {timeCol || `내역 #${filteredRows.length - idx}`}
                    </span>
                    {mainCol && (
                      <span className="text-[11px] font-bold text-sky-400 truncate max-w-[150px]">
                        {mainCol}
                      </span>
                    )}
                  </div>

                  {subCol && (
                    <div className="text-xs font-semibold text-white">
                      {subCol}
                    </div>
                  )}

                  {contentCol && (
                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {contentCol}
                    </p>
                  )}

                  {/* 행의 기타 데이터 요약 */}
                  <div className="pt-1 flex flex-wrap gap-1.5 border-t border-slate-800/80 text-[10px] text-slate-400">
                    {row.slice(4).map((cell, cIdx) => {
                      if (!cell) return null;
                      const isUrl = cell.startsWith("http://") || cell.startsWith("https://");
                      if (isUrl) {
                        return (
                          <a
                            key={cIdx}
                            href={cell}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 text-indigo-400 hover:underline bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/50"
                          >
                            <span>🔗 링크 열기</span>
                          </a>
                        );
                      }
                      return (
                        <span key={cIdx} className="bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-400">
                          {headers[cIdx + 4] ? `${headers[cIdx + 4]}: ` : ""}{cell}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 3. 상세 내역 모달 */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>{meta.icon}</span>
                <span>상세 내역 확인</span>
              </h3>
              <button
                onClick={() => setSelectedRow(null)}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {(data?.headers || []).map((header, hIdx) => {
                const val = selectedRow[hIdx] || "-";
                const isUrl = val.startsWith("http://") || val.startsWith("https://");

                return (
                  <div key={hIdx} className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">{header}</div>
                    {isUrl ? (
                      <a
                        href={val}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-xs text-sky-400 hover:underline break-all bg-sky-950/40 p-2 rounded-lg border border-sky-800/40 w-full"
                      >
                        <span>🔗 {val}</span>
                      </a>
                    ) : (
                      <div className="text-xs text-slate-100 bg-slate-950 p-2.5 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed">
                        {val}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setSelectedRow(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 4. 하단 보증 푸터 */}
      <footer className="mt-auto border-t border-slate-800/60 bg-slate-950 py-3 text-center text-[10px] text-slate-500 space-y-0.5">
        <p>🛡️ Google Workspace Zero-Retention 안심 보증</p>
        <p>데이터는 본인 소유의 구글 드라이브/스프레드시트에만 보관됩니다.</p>
      </footer>
    </div>
  );
}

export default function MobileSheetWebAppPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-xs">
          대장 불러오는 중...
        </div>
      }
    >
      <MobileSheetWebAppContent />
    </Suspense>
  );
}
