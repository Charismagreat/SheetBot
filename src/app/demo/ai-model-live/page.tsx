"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface ModelProfile {
  id: string;
  assetKey: "minsu" | "jia" | "seoyeon";
  name: string;
  role: string;
  greeting: string;
  voiceTone: string;
  accentColor: string;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  minsu: {
    id: "model_minsu",
    assetKey: "minsu",
    name: "민수 (비즈니스 매니저)",
    role: "30대 스마트 비즈니스 매니저",
    greeting:
      "반갑습니다! 비즈니스 매니저 민수입니다. 궁금하신 솔루션 도입, 시트봇 자동화 연동에 대해 무엇이든 편하게 말씀해 주세요.",
    voiceTone: "Puck (명쾌하고 자신감 있는 톤)",
    accentColor: "from-blue-600 to-indigo-600",
  },
  jia: {
    id: "model_jia",
    assetKey: "jia",
    name: "지아 (브랜드 앰배서더)",
    role: "20대 후반 브랜드 앰배서더",
    greeting:
      "안녕하세요! 브랜드 앰배서더 지아입니다. 오늘 어떤 제품이나 서비스에 대해 상담받고 싶으신가요? 바로 안내해 드릴게요!",
    voiceTone: "Kore (밝고 친근한 톤)",
    accentColor: "from-purple-600 to-pink-600",
  },
  seoyeon: {
    id: "model_seoyeon",
    assetKey: "seoyeon",
    name: "서연 (전문 컨설턴트)",
    role: "20대 후반 전문 컨설턴트",
    greeting:
      "안녕하십니까, 전문 컨설턴트 서연입니다. 귀사의 업무 프로세스와 데이터 분석에 가장 최적화된 방안을 성심껏 컨설팅해 드리겠습니다.",
    voiceTone: "Aoede (지적이고 차분한 톤)",
    accentColor: "from-emerald-600 to-teal-600",
  },
};

function resolveModel(nameParam: string | null, voiceParam: string | null): ModelProfile {
  const lowerName = (nameParam || "").toLowerCase();
  const lowerVoice = (voiceParam || "").toLowerCase();

  if (lowerName.includes("민수") || lowerName.includes("minsu") || lowerVoice.includes("puck")) {
    return MODEL_PROFILES.minsu;
  }
  if (lowerName.includes("서연") || lowerName.includes("seoyeon") || lowerVoice.includes("aoede")) {
    return MODEL_PROFILES.seoyeon;
  }
  if (lowerName.includes("지아") || lowerName.includes("jia") || lowerVoice.includes("kore")) {
    return MODEL_PROFILES.jia;
  }
  return MODEL_PROFILES.minsu;
}

interface ChatMessage {
  id: string;
  sender: "user" | "model";
  text: string;
  time: string;
}

function LiveShowcaseContent() {
  const searchParams = useSearchParams();
  const nameParam = searchParams.get("name");
  const voiceParam = searchParams.get("voice");

  const model = resolveModel(nameParam, voiceParam);
  const displayName = nameParam || model.name;
  const displayVoice = voiceParam || model.voiceTone;

  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isMicOn, setIsMicOn] = useState<boolean>(false);
  const [modelState, setModelState] = useState<"idle" | "listening" | "speaking">("speaking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // 초기 인사 발화
  useEffect(() => {
    const initialMsg: ChatMessage = {
      id: `msg_init_${Date.now()}`,
      sender: "model",
      text: model.greeting,
      time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([initialMsg]);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utt = new SpeechSynthesisUtterance(model.greeting);
      utt.lang = "ko-KR";
      utt.onstart = () => setModelState("speaking");
      utt.onend = () => setModelState("idle");
      window.speechSynthesis.speak(utt);
    }
  }, [model.greeting]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      sender: "user",
      text: textToSend,
      time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setModelState("speaking");

    // AI 모델 시뮬레이션 응답
    setTimeout(() => {
      let replyText = `네, 질문해 주신 '${textToSend.slice(0, 20)}'에 대해 말씀드리겠습니다. 시트봇의 실시간 AI 에이전트는 구글 드라이브와 스프레드시트를 자동으로 동기화하여 언제 어디서나 안전하고 신속하게 처리해 드립니다.`;
      if (model.assetKey === "minsu") {
        replyText = `좋은 질문입니다! '${textToSend.slice(0, 20)}' 관련 비즈니스 프로세스는 시트봇의 자동 장부화 기능으로 즉각 해결하실 수 있습니다. 추가로 검토 필요하신 세부 스펙이 있으신가요?`;
      }

      const modelReply: ChatMessage = {
        id: `model_${Date.now()}`,
        sender: "model",
        text: replyText,
        time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, modelReply]);

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utt = new SpeechSynthesisUtterance(replyText);
        utt.lang = "ko-KR";
        utt.onstart = () => setModelState("speaking");
        utt.onend = () => setModelState("idle");
        window.speechSynthesis.speak(utt);
      } else {
        setTimeout(() => setModelState("idle"), 2500);
      }
    }, 900);
  };

  const currentImage =
    modelState === "speaking"
      ? `/assets/models/${model.assetKey}_front.jpg`
      : modelState === "listening"
      ? `/assets/models/${model.assetKey}_quarter.jpg`
      : `/assets/models/${model.assetKey}_front.jpg`;

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans select-none">
      {/* 상단 네비게이션 헤더 */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-2.5">
          <span className="text-xl">🎙️</span>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">
              {displayName} 실시간 음성 쇼케이스
            </h1>
            <p className="text-[10px] text-purple-400">
              Gemini Multimodal Live API WebSocket Stream
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
            className="text-[11px] bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-full hover:border-purple-400 transition"
          >
            🎭 3D 뷰어
          </Link>
          <span className="flex items-center space-x-1 text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>라이브 연결됨</span>
          </span>
        </div>
      </header>

      {/* 메인 뷰포트 (상단: 모델 라이브 비디오 아바타 / 하단: 실시간 대화창) */}
      <main className="flex-1 max-w-lg mx-auto w-full p-3 flex flex-col space-y-3">
        {/* 라이브 모델 비디오 스테이지 */}
        <div className="relative h-64 rounded-2xl overflow-hidden border border-purple-500/30 bg-black shadow-xl flex items-center justify-center">
          <img
            src={currentImage}
            alt={displayName}
            className={`h-full w-full object-cover transition-all duration-500 ${
              modelState === "speaking" ? "scale-105 brightness-105" : "scale-100 brightness-95"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

          {/* 모델 상태 뱃지 */}
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 flex items-center space-x-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                modelState === "speaking"
                  ? "bg-purple-400 animate-ping"
                  : modelState === "listening"
                  ? "bg-amber-400 animate-bounce"
                  : "bg-slate-400"
              }`}
            />
            <span className="text-[10px] text-white font-semibold">
              {modelState === "speaking"
                ? "🎙️ 발화 중..."
                : modelState === "listening"
                ? "👂 경청 중..."
                : "대기 상태 (Idle)"}
            </span>
          </div>

          {/* 보이스 톤 표시 */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-slate-300">
            <span className="bg-black/50 backdrop-blur px-2 py-0.5 rounded-md border border-white/10">
              보이스: {displayVoice}
            </span>
            <span className="text-purple-300 font-mono text-[10px]">
              지연시간: 120ms (Real-time)
            </span>
          </div>
        </div>

        {/* 실시간 대화 피드 */}
        <div className="flex-1 bg-slate-900/80 rounded-2xl border border-slate-800 p-3 overflow-y-auto max-h-[360px] flex flex-col space-y-2.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                  m.sender === "user"
                    ? "bg-purple-600 text-white rounded-br-none shadow-md"
                    : "bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/60"
                }`}
              >
                {m.text}
              </div>
              <span className="text-[9px] text-slate-500 mt-0.5 px-1">{m.time}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* 하단 입력 & 마이크 바 */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-2 flex items-center space-x-2">
          <button
            onClick={() => {
              const next = !isMicOn;
              setIsMicOn(next);
              if (next) {
                setModelState("listening");
              } else {
                setModelState("idle");
              }
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition ${
              isMicOn
                ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
            title={isMicOn ? "마이크 끄기" : "마이크 켜기"}
          >
            <span>{isMicOn ? "🔴" : "🎤"}</span>
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage(inputText);
            }}
            placeholder="모델에게 물어보세요 (예: 주요 기능이 뭐야?)"
            className="flex-1 bg-slate-950/70 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />

          <button
            onClick={() => handleSendMessage(inputText)}
            disabled={!inputText.trim()}
            className="bg-purple-600 disabled:bg-slate-800 text-white text-xs px-3.5 py-2 rounded-xl font-semibold border border-purple-500/50 disabled:border-slate-700 hover:bg-purple-500 transition"
          >
            전송
          </button>
        </div>
      </main>
    </div>
  );
}

export default function AiModelLivePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070B14] text-white flex items-center justify-center text-sm font-sans">
          🎙️ 실시간 음성 상담 세션 연결 중...
        </div>
      }
    >
      <LiveShowcaseContent />
    </Suspense>
  );
}
