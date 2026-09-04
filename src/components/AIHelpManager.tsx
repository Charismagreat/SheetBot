"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, HelpCircle, X, Loader2, PowerOff } from "lucide-react";

export default function AIHelpManager() {
  const [mounted, setMounted] = useState(false);
  // 기본 상태: 꺼짐(false)
  const [isHelpEnabled, setIsHelpEnabled] = useState(false);
  const isHelpEnabledRef = useRef(isHelpEnabled);

  // 커서 인디케이터 상태
  const [cursorIndicator, setCursorIndicator] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // 도움말 팝업 상태
  const [helpInfo, setHelpInfo] = useState<{
    isOpen: boolean;
    hintKey: string;
    hintText: string;
    explanation: string;
    isLoading: boolean;
    error: string | null;
    x: number;
    y: number;
  }>({
    isOpen: false,
    hintKey: "",
    hintText: "",
    explanation: "",
    isLoading: false,
    error: null,
    x: 0,
    y: 0,
  });

  const helpInfoRef = useRef(helpInfo);
  const hoverTimerRef = useRef<any>(null);
  const leaveTimerRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      // 기본값은 꺼진 상태(false), 오직 'true'로 명시 저장된 경우에만 켬
      const saved = localStorage.getItem("sheetbot_ai_help_enabled");
      const enabled = saved === "true";
      setIsHelpEnabled(enabled);
      isHelpEnabledRef.current = enabled;

      const handleToggle = (e: any) => {
        const nextState = e.detail?.enabled ?? !isHelpEnabledRef.current;
        setIsHelpEnabled(nextState);
        isHelpEnabledRef.current = nextState;
        if (!nextState) {
          setHelpInfo((prev) => ({ ...prev, isOpen: false }));
          setCursorIndicator((prev) => ({ ...prev, visible: false }));
        }
      };

      window.addEventListener("sheetbot-ai-help-toggle", handleToggle);
      return () => {
        window.removeEventListener("sheetbot-ai-help-toggle", handleToggle);
      };
    }
  }, []);

  useEffect(() => {
    helpInfoRef.current = helpInfo;
  }, [helpInfo]);

  useEffect(() => {
    isHelpEnabledRef.current = isHelpEnabled;
  }, [isHelpEnabled]);

  const disableHelpPermanently = () => {
    setIsHelpEnabled(false);
    isHelpEnabledRef.current = false;
    setHelpInfo((prev) => ({ ...prev, isOpen: false }));
    setCursorIndicator((prev) => ({ ...prev, visible: false }));
    if (typeof window !== "undefined") {
      localStorage.setItem("sheetbot_ai_help_enabled", "false");
      window.dispatchEvent(
        new CustomEvent("sheetbot-ai-help-toggle", { detail: { enabled: false } })
      );
    }
  };

  // 마우스 이벤트 리스너
  useEffect(() => {
    if (!mounted) return;

    const handleMouseOver = (e: MouseEvent) => {
      if (!isHelpEnabledRef.current) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      // 팝업 내부 마우스 진입 시 닫기 타이머 취소
      if (target.closest("#sheetbot-ai-help-popup")) {
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current);
          leaveTimerRef.current = null;
        }
        return;
      }

      const hintElem = target.closest("[data-easybot-hint]") as HTMLElement;
      if (!hintElem) return;

      const rawHint = hintElem.getAttribute("data-easybot-hint") || "";
      if (!rawHint) return;

      const colonIdx = rawHint.indexOf(":");
      const hintKey = colonIdx !== -1 ? rawHint.substring(0, colonIdx).trim() : rawHint.trim();
      const hintVal = colonIdx !== -1 ? rawHint.substring(colonIdx + 1).trim() : rawHint;

      setCursorIndicator({
        visible: true,
        x: e.clientX,
        y: e.clientY,
      });

      if (helpInfoRef.current.isOpen && helpInfoRef.current.hintKey === hintKey) {
        if (leaveTimerRef.current) {
          clearTimeout(leaveTimerRef.current);
          leaveTimerRef.current = null;
        }
        return;
      }

      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }

      const clientX = e.clientX;
      const clientY = e.clientY;

      // 0.8초 호버 시 팝업 오픈 및 API 요청
      hoverTimerRef.current = setTimeout(async () => {
        setHelpInfo({
          isOpen: true,
          hintKey,
          hintText: hintVal,
          explanation: "",
          isLoading: true,
          error: null,
          x: Math.min(clientX + 16, window.innerWidth - 380),
          y: Math.min(clientY + 16, window.innerHeight - 200),
        });

        try {
          const res = await fetch("/api/ai/contextual-help", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hintKey,
              hintText: hintVal,
              pagePath: window.location.pathname,
            }),
          });
          const data = await res.json();
          if (data.success) {
            setHelpInfo((prev) => ({
              ...prev,
              explanation: data.explanation,
              isLoading: false,
            }));
          } else {
            throw new Error(data.error || "도움말 생성 실패");
          }
        } catch (err: any) {
          setHelpInfo((prev) => ({
            ...prev,
            explanation: hintVal || "해당 기능에 대한 자동화 설정 및 관리 옵션입니다.",
            isLoading: false,
          }));
        }
      }, 800);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isHelpEnabledRef.current) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      if (target.closest("#sheetbot-ai-help-popup")) {
        setCursorIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const hintElem = target.closest("[data-easybot-hint]");
      if (hintElem) {
        setCursorIndicator({
          visible: true,
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setCursorIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!isHelpEnabledRef.current) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      const hintElem = target.closest("[data-easybot-hint]");
      if (hintElem) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        setCursorIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));

        // 팝업 닫기 유예 타이머 (1.2초)
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = setTimeout(() => {
          setHelpInfo((prev) => ({ ...prev, isOpen: false }));
        }, 1200);
      }
    };

    window.addEventListener("mouseover", handleMouseOver);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);

    return () => {
      window.removeEventListener("mouseover", handleMouseOver);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
    };
  }, [mounted]);

  if (!mounted || !isHelpEnabled) return null;

  return (
    <>
      {/* 1. 마우스 커서 옆 인디케이터 배지 */}
      {cursorIndicator.visible && !helpInfo.isOpen && (
        <div
          className="fixed pointer-events-none z-[9999] px-2 py-0.5 rounded-full bg-indigo-600/90 text-white text-[11px] font-bold shadow-lg flex items-center gap-1 backdrop-blur-sm transition-transform duration-75"
          style={{
            left: `${cursorIndicator.x + 14}px`,
            top: `${cursorIndicator.y + 14}px`,
          }}
        >
          <Sparkles className="w-3 h-3 text-amber-300 animate-spin" />
          <span>AI 도움말</span>
        </div>
      )}

      {/* 2. 도움말 팝업 카드 */}
      {helpInfo.isOpen && (
        <div
          id="sheetbot-ai-help-popup"
          className="fixed z-[10000] w-[350px] bg-white rounded-2xl shadow-2xl border border-indigo-100 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: `${helpInfo.x}px`,
            top: `${helpInfo.y}px`,
          }}
          onMouseEnter={() => {
            if (leaveTimerRef.current) {
              clearTimeout(leaveTimerRef.current);
              leaveTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = setTimeout(() => {
              setHelpInfo((prev) => ({ ...prev, isOpen: false }));
            }, 800);
          }}
        >
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-4 py-3 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <span className="text-xs font-bold truncate max-w-[220px]">
                {helpInfo.hintKey || "AI 도움말"}
              </span>
            </div>
            <button
              onClick={() => setHelpInfo((prev) => ({ ...prev, isOpen: false }))}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 본문 */}
          <div className="p-4 space-y-3">
            {helpInfo.isLoading ? (
              <div className="py-4 flex flex-col items-center justify-center gap-2 text-indigo-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs font-semibold text-slate-500">AI 설명 분석 중...</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line">
                  {helpInfo.explanation}
                </p>

                {/* 하단 제어 툴바 */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <button
                    onClick={disableHelpPermanently}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    title="상단 네비바에서 언제든 다시 켤 수 있습니다"
                  >
                    <PowerOff className="w-3 h-3" />
                    <span>도움말 끄기</span>
                  </button>

                  <span className="text-[10px] text-slate-400 font-semibold">
                    이지데스크 AI Caller
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
