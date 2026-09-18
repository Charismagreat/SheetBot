'use client';

import React, { useState } from 'react';

export default function WrapPage() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{
    bridgeUrl: string;
    spreadsheetId: string;
    token: string;
    bridgePrompt: string;
  } | null>(null);
  const [copiedBridge, setCopiedBridge] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleWrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) {
      setErrorMsg('구글 스프레드시트 주소를 입력해 주세요.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/projects/quick-wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '래핑 중 오류가 발생했습니다.');
      }

      setResult({
        bridgeUrl: data.bridgeUrl,
        spreadsheetId: data.spreadsheetId,
        token: data.token,
        bridgePrompt: data.bridgePrompt || `구글 시트 래핑 주소: ${data.bridgeUrl}\\n\\n위 구글 시트에 다음 자동화 기능을 구현하고 즉시 주입해줘:\\n[추가할 기능 입력]`,
      });
    } catch (err: any) {
      setErrorMsg(err.message || '래핑 요청에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
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
            시트 주소를 입력하면 안티그라비티, Cursor, Claude Code가 시트를 제어할 수 있는 브릿지 주소를 즉시 발급합니다.
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/40">
          {!result ? (
            /* 입력 화면 */
            <form onSubmit={handleWrap} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Google 스프레드시트 URL
                </label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-4 py-3.5 bg-slate-950/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  ⚠️ {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
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

              <div className="pt-2 text-center">
                <span className="text-[11px] text-slate-500">
                  회원가입/로그인 불필요 &bull; 원본 데이터 100% 안전 보존
                </span>
              </div>
            </form>
          ) : (
            /* 완료 화면 (In-place) */
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="text-center pb-2">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-400 text-xl font-bold">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">래핑이 완료되었습니다!</h3>
                <p className="text-xs text-slate-400 mt-0.5">아래 브릿지 주소 또는 프롬프트를 복사하여 AI 에이전트에 전달하세요.</p>
              </div>

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
              <div className="space-y-2 pt-2">
                <button
                  onClick={openAntigravity}
                  className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🚀 안티그라비티 바로 열기 (자동 복사)</span>
                </button>

                <button
                  onClick={() => copyToClipboard(result.bridgePrompt, 'prompt')}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>📋 {copiedPrompt ? '✓ 프롬프트 복사 완료!' : 'AI 에이전트 지시문 복사하기'}</span>
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
