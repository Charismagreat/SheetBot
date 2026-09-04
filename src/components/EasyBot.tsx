"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Bot,
  Sparkles,
  X,
  Send,
  RotateCcw,
  Copy,
  Check,
  Code2,
  HelpCircle,
  Minimize2,
  Maximize2,
  ChevronDown,
  Move,
  RotateCcw as ResetIcon,
  Maximize,
  Minimize,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  time: string;
}

const SAMPLE_QUESTIONS = [
  "매일 아침 9시 특정 조건 행 이메일 발송",
  "시트 셀 수정 시 자동 타임스탬프 기록 (onEdit)",
  "두 시트 간 데이터 VLOOKUP 수식 예시",
  "스프레드시트 빈 행 일괄 삭제 스크립트",
];

type HealthStatus = "healthy" | "warning" | "error" | "loading";

interface BotHealthInfo {
  status: HealthStatus;
  message: string;
  latencyMs?: number;
  model?: string;
  isQuotaExceeded?: boolean;
}

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 340;
const MIN_HEIGHT = 440;

export default function EasyBot() {
  const { data: session, status: sessionStatus } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // 창 위치 및 크기 상태
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // 실시간 AI API 헬스 및 할당량 상태
  const [health, setHealth] = useState<BotHealthInfo>({
    status: "healthy",
    message: "정상 가동 중",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // 드래그 & 리사이즈 추적용 ref
  const dragRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    resizeDir: string | null;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    startWidth: number;
    startHeight: number;
  }>({
    isDragging: false,
    isResizing: false,
    resizeDir: null,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    startWidth: DEFAULT_WIDTH,
    startHeight: DEFAULT_HEIGHT,
  });

  // 초기 위치 계산 (화면 우측 하단 기본 배치 및 로컬스토리지 복원)
  const calculateDefaultPosition = useCallback((targetWidth = DEFAULT_WIDTH, targetHeight = DEFAULT_HEIGHT) => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    const padding = 24;
    const x = Math.max(padding, window.innerWidth - targetWidth - padding);
    const y = Math.max(padding, window.innerHeight - targetHeight - padding);
    return { x, y };
  }, []);

  // 로컬스토리지 저장 및 불러오기
  useEffect(() => {
    setMounted(true);
    checkHealth();

    // 저장된 크기 및 위치 복원
    try {
      const savedPos = localStorage.getItem("sheetbot_pos");
      const savedSize = localStorage.getItem("sheetbot_size");
      let w = DEFAULT_WIDTH;
      let h = DEFAULT_HEIGHT;

      if (savedSize) {
        const parsedSize = JSON.parse(savedSize);
        if (parsedSize.width && parsedSize.height) {
          w = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 32, parsedSize.width));
          h = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 32, parsedSize.height));
          setSize({ width: w, height: h });
        }
      }

      if (savedPos) {
        const parsedPos = JSON.parse(savedPos);
        if (typeof parsedPos.x === "number" && typeof parsedPos.y === "number") {
          // 화면 경계 체크
          const maxX = window.innerWidth - 60;
          const maxY = window.innerHeight - 60;
          const x = Math.max(10, Math.min(maxX, parsedPos.x));
          const y = Math.max(10, Math.min(maxY, parsedPos.y));
          setPosition({ x, y });
        } else {
          setPosition(calculateDefaultPosition(w, h));
        }
      } else {
        setPosition(calculateDefaultPosition(w, h));
      }
    } catch {
      setPosition(calculateDefaultPosition());
    }

    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [calculateDefaultPosition]);

  // 화면 리사이즈 시 창이 화면 밖으로 완전히 벗어나지 않도록 보정
  useEffect(() => {
    const handleWindowResize = () => {
      if (isMaximized) return;
      setPosition((prev) => {
        const maxX = Math.max(10, window.innerWidth - size.width - 10);
        const maxY = Math.max(10, window.innerHeight - size.height - 10);
        return {
          x: Math.min(prev.x, maxX),
          y: Math.min(prev.y, maxY),
        };
      });
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [size, isMaximized]);

  // 창 위치 및 크기 변경 시 로컬스토리지 저장
  const saveStateToStorage = (newPos: { x: number; y: number }, newSize: { width: number; height: number }) => {
    try {
      localStorage.setItem("sheetbot_pos", JSON.stringify(newPos));
      localStorage.setItem("sheetbot_size", JSON.stringify(newSize));
    } catch {}
  };

  // 마우스 드래그 시작 (헤더를 잡고 이동)
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    // 버튼 클릭 시에는 드래그 방지
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
      return;
    }
    if (isMaximized) return;

    e.preventDefault();
    dragRef.current = {
      ...dragRef.current,
      isDragging: true,
      isResizing: false,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 마우스 리사이즈 시작 (모서리/테두리 핸들을 잡고 크기 조절)
  const handleMouseDownResize = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMaximized) return;

    dragRef.current = {
      ...dragRef.current,
      isDragging: false,
      isResizing: true,
      resizeDir: direction,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
      startWidth: size.width,
      startHeight: size.height,
    };

    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 마우스 이동 핸들러 (이동 및 크기 계산)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const {
      isDragging,
      isResizing,
      resizeDir,
      startX,
      startY,
      startPosX,
      startPosY,
      startWidth,
      startHeight,
    } = dragRef.current;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (isDragging) {
      const maxX = Math.max(10, window.innerWidth - startWidth - 10);
      const maxY = Math.max(10, window.innerHeight - startHeight - 10);
      const newX = Math.max(10, Math.min(maxX, startPosX + deltaX));
      const newY = Math.max(10, Math.min(maxY, startPosY + deltaY));

      setPosition({ x: newX, y: newY });
    } else if (isResizing && resizeDir) {
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newPosX = startPosX;
      let newPosY = startPosY;

      const maxWidth = window.innerWidth - 32;
      const maxHeight = window.innerHeight - 32;

      // 동쪽 (우측)
      if (resizeDir.includes("e")) {
        newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth + deltaX));
      }
      // 서쪽 (좌측 - 위치 이동 동반)
      if (resizeDir.includes("w")) {
        const potentialWidth = startWidth - deltaX;
        if (potentialWidth >= MIN_WIDTH && potentialWidth <= maxWidth) {
          newWidth = potentialWidth;
          newPosX = startPosX + deltaX;
        }
      }
      // 남쪽 (하단)
      if (resizeDir.includes("s")) {
        newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, startHeight + deltaY));
      }
      // 북쪽 (상단 - 위치 이동 동반)
      if (resizeDir.includes("n")) {
        const potentialHeight = startHeight - deltaY;
        if (potentialHeight >= MIN_HEIGHT && potentialHeight <= maxHeight) {
          newHeight = potentialHeight;
          newPosY = startPosY + deltaY;
        }
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newPosX, y: newPosY });
    }
  }, []);

  // 마우스 떼기 핸들러 (드래그/리사이즈 종료 및 상태 저장)
  const handleMouseUp = useCallback(() => {
    dragRef.current.isDragging = false;
    dragRef.current.isResizing = false;
    dragRef.current.resizeDir = null;

    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);

    setPosition((pos) => {
      setSize((sz) => {
        saveStateToStorage(pos, sz);
        return sz;
      });
      return pos;
    });
  }, [handleMouseMove]);

  // 기본 위치/크기로 즉시 리셋
  const handleResetWindowLayout = () => {
    setIsMaximized(false);
    const defPos = calculateDefaultPosition(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    const defSize = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    setPosition(defPos);
    setSize(defSize);
    saveStateToStorage(defPos, defSize);
  };

  // 최대화 / 이전 크기 복원 토글
  const handleToggleMaximize = () => {
    if (isMaximized) {
      if (preMaxState) {
        setPosition({ x: preMaxState.x, y: preMaxState.y });
        setSize({ width: preMaxState.width, height: preMaxState.height });
      } else {
        handleResetWindowLayout();
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      });
      setPosition({ x: 16, y: 16 });
      setSize({
        width: window.innerWidth - 32,
        height: window.innerHeight - 32,
      });
      setIsMaximized(true);
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch("/api/easybot/health");
      const data = await res.json();
      if (data && data.success) {
        setHealth({
          status: data.status || "healthy",
          message: data.message || "정상 가동 중",
          latencyMs: data.latencyMs,
          model: data.model,
          isQuotaExceeded: data.isQuotaExceeded,
        });
      }
    } catch {
      setHealth((prev) => ({
        ...prev,
        status: "warning",
        message: "연결 확인 중",
      }));
    }
  };

  // 사용자별/게스트 대화 내역 불러오기 및 복원
  useEffect(() => {
    if (sessionStatus === "loading") return;

    let isSubscribed = true;

    const loadChatHistory = async () => {
      // 1. 로그인 회원의 경우 클라우드 DB에서 대화 내역 조회
      if (session?.user?.email) {
        try {
          const res = await fetch("/api/easybot/messages");
          const data = await res.json();
          if (isSubscribed && data?.success && Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(data.messages);
            setHistoryLoaded(true);
            return;
          }
        } catch (err) {
          console.warn("[EasyBot] Failed to load user chat history:", err);
        }
      } else {
        // 2. 비로그인 게스트인 경우 로컬스토리지에서 복원
        try {
          const guestHistory = localStorage.getItem("sheetbot_guest_messages");
          if (guestHistory) {
            const parsed = JSON.parse(guestHistory);
            if (isSubscribed && Array.isArray(parsed) && parsed.length > 0) {
              setMessages(parsed);
              setHistoryLoaded(true);
              return;
            }
          }
        } catch {}
      }

      // 3. 저장된 대화가 없으면 기본 환영 메시지 표시
      if (isSubscribed) {
        setMessages([
          {
            id: "welcome",
            role: "bot",
            text: "안녕하세요! Google 스프레드시트 & Apps Script 전문 비서 **시트봇 AI (SheetBot AI)**입니다. 🤖\n\n상단 바를 마우스로 잡고 창을 자유롭게 이동하거나, 테두리를 당겨 원하는 크기로 조절하실 수 있습니다.\n자동화 스크립트 작성, 트리거 설정, 구글 시트 고급 수식 등 무엇이든 편하게 질문해 주세요!",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        setHistoryLoaded(true);
      }
    };

    loadChatHistory();

    return () => {
      isSubscribed = false;
    };
  }, [session?.user?.email, sessionStatus]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, messages]);

  const handleSend = async (questionText?: string) => {
    const textToSend = (questionText || input).trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/easybot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: nextMessages.map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      const data = await res.json();
      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        role: "bot",
        text: data?.reply || "죄송합니다. 일시적인 오류로 답변을 불러오지 못했습니다.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const finalMessages = [...nextMessages, botMsg];
      setMessages(finalMessages);

      // 비로그인 게스트의 경우 로컬스토리지에 최근 대화 동기화
      if (!session?.user?.email) {
        try {
          localStorage.setItem("sheetbot_guest_messages", JSON.stringify(finalMessages.slice(-50)));
        } catch {}
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `bot_err_${Date.now()}`,
        role: "bot",
        text: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages([...nextMessages, errorMsg]);
    } finally {
      setLoading(false);
      checkHealth();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleReset = async () => {
    if (!confirm("대화 내역을 초기화하시겠습니까?")) return;

    setIsResetting(true);
    try {
      if (session?.user?.email) {
        await fetch("/api/easybot/messages", { method: "DELETE" }).catch(() => {});
      } else {
        localStorage.removeItem("sheetbot_guest_messages");
      }

      setMessages([
        {
          id: `welcome_reset_${Date.now()}`,
          role: "bot",
          text: "대화가 초기화되었습니다. 새로운 질문을 입력해 주세요!",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err) {
      console.error("[EasyBot] Reset failed:", err);
    } finally {
      setIsResetting(false);
    }
  };

  // 마크다운 코드 블록 및 텍스트 파싱 렌더링
  const renderMessageContent = (text: string, msgId: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-2 text-xs leading-relaxed break-words">
        {parts.map((part, idx) => {
          if (part.startsWith("```") && part.endsWith("```")) {
            const firstLineBreak = part.indexOf("\n");
            const lang = part.substring(3, firstLineBreak).trim();
            const code = part.substring(firstLineBreak + 1, part.length - 3);
            const codeKey = `${msgId}_code_${idx}`;

            return (
              <div
                key={codeKey}
                className="my-2 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 text-slate-100 font-mono text-[11px]"
              >
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1 font-semibold">
                    <Code2 className="w-3 h-3 text-emerald-400" />
                    {lang || "javascript"}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(code, codeKey)}
                    className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                  >
                    {copiedCodeId === codeKey ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">복사됨</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>코드 복사</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto whitespace-pre">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          // 일반 텍스트 라인 렌더링
          return (
            <p key={idx} className="whitespace-pre-line font-medium">
              {part}
            </p>
          );
        })}
      </div>
    );
  };

  if (!mounted) return null;

  return (
    <>
      {/* 플로팅 단추 */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            checkHealth();
          }}
          className="fixed bottom-6 right-6 z-[9990] group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white rounded-full shadow-2xl hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          data-easybot-hint={`시트봇 AI (${health.message}): 클릭하여 스프레드시트 및 Apps Script 전문 AI 도우미와 실시간 대화를 나눕니다.`}
          title={`시트봇 AI - ${health.message}${health.latencyMs ? ` (${health.latencyMs}ms)` : ""}`}
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-white animate-bounce" />
            {health.status === "healthy" && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse"
                title="AI 엔진 정상 가동 중"
              />
            )}
            {health.status === "warning" && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white animate-pulse"
                title={`주의: ${health.message}`}
              />
            )}
            {health.status === "error" && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-ping"
                title={`오류/한도초과: ${health.message}`}
              />
            )}
          </div>
          <span className="text-xs font-extrabold tracking-wide">시트봇 AI</span>
          {health.isQuotaExceeded && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500 text-white font-black animate-pulse">
              한도초과
            </span>
          )}
        </button>
      )}

      {/* 대화창 모달 (마우스 드래그 이동 및 크기 조절 지원) */}
      {isOpen && (
        <div
          ref={windowRef}
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
          }}
          className="fixed z-[9990] bg-white rounded-2xl shadow-2xl border border-slate-300/80 flex flex-col overflow-hidden animate-in fade-in duration-150 ring-1 ring-black/5"
        >
          {/* 상하좌우 및 모서리 리사이즈 핸들 (8방향) */}
          {!isMaximized && (
            <>
              {/* 테두리 핸들 */}
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "n")}
                className="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-20 hover:bg-indigo-500/20 transition-colors"
                title="높이 조절 (상단)"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "s")}
                className="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-20 hover:bg-indigo-500/20 transition-colors"
                title="높이 조절 (하단)"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "w")}
                className="absolute left-0 top-2 bottom-2 w-2 cursor-w-resize z-20 hover:bg-indigo-500/20 transition-colors"
                title="너비 조절 (좌측)"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "e")}
                className="absolute right-0 top-2 bottom-2 w-2 cursor-e-resize z-20 hover:bg-indigo-500/20 transition-colors"
                title="너비 조절 (우측)"
              />

              {/* 모서리 핸들 */}
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "nw")}
                className="absolute top-0 left-0 w-3.5 h-3.5 cursor-nw-resize z-30"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "ne")}
                className="absolute top-0 right-0 w-3.5 h-3.5 cursor-ne-resize z-30"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "sw")}
                className="absolute bottom-0 left-0 w-3.5 h-3.5 cursor-sw-resize z-30"
              />
              <div
                onMouseDown={(e) => handleMouseDownResize(e, "se")}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30 flex items-end justify-end p-0.5 group"
                title="창 크기 조절"
              >
                <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 group-hover:border-indigo-600 transition-colors" />
              </div>
            </>
          )}

          {/* 헤더 (마우스 드래그 이동 핸들 역할) */}
          <div
            onMouseDown={handleMouseDownHeader}
            className={`bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 p-3.5 text-white flex items-center justify-between shadow-sm select-none ${
              isMaximized ? "" : "cursor-grab active:cursor-grabbing"
            }`}
            title="헤더를 마우스로 잡고 드래그하면 원하는 위치로 이동할 수 있습니다."
          >
            <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                <Bot className="w-4 h-4 text-amber-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold flex items-center gap-1.5 truncate">
                  <span>시트봇 AI</span>
                  {health.status === "healthy" && (
                    <span
                      className="px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30 shrink-0"
                      title={health.message}
                    >
                      Live
                    </span>
                  )}
                  {health.status === "warning" && (
                    <span
                      className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold border border-amber-400/30 shrink-0"
                      title={health.message}
                    >
                      주의
                    </span>
                  )}
                  {health.status === "error" && (
                    <span
                      className="px-1.5 py-0.5 rounded-full bg-rose-400/20 text-rose-300 text-[10px] font-bold border border-rose-400/30 shrink-0"
                      title={health.message}
                    >
                      {health.isQuotaExceeded ? "한도초과" : "점검중"}
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-white/80 font-medium truncate max-w-[240px]">
                  {health.status === "healthy"
                    ? `드래그 이동 / 테두리 크기조절 (${health.model || "Gemini"})`
                    : health.message}
                </p>
              </div>
            </div>

            {/* 헤더 우측 제어 버튼들 */}
            <div className="flex items-center gap-1 shrink-0">
              {/* 기본 위치/크기 복원 버튼 */}
              <button
                type="button"
                onClick={handleResetWindowLayout}
                title="기본 위치 및 크기로 리셋"
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <Move className="w-3.5 h-3.5" />
              </button>

              {/* 최대화 / 복원 버튼 */}
              <button
                type="button"
                onClick={handleToggleMaximize}
                title={isMaximized ? "원래 크기로 복원" : "전체화면 최대화"}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                {isMaximized ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>

              {/* 대화 초기화 */}
              <button
                type="button"
                onClick={handleReset}
                title="대화 초기화"
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* 닫기 */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="닫기"
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI 한도 초과 또는 상태 경고 배너 */}
          {health.status === "error" && (
            <div className="bg-rose-50 border-b border-rose-200/80 px-4 py-2 text-[11px] text-rose-800 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5 font-bold">
                ⚠️ {health.message}
              </span>
              <span className="text-[10px] text-rose-600 font-medium">기본 지식 모드로 응답</span>
            </div>
          )}
          {health.status === "warning" && (
            <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 text-[11px] text-amber-800 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5 font-bold">
                💡 {health.message}
              </span>
              <a href="/dashboard/pricing" className="text-[10px] text-amber-900 underline font-extrabold hover:text-amber-700">
                토큰 충전 ➔
              </a>
            </div>
          )}

          {/* 대화 기억 및 세션 동기화 안내 배너 */}
          <div className="bg-slate-100/90 border-b border-slate-200/80 px-3 py-1.5 text-[11px] text-slate-600 flex items-center justify-between shrink-0">
            {session?.user?.email ? (
              <span className="flex items-center gap-1.5 font-medium text-slate-700 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-sm" />
                <span className="truncate">
                  대화 영구 보관 중: <strong className="text-indigo-600">{session.user.email}</strong>
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-slate-500 truncate">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-sm" />
                <span className="truncate">게스트 모드 (로그인 시 클라우드 영구 보관)</span>
              </span>
            )}
            {isResetting && (
              <span className="text-[10px] text-indigo-600 font-bold shrink-0 animate-pulse">
                초기화 중...
              </span>
            )}
          </div>

          {/* 메시지 리스트 */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-sm"
                      : "bg-white text-slate-800 border border-slate-200/70 rounded-tl-sm"
                  }`}
                >
                  {renderMessageContent(msg.text, msg.id)}
                  <span
                    className={`block text-[9px] mt-1.5 text-right font-medium ${
                      msg.role === "user" ? "text-indigo-200" : "text-slate-400"
                    }`}
                  >
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" />
                </div>
                <div className="bg-white text-slate-600 border border-slate-200/70 rounded-2xl rounded-tl-sm p-3 shadow-sm text-xs font-semibold flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.2s]" />
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.4s]" />
                  <span>답변을 작성하고 있습니다...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 추천 질문 칩 */}
          <div className="p-2.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {SAMPLE_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[11px] font-semibold transition-colors text-left cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* 입력창 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Apps Script 작성 또는 시트 수식을 물어보세요..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 border-none text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-indigo-200 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
