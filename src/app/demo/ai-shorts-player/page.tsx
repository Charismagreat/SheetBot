"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface ModelProfile {
  id: string;
  assetKey: "minsu" | "jia" | "seoyeon";
  name: string;
  role: string;
  defaultTopic: string;
  defaultScript: string;
  voiceTone: string;
  accentColor: string;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  minsu: {
    id: "model_minsu",
    assetKey: "minsu",
    name: "민수 (비즈니스 매니저)",
    role: "30대 스마트 비즈니스 매니저",
    defaultTopic: "시트봇(SheetBot) 올인원 업무 자동화 솔루션",
    defaultScript:
      "안녕하세요! 비즈니스 매니저 민수입니다. 복잡한 엑셀 장부와 통화 녹음, 영수증 정리에 지치셨나요? 이제 시트봇 하나로 사진 찍고 말만 하면 구글 시트에 실시간 자동 기록됩니다. 지금 바로 스마트한 업무 혁신을 경험해 보세요!",
    voiceTone: "Puck (명쾌하고 자신감 있는 톤)",
    accentColor: "from-blue-600 to-indigo-600",
  },
  jia: {
    id: "model_jia",
    assetKey: "jia",
    name: "지아 (브랜드 앰배서더)",
    role: "20대 후반 브랜드 앰배서더",
    defaultTopic: "프리미엄 라이프스타일 & 스마트 케어",
    defaultScript:
      "안녕하세요! 브랜드 앰배서더 지아입니다. 바쁜 일상 속에서도 놓칠 수 없는 특별한 가치! 시트봇과 함께라면 번거로운 관리는 사라지고 여러분만의 여유가 시작됩니다. 지금 특별 혜택을 확인해 보세요!",
    voiceTone: "Kore (밝고 친근한 톤)",
    accentColor: "from-purple-600 to-pink-600",
  },
  seoyeon: {
    id: "model_seoyeon",
    assetKey: "seoyeon",
    name: "서연 (전문 컨설턴트)",
    role: "20대 후반 전문 컨설턴트",
    defaultTopic: "전문 세무·법률 및 비즈니스 데이터 컨설팅",
    defaultScript:
      "반갑습니다. 전문 컨설턴트 서연입니다. 기업 경영에서 가장 중요한 것은 데이터의 정확성과 신속한 의사결정입니다. 시트봇의 강력한 AI 에이전트가 여러분의 비즈니스를 완벽히 서포트합니다.",
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

function ShortsPlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("id") || `aimodel_${Date.now()}`;
  const nameParam = searchParams.get("name");
  const voiceParam = searchParams.get("voice");
  const topicParam = searchParams.get("topic");
  const scriptParam = searchParams.get("script");

  const model = resolveModel(nameParam, voiceParam);
  const displayName = nameParam || model.name;
  const displayVoice = voiceParam || model.voiceTone;
  const displayTopic = topicParam || model.defaultTopic;
  const displayScript = scriptParam || model.defaultScript;

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [likes, setLikes] = useState<number>(128);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [motionScene, setMotionScene] = useState<"walk" | "front" | "quarter">("walk");

  const DURATION = 15; // 15초 쇼츠
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2600);
  };

  // TTS 음성 재생 설정
  const playSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const utt = new SpeechSynthesisUtterance(displayScript);
    utt.lang = "ko-KR";
    utt.rate = 1.05;

    // 보이스 톤에 맞춘 피치 미세 조정
    if (displayVoice.includes("Puck") || model.assetKey === "minsu") {
      utt.pitch = 0.95;
    } else if (displayVoice.includes("Aoede") || model.assetKey === "seoyeon") {
      utt.pitch = 1.1;
    } else {
      utt.pitch = 1.0;
    }

    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  };

  const stopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  // 재생 / 일시정지 제어
  useEffect(() => {
    if (isPlaying) {
      playSpeech();
      const interval = 100; // 0.1초 단위
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.1;
          if (next >= DURATION) {
            // 반복 재생 (루프)
            playSpeech();
            return 0;
          }
          return next;
        });
      }, interval);
    } else {
      stopSpeech();
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeech();
    };
  }, [isPlaying, isMuted, displayScript]);

  // 시간에 따른 진행률 및 씬 전환
  useEffect(() => {
    setProgress((currentTime / DURATION) * 100);
    if (currentTime < 5) {
      setMotionScene("walk");
    } else if (currentTime < 10) {
      setMotionScene("front");
    } else {
      setMotionScene("quarter");
    }
  }, [currentTime]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        stopSpeech();
        showToast("🔇 음소거되었습니다.");
      } else {
        showToast("🔊 소리가 켜졌습니다.");
        playSpeech();
      }
      return next;
    });
  };

  const handleLike = () => {
    if (hasLiked) {
      setLikes((v) => v - 1);
      setHasLiked(false);
    } else {
      setLikes((v) => v + 1);
      setHasLiked(true);
      showToast("❤️ 영상에 공감했습니다!");
    }
  };

  const handleShare = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      showToast("🔗 영상 링크가 클립보드에 복사되었습니다!");
    } else {
      showToast("주소창 URL을 복사하여 공유할 수 있습니다.");
    }
  };

  const handleDownloadNotice = () => {
    showToast("💾 구글 드라이브 보관함 및 구글 시트에 자동 보관되어 있습니다.");
  };

  const currentImage = `/assets/models/${model.assetKey}_${motionScene}.jpg`;

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col items-center justify-center font-sans select-none p-0 sm:p-4">
      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="fixed top-6 z-50 bg-slate-900/95 border border-purple-500/50 text-purple-200 text-xs px-4 py-2.5 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.4)] backdrop-blur-md animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* 9:16 세로형 쇼츠 컨테이너 */}
      <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[840px] sm:rounded-3xl overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.9)] border border-slate-800/80 flex flex-col justify-between">
        {/* 상단 프로그레스 바 (15초 타임라인) */}
        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 flex flex-col space-y-1 bg-gradient-to-b from-black/70 via-black/30 to-transparent">
          <div className="w-full bg-white/25 h-1 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 h-full transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 상단 헤더: 뒤로가기 & 엔진 뱃지 */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-2">
              <Link
                href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
                className="bg-black/40 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20 hover:bg-black/60 transition flex items-center space-x-1"
              >
                <span>🎭</span>
                <span className="text-[11px] font-medium">3D 스튜디오</span>
              </Link>
              <span className="bg-purple-600/80 backdrop-blur text-[10px] text-purple-100 px-2 py-0.5 rounded-full border border-purple-400/40 font-semibold tracking-tight">
                Veo 3 AI Shorts
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={toggleMute}
                className="bg-black/40 backdrop-blur-md text-white text-xs p-1.5 rounded-full border border-white/20 hover:bg-black/60 transition"
                title={isMuted ? "소리 켜기" : "음소거"}
              >
                {isMuted ? "🔇" : "🔊"}
              </button>
            </div>
          </div>
        </div>

        {/* 메인 영상 디스플레이 영역 (터치/클릭 시 재생/일시정지) */}
        <div
          onClick={togglePlay}
          className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer bg-slate-950"
        >
          {/* Veo 3 시네마틱 애니메이션 레이어 */}
          <div
            className={`relative w-full h-full flex items-center justify-center transition-all duration-1000 ease-in-out ${
              isPlaying ? "scale-105" : "scale-100"
            }`}
          >
            <img
              src={currentImage}
              alt={displayName}
              className="w-full h-full object-cover select-none pointer-events-none filter brightness-95 contrast-105"
            />

            {/* 시네마틱 라이팅 비네팅 오버레이 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40 pointer-events-none" />

            {/* PPL 제품 트래킹 태그 뱃지 */}
            <div className="absolute top-20 left-4 bg-amber-500/90 text-slate-950 text-[11px] font-bold px-2.5 py-1 rounded-md shadow-lg backdrop-blur border border-amber-300 flex items-center space-x-1.5 animate-pulse pointer-events-none">
              <span>🏷️</span>
              <span>PPL: {displayTopic.slice(0, 18)}</span>
            </div>

            {/* 재생 상태 오버레이 아이콘 (일시정지 시 표시) */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center text-white text-2xl pl-1 shadow-2xl">
                  ▶
                </div>
              </div>
            )}
          </div>

          {/* 우측 플로팅 액션 바 (좋아요, 공유, 3D, 시트) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-3 bottom-24 z-20 flex flex-col items-center space-y-4"
          >
            {/* 모델 아바타 프로필 링크 */}
            <Link
              href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
              className="relative group flex flex-col items-center"
            >
              <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-purple-500 to-pink-500 shadow-lg">
                <img
                  src={`/assets/models/${model.assetKey}_avatar.jpg`}
                  alt={displayName}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <span className="absolute -bottom-1.5 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-white">
                3D
              </span>
            </Link>

            {/* 좋아요 버튼 */}
            <button
              onClick={handleLike}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border ${
                  hasLiked
                    ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)]"
                    : "bg-black/50 text-white border-white/20 hover:bg-black/70"
                }`}
              >
                <span className="text-lg">❤️</span>
              </div>
              <span className="text-[11px] font-bold text-white drop-shadow">
                {likes}
              </span>
            </button>

            {/* 공유 버튼 */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/20 flex items-center justify-center hover:bg-black/70">
                <span className="text-base">🔗</span>
              </div>
              <span className="text-[11px] font-bold text-white drop-shadow">공유</span>
            </button>

            {/* 보관함 / 시트 링크 안내 */}
            <button
              onClick={handleDownloadNotice}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-emerald-400 border border-emerald-400/40 flex items-center justify-center hover:bg-black/70">
                <span className="text-base">📊</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-300 drop-shadow">장부</span>
            </button>
          </div>

          {/* 하단 자막 & 모델 정보 오버레이 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 p-4 z-20 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col space-y-2 pointer-events-auto"
          >
            {/* 모델 이름 및 역할 */}
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white drop-shadow-md">
                @{displayName}
              </span>
              <span className="bg-purple-900/70 border border-purple-500/40 text-purple-200 text-[10px] px-2 py-0.5 rounded-full font-medium">
                {displayVoice.split(" ")[0]}
              </span>
            </div>

            {/* 제품 주제 */}
            <p className="text-xs font-semibold text-amber-300 drop-shadow line-clamp-1">
              ✨ {displayTopic}
            </p>

            {/* 실시간 쇼츠 발화 대본 자막 (글래스모피즘 박스) */}
            <div className="bg-black/60 backdrop-blur-md border border-white/15 rounded-xl p-2.5 shadow-lg">
              <div className="flex items-center space-x-1.5 mb-1">
                <span className="text-[10px] font-bold text-purple-400">🎙️ 발화 자막</span>
                {isPlaying && !isMuted && (
                  <span className="flex space-x-0.5 items-end h-2.5">
                    <span className="w-0.5 h-2 bg-purple-400 animate-pulse" />
                    <span className="w-0.5 h-3 bg-pink-400 animate-pulse delay-75" />
                    <span className="w-0.5 h-1.5 bg-amber-400 animate-pulse delay-150" />
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-100 leading-relaxed font-medium">
                {displayScript}
              </p>
            </div>

            {/* 하단 미니 컨트롤 바 */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
              <span>
                {Math.floor(currentTime)}s / {DURATION}s
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ID: {videoId.slice(0, 16)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AiShortsPlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070B14] text-white flex items-center justify-center text-sm font-sans">
          🎬 AI 전속 모델 쇼츠 플레이어 로딩 중...
        </div>
      }
    >
      <ShortsPlayerContent />
    </Suspense>
  );
}
