'use client';

import React, { useState, useEffect } from 'react';

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
    projectName?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // 클라이언트 로드 시 전역 핸들러 등록 (하이드레이션 여부와 무관하게 100% 작동)
  useEffect(() => {
    (window as any).__reactSetResult = setResult;
  }, []);

  const executeWrap = async (targetUrl?: string) => {
    const inputEl = document.getElementById('sheet-url-input') as HTMLInputElement | null;
    const currentInput = inputEl ? inputEl.value : sheetUrl;
    let finalUrl = (targetUrl !== undefined ? targetUrl : currentInput).trim();

    if (!finalUrl || finalUrl === 'NEW_SHEET') {
      finalUrl = 'https://docs.google.com/spreadsheets/create';
    }

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
          templateName: '스마트 자동화 시트',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '래핑 중 오류가 발생했습니다.');
      }

      const promptTemplate = data.promptTemplate || (
        `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\n웹 주소: ${data.bridgeUrl}\n요구사항: 새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘.`
      );

      setResult({
        bridgeUrl: data.bridgeUrl,
        spreadsheetId: data.spreadsheetId || '',
        token: data.token || '',
        bridgePrompt: promptTemplate,
        projectName: data.projectName || '스마트 자동화 시트',
      });

      // 네이티브 DOM 동기화
      if (typeof window !== 'undefined' && (window as any).__showNativeResult) {
        (window as any).__showNativeResult(data.bridgeUrl, promptTemplate, data.projectName || '스마트 자동화 시트');
      }
    } catch (err: any) {
      console.error('[quick-wrap error]', err);
      const msg = err.message || '래핑 요청에 실패했습니다.';
      setErrorMsg(msg);
      if (typeof window !== 'undefined' && (window as any).__showNativeError) {
        (window as any).__showNativeError(msg);
      }
    } finally {
      setIsLoading(false);
      setIsStartingNew(false);
    }
  };

  const handleCopyPrompt = async () => {
    const promptText = result?.bridgePrompt || (window as any).__currentPrompt || '';
    if (!promptText) return;

    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = promptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const resetAll = () => {
    setResult(null);
    setSheetUrl('');
    setErrorMsg('');
    setCopied(false);
    if (typeof window !== 'undefined' && (window as any).__resetNativeWrap) {
      (window as any).__resetNativeWrap();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-indigo-500 selection:text-white">
      {/* 백그라운드 블러 효과 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg">
        {/* 상단 헤더 */}
        <div id="wrap-page-header" className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            SheetBot Instant Wrapper
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Google 시트 초간편 AI 래퍼
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
            <a
              href="https://docs.google.com/spreadsheets/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors"
            >
              구글 시트
            </a>
            에 시트봇을 래핑(감싸기)하세요.<br />
            래핑된 주소를 복사한 후<br />
            바이브코딩 도구(
            <a
              href="https://antigravity.google/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors"
            >
              안티그라비티
            </a>
            )에 붙여넣고 자연어로 자동화 하세요.
          </p>
        </div>

        {/* 폼 카드 (초기 표시) */}
        <div 
          id="wrap-form-box" 
          className={`bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/40 ${result ? 'hidden' : 'block'}`}
        >
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
                defaultValue=""
                placeholder="https://docs.google.com/spreadsheets/d/... (없으면 비워두세요)"
                className="w-full px-4 py-3.5 bg-slate-950/70 border border-slate-700 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if ((window as any).__doWrap) (window as any).__doWrap('URL');
                    else executeWrap();
                  }
                }}
              />
            </div>

            <div id="native-error-box" className={`p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 ${errorMsg ? 'block' : 'hidden'}`}>
              ⚠️ <span id="native-error-msg">{errorMsg}</span>
            </div>

            {/* 메인 버튼: 3초 만에 래핑하기 */}
            <button
              type="button"
              id="btn-main-wrap"
              onClick={() => {
                if ((window as any).__doWrap) (window as any).__doWrap('URL');
                else executeWrap();
              }}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span id="btn-main-text">⚡ 3초 만에 래핑하기</span>
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
              onClick={() => {
                if ((window as any).__doWrap) (window as any).__doWrap('NEW_SHEET');
                else executeWrap('NEW_SHEET');
              }}
              className="w-full py-3.5 px-4 bg-slate-800/90 hover:bg-slate-700/90 hover:border-indigo-500/50 text-indigo-300 hover:text-indigo-200 font-bold text-xs sm:text-sm rounded-2xl border border-slate-700/80 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <span id="btn-new-text">✨ 시트 주소 없이 새 시트로 즉시 시작</span>
            </button>
          </div>
        </div>

        {/* 결과 팝업창 (모달 다이얼로그): 사용자 요청 팝업창 구조 */}
        <div
          id="wrap-modal-overlay"
          className="fixed inset-0 z-50 items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs transition-opacity"
          style={result ? { display: 'flex' } : { display: 'none' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if ((window as any).__closeNativeModal) (window as any).__closeNativeModal();
              else resetAll();
            }
          }}
        >
          <div
            id="wrap-modal-card"
            className="bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-7 max-w-lg w-full relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 우측 상단 닫기 (X) 버튼 */}
            <button
              type="button"
              id="btn-close-modal"
              onClick={() => {
                if ((window as any).__closeNativeModal) (window as any).__closeNativeModal();
                else resetAll();
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              title="닫기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 상단 헤더 */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 pr-8">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    내 구글 시트 래핑 완료!
                  </h3>
                  <span 
                    id="res-badge-name" 
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200"
                  >
                    {result?.projectName || '스마트 자동화 시트'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  안티그라비티, Cursor, Claude Code 등에 전달할 <strong className="text-slate-700">전용 래핑 주소</strong>가 발급되었습니다.
                </p>
              </div>
            </div>

            {/* 본문 콘텐츠 */}
            <div className="py-5 space-y-5 text-left">
              {/* [1] 발급된 래핑 주소 표시 박스 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                    <span className="text-emerald-600">🔗</span>
                    <span>발급된 래핑 주소</span>
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    연결 준비 완료
                  </span>
                </div>

                <div
                  id="res-bridge-url-box"
                  onClick={() => {
                    if ((window as any).__copyNativePrompt) (window as any).__copyNativePrompt();
                    else handleCopyPrompt();
                  }}
                  className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 cursor-pointer hover:border-emerald-500/60 transition-colors"
                  title="클릭하여 복사"
                >
                  <div
                    id="res-bridge-url"
                    className="font-mono text-xs text-emerald-400 break-all select-all leading-relaxed"
                  >
                    {result?.bridgeUrl || 'https://sheetbot.cloud/api/agent/gas-bridge?token=...'}
                  </div>
                </div>
              </div>

              {/* [2] 🌟 눈에 확 띄는 초대형 메인 복사하기 버튼 */}
              <button
                type="button"
                id="btn-copy-action"
                onClick={() => {
                  if ((window as any).__copyNativePrompt) (window as any).__copyNativePrompt();
                  else handleCopyPrompt();
                }}
                className="w-full py-4 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg cursor-pointer active:scale-98 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30 hover:shadow-xl hover:shadow-emerald-600/35 hover:scale-[1.01]"
              >
                <span id="btn-copy-icon">📋</span>
                <span id="btn-copy-text">{copied ? '래핑 주소가 복사되었습니다!' : '래핑 주소 복사하기'}</span>
              </button>

              {/* [3] 눈에 쏙 들어오는 3단계 사용 및 결과 확인 가이드 */}
              <div className="bg-slate-50 border-2 border-emerald-100 rounded-2xl p-4.5 space-y-3">
                <div className="font-extrabold text-xs text-emerald-950 flex items-center justify-between">
                  <span className="text-emerald-800 text-[13px]">💡 AI 에이전트 연동 및 결과 확인법</span>
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">30초 완성</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* 1단계 */}
                  <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="leading-relaxed text-slate-700">
                      위 <strong className="text-emerald-700 font-extrabold">[래핑 주소 복사하기]</strong> 버튼을 누릅니다.
                    </div>
                  </div>

                  {/* 2단계 */}
                  <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="leading-relaxed text-slate-700">
                      <strong className="text-slate-900">안티그라비티, Cursor, Claude Code</strong> 등 사용 중인 AI 채팅창에 붙여넣고, 원하는 기능을 적어 전송합니다.<br />
                      <span className="text-[11px] text-slate-400">예시: &quot;매일 아침 8시 발주서 받아와줘&quot;, &quot;신규 주문 시 문자 발송해줘&quot;</span>
                    </div>
                  </div>

                  {/* 3단계 */}
                  <div className="flex items-start gap-2.5 bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </span>
                    <div className="leading-relaxed text-slate-800">
                      <strong className="text-emerald-900 font-extrabold">[시트에서 결과 확인]</strong><br />
                      AI가 코드를 주입한 후 내 <strong className="text-slate-900">구글 시트를 새로고침(F5)</strong>하면,<br />
                      상단에 <strong className="text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200">🚀 SheetBot 메뉴</strong>가 자동 생성되어 바로 실행할 수 있습니다!
                    </div>
                  </div>
                </div>

                {/* 호환 안내 팁 */}
                <div className="text-center pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium bg-slate-100/90 px-2.5 py-1 rounded-full border border-slate-200/60">
                    <span>✨</span>
                    Antigravity · Cursor · Claude Code · Windsurf 완벽 호환
                  </span>
                </div>
              </div>

              {/* 하단 다시 래핑하기 링크 */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  id="btn-reset-wrap"
                  onClick={() => {
                    if ((window as any).__closeNativeModal) (window as any).__closeNativeModal();
                    else resetAll();
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold hover:underline cursor-pointer"
                >
                  🔄 다른 구글 시트 래핑하기 (닫기)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center mt-8 text-xs text-slate-600">
          Powered by SheetBot Engine &bull; Cloud Bridge API
        </div>
      </div>

      {/* 브라우저 네이티브 무적 스크립트: React 하이드레이션 여부와 100% 무관하게 즉각 발화 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  window.__currentBridgeUrl = "";
  window.__currentPrompt = "";

  window.__showNativeError = function(msg) {
    var errBox = document.getElementById("native-error-box");
    var errMsg = document.getElementById("native-error-msg");
    if (errBox && errMsg) {
      errMsg.innerText = msg;
      errBox.className = "p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 block";
    }
  };

  window.__showNativeResult = function(bridgeUrl, promptTemplate, projectName) {
    window.__currentBridgeUrl = bridgeUrl;
    window.__currentPrompt = promptTemplate;

    var modalOverlay = document.getElementById("wrap-modal-overlay");
    var urlEl = document.getElementById("res-bridge-url");
    var badgeEl = document.getElementById("res-badge-name");

    if (urlEl) urlEl.innerText = bridgeUrl;
    if (badgeEl && projectName) badgeEl.innerText = projectName;

    if (modalOverlay) {
      modalOverlay.style.display = "flex";
    }
  };

  window.__closeNativeModal = function() {
    var modalOverlay = document.getElementById("wrap-modal-overlay");
    if (modalOverlay) modalOverlay.style.display = "none";
  };

  window.__resetNativeWrap = function() {
    window.__closeNativeModal();
    var errBox = document.getElementById("native-error-box");
    var inputEl = document.getElementById("sheet-url-input");

    if (errBox) errBox.className = "p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 hidden";
    if (inputEl) inputEl.value = "";

    var btnMainText = document.getElementById("btn-main-text");
    var btnNewText = document.getElementById("btn-new-text");
    if (btnMainText) btnMainText.innerText = "⚡ 3초 만에 래핑하기";
    if (btnNewText) btnNewText.innerText = "✨ 시트 주소 없이 새 시트로 즉시 시작";

    var btnMain = document.getElementById("btn-main-wrap");
    var btnNew = document.getElementById("btn-new-sheet-wrap");
    if (btnMain) btnMain.disabled = false;
    if (btnNew) btnNew.disabled = false;
  };

  window.__copyNativePrompt = function() {
    var text = window.__currentPrompt || window.__currentBridgeUrl;
    if (!text) return;

    var btnText = document.getElementById("btn-copy-text");
    var btnIcon = document.getElementById("btn-copy-icon");

    function onSuccess() {
      if (btnText) btnText.innerText = "✓ 래핑 주소가 복사되었습니다!";
      if (btnIcon) btnIcon.innerText = "✓";
      setTimeout(function() {
        if (btnText) btnText.innerText = "래핑 주소 복사하기";
        if (btnIcon) btnIcon.innerText = "📋";
      }, 2500);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(function() {
        fallbackCopy(text, onSuccess);
      });
    } else {
      fallbackCopy(text, onSuccess);
    }
  };

  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      if (cb) cb();
    } catch (e) {
      alert("주소: " + text);
    }
    document.body.removeChild(ta);
  }

  window.__doWrap = function(mode) {
    var input = document.getElementById("sheet-url-input");
    var currentUrl = (input ? input.value : "").trim();
    var isNew = mode === "NEW_SHEET" || !currentUrl;
    var finalUrl = isNew ? "https://docs.google.com/spreadsheets/create" : currentUrl;

    var btnMain = document.getElementById("btn-main-wrap");
    var btnNew = document.getElementById("btn-new-sheet-wrap");
    var btnMainText = document.getElementById("btn-main-text");
    var btnNewText = document.getElementById("btn-new-text");
    var errBox = document.getElementById("native-error-box");

    if (errBox) errBox.className = "hidden";

    if (mode === "NEW_SHEET") {
      if (btnNewText) btnNewText.innerText = "⚡ 새 시트 래핑 발급 중...";
      if (btnNew) btnNew.disabled = true;
    } else {
      if (btnMainText) btnMainText.innerText = "⚡ 래핑 주소 발급 중...";
      if (btnMain) btnMain.disabled = true;
    }

    fetch("/api/projects/quick-wrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetUrl: finalUrl,
        templateName: "스마트 자동화 시트"
      })
    })
    .then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok || !data.success) {
          throw new Error(data.error || "래핑 처리 중 오류가 발생했습니다.");
        }
        return data;
      });
    })
    .then(function(data) {
      var prompt = data.promptTemplate || (
        "아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\\n웹 주소: " + data.bridgeUrl + "\\n요구사항: 새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘."
      );
      window.__showNativeResult(data.bridgeUrl, prompt, data.projectName || "스마트 자동화 시트");

      if (window.__reactSetResult) {
        window.__reactSetResult({
          bridgeUrl: data.bridgeUrl,
          spreadsheetId: data.spreadsheetId || "",
          token: data.token || "",
          bridgePrompt: prompt,
          projectName: data.projectName || "스마트 자동화 시트"
        });
      }
    })
    .catch(function(err) {
      window.__showNativeError(err.message || "래핑 요청에 실패했습니다.");
    })
    .finally(function() {
      if (btnMainText) btnMainText.innerText = "⚡ 3초 만에 래핑하기";
      if (btnNewText) btnNewText.innerText = "✨ 시트 주소 없이 새 시트로 즉시 시작";
      if (btnMain) btnMain.disabled = false;
      if (btnNew) btnNew.disabled = false;
    });
  };

  function bindDirectEvents() {
    var btnMain = document.getElementById("btn-main-wrap");
    var btnNew = document.getElementById("btn-new-sheet-wrap");
    var btnCopy = document.getElementById("btn-copy-action");
    var urlBox = document.getElementById("res-bridge-url-box");
    var btnReset = document.getElementById("btn-reset-wrap");
    var btnClose = document.getElementById("btn-close-modal");
    var modalOverlay = document.getElementById("wrap-modal-overlay");

    if (btnMain) {
      btnMain.onclick = function(e) {
        if (e) e.preventDefault();
        window.__doWrap("URL");
      };
    }
    if (btnNew) {
      btnNew.onclick = function(e) {
        if (e) e.preventDefault();
        window.__doWrap("NEW_SHEET");
      };
    }
    if (btnCopy) {
      btnCopy.onclick = function(e) {
        if (e) e.preventDefault();
        window.__copyNativePrompt();
      };
    }
    if (urlBox) {
      urlBox.onclick = function(e) {
        if (e) e.preventDefault();
        window.__copyNativePrompt();
      };
    }
    if (btnReset) {
      btnReset.onclick = function(e) {
        if (e) e.preventDefault();
        window.__resetNativeWrap();
      };
    }
    if (btnClose) {
      btnClose.onclick = function(e) {
        if (e) e.preventDefault();
        window.__closeNativeModal();
      };
    }
    if (modalOverlay) {
      modalOverlay.onclick = function(e) {
        if (e.target === modalOverlay) {
          window.__closeNativeModal();
        }
      };
    }

    document.onkeydown = function(e) {
      if (e.key === "Escape") {
        window.__closeNativeModal();
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindDirectEvents);
  } else {
    bindDirectEvents();
  }
  setTimeout(bindDirectEvents, 100);
  setTimeout(bindDirectEvents, 500);
  setTimeout(bindDirectEvents, 1000);
})();
`,
        }}
      />
    </div>
  );
}

