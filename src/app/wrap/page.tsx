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
    const inputVal = document.getElementById('sheet-url-input') as HTMLInputElement | null;
    const currentInput = inputVal ? inputVal.value : sheetUrl;
    let finalUrl = (targetUrl !== undefined ? targetUrl : currentInput).trim();
    
    if (!finalUrl || finalUrl === 'NEW_SHEET') {
      finalUrl = 'https://docs.google.com/spreadsheets/create';
    }
    setSheetUrl(finalUrl);
    if (inputVal) inputVal.value = finalUrl;

    const isNew = finalUrl.includes('spreadsheets/create') || finalUrl === 'NEW_SHEET';

    setErrorMsg('');
    setIsLoading(true);
    setIsStartingNew(isNew);

    try {
      const res = await fetch('/api/projects/quick-wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sheetUrl: finalUrl,
          templateName: '스마트 자동화 시트'
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '래핑 중 오류가 발생했습니다.');
      }

      setResult({
        bridgeUrl: data.bridgeUrl,
        spreadsheetId: data.spreadsheetId || '',
        token: data.token || '',
        bridgePrompt: data.promptTemplate || (
          `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\n웹 주소: ${data.bridgeUrl}\n요구사항: 새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘.`
        ),
        isNewSheet: Boolean(data.isNewSheet) || isNew,
      });
    } catch (err: any) {
      console.error('[quick-wrap error]', err);
      const msg = err.message || '래핑 요청에 실패했습니다.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
      setIsStartingNew(false);
    }
  };

  const handleMainWrap = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const currentInput = (document.getElementById('sheet-url-input') as HTMLInputElement)?.value || sheetUrl;
    executeWrap(currentInput.trim() || 'NEW_SHEET');
  };

  const handleNewSheetWrap = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
            /* 입력 화면 (순수 div 레이아웃으로 폼 충돌 100% 방지) */
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Google 스프레드시트 URL <span className="text-slate-500 font-normal lowercase">(선택)</span>
                  </label>
                  <span className="text-[11px] text-indigo-400/90 font-medium">시트 없이도 시작 가능</span>
                </div>
                <input
                  type="text"
                  id="sheet-url-input"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleMainWrap();
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/... (없으면 비워두세요)"
                  className="w-full px-4 py-3.5 bg-slate-950/70 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* 메인 버튼 */}
              <button
                type="button"
                id="btn-main-wrap"
                onClick={handleMainWrap}
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
                id="btn-new-sheet-wrap"
                onClick={handleNewSheetWrap}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-slate-800/90 hover:bg-slate-700/90 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-200 font-bold text-xs rounded-xl border border-slate-700/80 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
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
            </div>
          ) : (
            /* 완료 화면: QuickWrapSuccessModal과 100% 동일한 완성형 뷰 */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              {/* 상단 타이틀 */}
              <div className="text-left pb-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-white tracking-tight">
                    내 구글 시트 래핑 완료!
                  </h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    스마트 자동화 시트
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  안티그라비티, Cursor, Claude Code 등에 전달할 <strong className="text-slate-300">전용 래핑 주소</strong>가 발급되었습니다.
                </p>
              </div>

              {/* 발급된 래핑 주소 카드 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span>🔗</span>
                    <span>발급된 래핑 주소</span>
                  </span>
                  <span className="text-[10px] text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    연결 준비 완료
                  </span>
                </div>
                <div
                  onClick={() => copyToClipboard(result.bridgeUrl, 'bridge')}
                  className="p-3.5 bg-slate-950 rounded-xl border border-slate-700/80 font-mono text-xs text-emerald-400 break-all cursor-pointer hover:border-emerald-500/50 transition-colors select-all"
                  title="클릭하여 복사"
                >
                  {result.bridgeUrl}
                </div>
              </div>

              {/* 대형 메인 액션 버튼: 래핑 주소 복사하기 */}
              <button
                type="button"
                onClick={() => copyToClipboard(result.bridgePrompt, 'prompt')}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>📋</span>
                <span>{copiedPrompt ? '✓ 복사 완료!' : '래핑 주소 복사하기'}</span>
              </button>

              {/* 안티그라비티 바로 열기 보조 버튼 */}
              <button
                type="button"
                onClick={openAntigravity}
                className="w-full py-2.5 px-4 bg-indigo-600/90 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl border border-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <span>🚀 안티그라비티 바로 열기 (자동 복사)</span>
              </button>

              {/* AI 에이전트 연동 및 결과 확인법 (30초 완성 가이드) */}
              <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2 text-left">
                <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                  <span className="flex items-center gap-1.5">
                    <span>💡</span>
                    <span>AI 에이전트 연동 및 결과 확인법</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 font-medium">
                    30초 완성
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-300 pt-1">
                  <div className="flex items-start gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span>위 <strong className="text-white">[래핑 주소 복사하기]</strong> 버튼을 누릅니다.</span>
                  </div>

                  <div className="flex items-start gap-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <div><strong className="text-white">안티그라비티, Cursor, Claude Code</strong> 등 사용 중인 AI 채팅창에 붙여넣고, 원하는 기능을 적어 전송합니다.</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">예시: &quot;매일 아침 8시 발주서 받아와줘&quot;, &quot;신규 주문 시 문자 발송해줘&quot;</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-emerald-950/20 p-2 rounded-lg border border-emerald-500/20">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <strong className="text-emerald-300">[시트에서 결과 확인]</strong> AI가 코드를 주입한 후 구글 시트를 새로고침(F5)하면, 상단에 <strong className="text-white">🚀 SheetBot 메뉴</strong>가 자동 생성되어 바로 실행할 수 있습니다!
                    </div>
                  </div>
                </div>
              </div>

              {/* 하단 호환 뱃지 */}
              <div className="text-center pt-1 text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
                <span>✨</span>
                <span>Antigravity &bull; Cursor &bull; Claude Code &bull; Windsurf 완벽 호환</span>
              </div>

              {/* 다시 래핑하기 링크 */}
              <div className="pt-2 text-center border-t border-slate-800/80">
                <button
                  type="button"
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
