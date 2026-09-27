"use client";

import React, { useState } from "react";
import { MessageSquare, Upload, CheckCircle2, AlertCircle, FileText, ArrowRight, ExternalLink } from "lucide-react";

interface KakaoChatImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: any) => void;
}

export function KakaoChatImportModal({ isOpen, onClose, onSuccess }: KakaoChatImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [myName, setMyName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError("카카오톡 대화 내용 내보내기 파일(.txt)을 선택해 주세요.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (myName.trim()) {
        formData.append("myName", myName.trim());
      }

      const res = await fetch("/api/user/messages/kakao/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "카카오톡 대화 가져오기에 실패했습니다.");
      }

      setResult(data);
      if (onSuccess) {
        onSuccess(data);
      }
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                카카오톡 대화 내용 가져오기
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  구간 덮어쓰기
                </span>
              </h3>
              <p className="text-xs text-slate-400">카톡 [대화 내보내기] 파일(.txt)을 시트에 완벽히 병합합니다.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* 바디 */}
        <div className="p-6 space-y-5">
          {/* 성공 결과 화면 */}
          {result ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-emerald-300">구글 시트 구간 덮어쓰기 반영 완료!</h4>
                  <p className="text-xs text-slate-300">
                    <span className="font-semibold text-white">[{result.chatRoomName}]</span> 채팅방의 대화가 성공적으로 동기화되었습니다.
                  </p>
                </div>
              </div>

              {/* 통계 요약 카드 */}
              <div className="grid grid-cols-3 gap-2.5 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-center">
                <div className="p-2">
                  <div className="text-[11px] text-slate-400 mb-1">총 대화</div>
                  <div className="text-base font-bold text-white">{result.totalCount}건</div>
                </div>
                <div className="p-2 border-x border-slate-800">
                  <div className="text-[11px] text-blue-400 mb-1">수신 / 발신</div>
                  <div className="text-sm font-bold text-slate-200">
                    <span className="text-blue-400">{result.inboundCount}</span> / <span className="text-emerald-400">{result.outboundCount}</span>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] text-amber-400 mb-1">교체된 기존행</div>
                  <div className="text-base font-bold text-amber-300">{result.replacedRowsCount}행</div>
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-800/40 p-3 rounded-lg space-y-1">
                <div>📅 <span className="text-slate-300">대화 기간:</span> {result.startTime} ~ {result.endTime}</div>
                <div>💡 <span className="text-slate-300">중복 방어:</span> 해당 기간의 기존 불완전 행을 덮어쓰고 최신 정본으로 재정렬했습니다.</div>
              </div>

              {result.spreadsheetUrl && (
                <a
                  href={result.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-900/30"
                >
                  📊 구글 시트에서 대화 대장 확인하기
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              <button
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                ➕ 다른 채팅방 대화 파일 추가 가져오기
              </button>
            </div>
          ) : (
            /* 파일 업로드 폼 화면 */
            <div className="space-y-4">
              {/* 파일 선택 드롭존 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  카카오톡 대화 내용 내보내기 텍스트 파일 (.txt)
                </label>
                <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl p-5 text-center transition bg-slate-950/40 cursor-pointer">
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    {file ? (
                      <div>
                        <p className="text-sm font-semibold text-white">{file.name}</p>
                        <p className="text-[11px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-slate-200">클릭하거나 파일을 여기로 드래그하세요</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">카카오톡 채팅방 ➔ 설정 ➔ 대화 내용 내보내기 (.txt)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 내 닉네임 입력 (선택) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  내 카카오톡 닉네임 <span className="text-slate-500 font-normal">(선택 사항)</span>
                </label>
                <input
                  type="text"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="예: 홍길동 (미입력 시 '나', '회원님'을 발신으로 자동 인식)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  내 닉네임을 적어주시면 단톡방에서도 내가 보낸 글을 정확하게 <b>[발신]</b>으로 분류합니다.
                </p>
              </div>

              {/* 멱등성 덮어쓰기 안내 박스 */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  🛡️ 스마트 구간 덮어쓰기 (Replace Window) 기술 탑재
                </div>
                <p className="text-[11px] leading-relaxed">
                  업로드된 파일의 <b>시작 일시부터 마지막 일시까지의 구간</b>에 대해 기존 시트의 동일 채팅방 행을 깨끗이 덮어씁니다. 다른 채팅방이나 이전 대화는 100% 보존되며 중복 대화가 원천 차단됩니다.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 실행 버튼 */}
              <button
                onClick={handleImport}
                disabled={!file || isUploading}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    대화 분석 및 시트 구간 덮어쓰기 진행 중...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    구글 시트에 카톡 대화 덮어쓰기 반영
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
