'use client';

import { apiFetch } from '@/lib/api';
import React, { useState, useEffect } from 'react';

interface TemplatePreset {
  title: string;
  desc: string;
  icon: string;
  prompt: string;
}

const TEMPLATE_PRESETS: Record<string, TemplatePreset> = {
  delivery: {
    title: '배송·송장 자동조회 대장',
    desc: 'CJ대한통운, 롯데, 한진, 우체국 등 택배 운송장 실시간 배송상태 추적 및 완료 자동 업데이트',
    icon: '📦',
    prompt: 'CJ대한통운, 우체국 등 주요 택배사의 운송장 번호를 기반으로 실시간 배송 상태를 자동 조회하고 시트에 반영하는 배송 관리 대장을 구축해줘.',
  },
  ocr: {
    title: '영수증·명함 스마트 OCR 대장',
    desc: '영수증, 세금계산서, 명함 이미지/PDF를 드라이브에 올리면 Gemini AI가 품목/금액/상호명을 자동 추출',
    icon: '🧾',
    prompt: '영수증 및 명함 이미지를 분석하여 상호명, 사업자번호, 일자, 공급가액, 부가세를 자동으로 표에 정리해주는 AI OCR 대장을 구축해줘.',
  },
  kakao: {
    title: '카카오 알림톡 자동 발송 대장',
    desc: '시트의 고객 전화번호와 주문 상태 변경에 맞춰 카카오 알림톡 또는 비상 SMS를 1초 만에 자동 발송',
    icon: '💬',
    prompt: '시트의 주문 상태가 변경되면 고객 전화번호로 카카오 알림톡 또는 SMS 안내 문자를 자동 발송하는 알림 연동 대장을 구축해줘.',
  },
  inventory: {
    title: '실시간 재고·단가 관리 대장',
    desc: '입출고 내역 실시간 집계, 안전재고 미달 시 자동 경고 알림 및 최신 원가/단가 자동 반영',
    icon: '📊',
    prompt: '입고와 출고 내역을 실시간 집계하여 현재고를 계산하고, 안전재고 미달 시 알림을 보내는 재고 관리 대장을 구축해줘.',
  },
};

export default function WrapPage() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingNew, setIsStartingNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplatePreset | null>(null);
  const [result, setResult] = useState<{
    bridgeUrl: string;
    spreadsheetId: string;
    token: string;
    bridgePrompt: string;
    projectName?: string;
  } | null>(null);
  const [copiedType, setCopiedType] = useState<'antigravity' | 'copy' | null>(null);

  // 클라이언트 로드 시 전역 핸들러 등록 및 tpl 쿼리 파라미터 감지
  useEffect(() => {
    (window as any).__reactSetResult = setResult;

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const tplParam = searchParams.get('tpl');
      if (tplParam && TEMPLATE_PRESETS[tplParam.toLowerCase()]) {
        setSelectedTemplate(TEMPLATE_PRESETS[tplParam.toLowerCase()]);
      }
    } catch {}
  }, []);

  const executeWrap = async (targetUrl?: string) => {
    if (isLoading || (typeof window !== 'undefined' && (window as any).__isWrapping)) return;
    if (typeof window !== 'undefined') (window as any).__isWrapping = true;

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
      const tplTitle = selectedTemplate ? selectedTemplate.title : '스마트 자동화 시트';
      const res = await apiFetch('/api/projects/quick-wrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrl: finalUrl,
          templateName: tplTitle,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '래핑 중 오류가 발생했습니다.');
      }

      const defaultPrompt = selectedTemplate
        ? `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\n웹 주소: ${data.bridgeUrl}\n목표 업무: ${selectedTemplate.title}\n세부 요구사항: ${selectedTemplate.prompt}`
        : `아래 웹 주소를 통해 새 구글 시트의 컬럼 구조와 자동화 스크립트를 처음부터 설계하고 주입해줘:\n웹 주소: ${data.bridgeUrl}\n요구사항: 새 구글 시트에 내 비즈니스에 맞는 시트 탭과 컬럼 헤더 구조를 설계하고, 필요한 자동화 기능과 Apps Script 코드를 즉시 주입해줘.`;

      const promptTemplate = data.promptTemplate || defaultPrompt;

      setResult({
        bridgeUrl: data.bridgeUrl,
        spreadsheetId: data.spreadsheetId || '',
        token: data.token || '',
        bridgePrompt: promptTemplate,
        projectName: data.projectName || tplTitle,
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
      if (typeof window !== 'undefined') (window as any).__isWrapping = false;
    }
  };

  // 🚀 안티그라비티 원클릭 열기
  const handleOpenAntigravity = async () => {
    const promptText = result?.bridgePrompt || (window as any).__currentPrompt || (
      `구글 시트 래핑 주소: ${result?.bridgeUrl || (window as any).__currentBridgeUrl}\n위 구글 시트 구조를 확인하고 원하는 자동화 기능을 주입해줘:\n[추가할 기능 입력]`
    );
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {}

    if (typeof window !== 'undefined') {
      window.open('antigravity://', '_blank');
    }

    setCopiedType('antigravity');
    setTimeout(() => setCopiedType(null), 4000);
  };

  const handleCopyPrompt = async () => {
    const promptText = result?.bridgePrompt || (window as any).__currentPrompt || '';
    if (!promptText) return;

    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedType('copy');
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = promptText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedType('copy');
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

  const resetAll = () => {
    setResult(null);
    setSheetUrl('');
    setErrorMsg('');
    setCopiedType(null);
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
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              SheetBot Instant Wrapper
            </div>
            <a
              href="/wrap/guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-bold transition-all shadow-sm group"
            >
              <span>📖 사용법 보기</span>
              <span className="text-slate-500 group-hover:translate-x-0.5 transition-transform text-[10px]">↗</span>
            </a>
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

        {/* 선택된 템플릿 안내 배너 */}
        {selectedTemplate && !result && (
          <div className="mb-5 p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/30 backdrop-blur-md shadow-lg shadow-indigo-950/20 flex items-start justify-between gap-3 animate-fadeIn">
            <div className="flex items-start gap-3">
              <span className="text-3xl p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">{selectedTemplate.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">⚡ 1초 실무 템플릿</span>
                  <h3 className="text-sm font-bold text-white">{selectedTemplate.title}</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{selectedTemplate.desc}</p>
                <div className="mt-2 text-[11px] text-indigo-300 font-medium">
                  👉 아래 &apos;3초 만에 래핑하기&apos; 또는 &apos;새 시트로 바로 시작&apos;을 누르면 이 템플릿의 설계 지침이 자동 적용됩니다.
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-slate-400 hover:text-white p-1 text-xs rounded-md hover:bg-slate-800 transition-colors"
              title="템플릿 해제"
            >
              ✕
            </button>
          </div>
        )}

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

            {/* 사용법 가이드 안내 링크 */}
            <div className="pt-2 text-center">
              <a
                href="/wrap/guide"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-300 transition-colors"
              >
                <span>💡 래핑이 처음이신가요?</span>
                <span className="font-semibold underline underline-offset-2">1분 사용법 가이드 보기 ↗</span>
              </a>
            </div>
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

              {/* [2] 🌟 듀얼 액션 버튼 영역 (안티그라비티 원클릭 + 복사하기) */}
              <div className="space-y-2.5">
                {/* 1단: 🚀 안티그라비티 원클릭 열기 메인 CTA 버튼 */}
                <button
                  type="button"
                  id="btn-open-antigravity"
                  onClick={() => {
                    if ((window as any).__openNativeAntigravity) (window as any).__openNativeAntigravity();
                    else handleOpenAntigravity();
                  }}
                  className="w-full py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg cursor-pointer active:scale-98 bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white shadow-purple-600/30 hover:shadow-xl hover:shadow-purple-600/35 hover:scale-[1.01]"
                >
                  <span className="text-base sm:text-lg">🚀</span>
                  <span id="btn-antigravity-text">{copiedType === 'antigravity' ? '프롬프트 복사 & 안티그라비티 실행됨!' : '안티그라비티 열기 및 자동화 시작'}</span>
                  <span className="text-xs opacity-70">↗</span>
                </button>

                {/* 안티그라비티 클릭 후 실시간 안내 말풍선 */}
                <div 
                  id="antigravity-copied-notice" 
                  className={`p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-[11px] text-purple-900 font-bold text-center ${copiedType === 'antigravity' ? 'block' : 'hidden'}`}
                >
                  ✨ 프롬프트가 클립보드에 자동 복사되었습니다! 안티그라비티 창에서 바로 <strong>[Ctrl + V]</strong>로 붙여넣으세요.
                </div>

                {/* 2단: 📋 일반 복사하기 서브 버튼 (Cursor, Claude Code 등) */}
                <button
                  type="button"
                  id="btn-copy-action"
                  onClick={() => {
                    if ((window as any).__copyNativePrompt) (window as any).__copyNativePrompt();
                    else handleCopyPrompt();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 hover:border-slate-300"
                >
                  <span id="btn-copy-icon">📋</span>
                  <span id="btn-copy-text">{copiedType === 'copy' ? '프롬프트가 복사되었습니다!' : '프롬프트만 복사하기 (Cursor · Claude Code 등)'}</span>
                </button>
              </div>

              {/* [3] 눈에 쏙 들어오는 3단계 사용 및 결과 확인 가이드 */}
              <div className="bg-slate-50 border-2 border-emerald-100 rounded-2xl p-4.5 space-y-3">
                <div className="font-extrabold text-xs text-emerald-950 flex items-center justify-between">
                  <span className="text-emerald-800 text-[13px]">💡 AI 에이전트 연동 및 결과 확인법</span>
                  <div className="flex items-center gap-2">
                    <a
                      href="/wrap/guide"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline underline-offset-2"
                    >
                      📖 상세 가이드 ↗
                    </a>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">30초 완성</span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  {/* 1단계 */}
                  <div className="flex items-start gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-xs">
                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="leading-relaxed text-slate-700">
                      위 <strong className="text-purple-700 font-extrabold">[🚀 안티그라비티 열기]</strong>를 누르면 프롬프트가 복사되고 앱이 자동 실행됩니다.<br />
                      <span className="text-[11px] text-slate-500">※ Cursor, Claude Code 사용자는 [프롬프트만 복사하기]를 누르시면 됩니다.</span>
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

  window.__openNativeAntigravity = function() {
    var text = window.__currentPrompt || window.__currentBridgeUrl;
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }

    try {
      window.open("antigravity://", "_blank");
    } catch(e) {}

    var btnTxt = document.getElementById("btn-antigravity-text");
    var noticeBox = document.getElementById("antigravity-copied-notice");

    if (btnTxt) btnTxt.innerText = "프롬프트 복사 & 안티그라비티 실행됨!";
    if (noticeBox) noticeBox.className = "p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-[11px] text-purple-900 font-bold text-center block";

    setTimeout(function() {
      if (btnTxt) btnTxt.innerText = "안티그라비티 열기 및 자동화 시작";
      if (noticeBox) noticeBox.className = "hidden";
    }, 4000);
  };

  window.__copyNativePrompt = function() {
    var text = window.__currentPrompt || window.__currentBridgeUrl;
    if (!text) return;

    var btnText = document.getElementById("btn-copy-text");
    var btnIcon = document.getElementById("btn-copy-icon");

    function onSuccess() {
      if (btnText) btnText.innerText = "✓ 프롬프트가 복사되었습니다!";
      if (btnIcon) btnIcon.innerText = "✓";
      setTimeout(function() {
        if (btnText) btnText.innerText = "프롬프트만 복사하기 (Cursor · Claude Code 등)";
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

  window.__isWrapping = false;

  window.__doWrap = function(mode) {
    if (window.__isWrapping) {
      console.log("[__doWrap] Already in progress, ignoring duplicate call.");
      return;
    }
    window.__isWrapping = true;

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

    apiFetch("/api/projects/quick-wrap", {
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
      window.__isWrapping = false;
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

