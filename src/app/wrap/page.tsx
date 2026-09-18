'use client';

import React, { useState } from 'react';

export default function WrapPage() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{
    bridgeUrl: string;
    spreadsheetId: string;
    token: string;
    bridgePrompt: string;
    isNewSheet?: boolean;
  } | null>(null);
  const [copiedBridge, setCopiedBridge] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const executeWrap = async (targetUrl?: string) => {
    const finalUrl = (targetUrl !== undefined ? targetUrl : sheetUrl).trim();
    const isNew = !finalUrl || finalUrl === 'NEW_SHEET';

    setErrorMsg('');
    setIsLoading(true);
    setIsStartingNew(isNew);

    try {
      const res = await fetch('/api/projects/quick-wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: isNew ? 'NEW_SHEET' : finalUrl }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '래핑 중 오류가 발생했습니다.');
      }

      setResult({
        bridgeUrl: data.bridgeUrl,
        spreadsheetId: data.spreadsheetId,
        token: data.token,
        bridgePrompt: data.promptTemplate || (
          data.isNewSheet
            ? `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\n웹 주소: ${data.bridgeUrl}\n요구사항: 새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘.`
            : `아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:\n웹 주소: ${data.bridgeUrl}\n요구사항: 내 구글 시트의 헤더 구조와 데이터를 파악하고, 실무에 필요한 스프레드시트 자동화 메뉴와 기능을 주입해줘.`
        ),
        isNewSheet: Boolean(data.isNewSheet),
      });
    } catch (err: any) {
      setErrorMsg(err.message || '래핑 요청에 실패했습니다.');
    } finally {
      setIsLoading(false);
      setIsStartingNew(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeWrap(sheetUrl.trim() || 'NEW_SHEET');
  };

  const handleNewSheetClick = () => {
    executeWrap('NEW_SHEET');
  };

  const copyToClipboard = (text: string, type: 'bridge' | 'prompt') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        if (type === 'bridge') {
          setCopiedBridge(true);
          setTimeout(() => setCopiedBridge(false), 2000);
        } else {
          setCopiedPrompt(true);
          setTimeout(() => setCopiedPrompt(false), 2000);
        }
      });
    }
  };

  const openAntigravity = () => {
    if (!result) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(result.bridgePrompt).catch(() => {});
    }
    window.open('antigravity://', '_blank');
    alert('🚀 안티그라비티가 열렸습니다!\\n채팅창에 바로 [Ctrl + V]로 프롬프트를 붙여넣고 원하는 기능을 지시하세요.');
  };

  const resetForm = () => {
    setResult(null);
    setSheetUrl('');
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-indigo-500 selection:text-white">
      {/* 백그라운드 블러 효과 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            SheetBot Instant Wrapper
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Google 시트 초간편 AI 래퍼
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
            시트 주소가 없어도 즉시 래핑할 수 있습니다. 안티그라비티, Cursor, Claude Code가 시트를 제어할 수 있는 브릿지 주소를 즉시 발급합니다.
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/40">
          {!result ? (
            /* 입력 화면 */
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Google 스프레드시트 URL <span className="text-slate-500 font-normal lowercase">(선택)</span>
                  </label>
                  <span className="text-[11px] text-indigo-400/90 font-medium">시트 없이도 시작 가능</span>
                </div>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... (없으면 비워두세요)"
                  className="w-full px-4 py-3.5 bg-slate-950/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* 메인 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading && !isStartingNew ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>래핑 주소 발급 중...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ 3초 만에 래핑하기</span>
                  </>
                )}
              </button>

              {/* 구분선 */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-3 text-[11px] text-slate-500 font-medium">또는</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              {/* 시트 주소 없이 새 시트로 시작 버튼 */}
              <button
                type="button"
                onClick={handleNewSheetClick}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-slate-800/90 hover:bg-slate-700/90 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-200 font-bold text-xs rounded-xl border border-slate-700/80 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                {isLoading && isStartingNew ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>새 구글 시트 래핑 준비 중...</span>
                  </>
                ) : (
                  <>
                    <span>✨ 시트 주소 없이 새 시트로 즉시 시작</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* 완료 화면 (In-place) */
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="text-center pb-1">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-400 text-xl font-bold">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">
                  {result.isNewSheet ? '새 시트 래핑이 완료되었습니다!' : '래핑이 완료되었습니다!'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {result.isNewSheet
                    ? '아래 새 구글 시트를 열고, 프롬프트를 AI 에이전트에 전달하세요.'
                    : '아래 브릿지 주소 또는 프롬프트를 복사하여 AI 에이전트에 전달하세요.'}
                </p>
              </div>

              {/* 신규 시트인 경우 새 시트 열기 카드 */}
              {result.isNewSheet && (
                <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between gap-3 shadow-inner">
                  <div className="text-left">
                    <div className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                      <span>📄 새 구글 스프레드시트</span>
                      <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded font-medium">원클릭</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">구글의 빈 시트가 새 탭에서 즉시 열립니다.</div>
                  </div>
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg transition-all inline-flex items-center gap-1.5 shrink-0 shadow-md shadow-indigo-500/20 cursor-pointer"
                  >
                    <span>새 시트 열기</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              {/* 브릿지 URL */}
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 font-medium">
                  <span>안티그라비티 브릿지 주소</span>
                  <button
                    onClick={() => copyToClipboard(result.bridgeUrl, 'bridge')}
                    className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                  >
                    {copiedBridge ? '✓ 복사됨!' : '주소 복사'}
                  </button>
                </div>
                <div
                  onClick={() => copyToClipboard(result.bridgeUrl, 'bridge')}
                  className="p-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs font-mono text-indigo-300 break-all cursor-pointer hover:border-indigo-500/50 transition-colors select-all"
                >
                  {result.bridgeUrl}
                </div>
              </div>

              {/* 실행 액션 버튼들 */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={openAntigravity}
                  className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🚀 안티그라비티 바로 열기 (프롬프트 자동 복사)</span>
                </button>

                <button
                  onClick={() => copyToClipboard(result.bridgePrompt, 'prompt')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>📋 {copiedPrompt ? '✓ 지시문 복사 완료!' : 'AI 에이전트 지시문 복사하기'}</span>
                </button>
              </div>

              {/* 초기화 링크 */}
              <div className="pt-2 text-center border-t border-slate-800/80">
                <button
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  🔄 다른 구글 시트 래핑하기
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 미니멀 푸터 */}
        <div className="text-center mt-8 text-xs text-slate-600">
          Powered by SheetBot Engine &bull; Cloud Bridge API
        </div>
      </div>
    </div>
  );
}
