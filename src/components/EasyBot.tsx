"use client";

import React, { useState, useEffect, useRef } from "react";
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

export default function EasyBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 초기 웰컴 메시지
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "bot",
          text: "안녕하세요! Google 스프레드시트 & Apps Script 전문 비서 **이지봇(EasyBot)**입니다. 🤖\n\n자동화 스크립트 작성, 트리거 설정, 구글 시트 고급 수식 등 무엇이든 편하게 질문해 주세요!",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
  }, [messages.length]);

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
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          role: "bot",
          text: `오류가 발생했습니다: ${err.message || "통신 실패"}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: "bot",
        text: "대화 내용이 초기화되었습니다. 새로운 질문을 입력해 주세요! 🚀",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // 마크다운 및 코드 블록 간이 파서
  const renderMessageContent = (text: string, msgId: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);

    return (
      <div className="space-y-2 text-xs leading-relaxed break-words">
        {parts.map((part, idx) => {
          if (part.startsWith("```") && part.endsWith("```")) {
            const lines = part.slice(3, -3).trim().split("\n");
            const lang = lines[0].trim().match(/^[a-zA-Z0-9]+$/) ? lines[0].trim() : "";
            const code = (lang ? lines.slice(1) : lines).join("\n");
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
                    onClick={() => copyToClipboard(code, codeKey)}
                    className="flex items-center gap-1 hover:text-white transition-colors"
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

  return (
    <>
      {/* 플로팅 단추 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-[9990] group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white rounded-full shadow-2xl hover:shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
          data-easybot-hint="이지봇: 클릭하여 스프레드시트 및 Apps Script 전문 AI 도우미와 실시간 대화를 나눕니다."
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-white animate-bounce" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
          </div>
          <span className="text-xs font-extrabold tracking-wide">이지봇 AI</span>
        </button>
      )}

      {/* 대화창 모달 */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[9990] w-[400px] max-w-[calc(100vw-32px)] h-[580px] max-h-[calc(100vh-64px)] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 p-4 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Bot className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold flex items-center gap-1.5">
                  <span>이지봇 (EasyBot)</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                    Live
                  </span>
                </h3>
                <p className="text-[10px] text-white/80 font-medium">
                  Apps Script & 시트 자동화 전문 AI 어시스턴트
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                title="대화 초기화"
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="닫기"
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
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
                  className={`max-w-[82%] rounded-2xl p-3 shadow-sm ${
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
          <div className="p-2.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
            {SAMPLE_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[11px] font-semibold transition-colors text-left"
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
            className="p-3 bg-white border-t border-slate-100 flex items-center gap-2"
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
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-indigo-200"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
