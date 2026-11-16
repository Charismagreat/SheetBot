"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
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
      "잠깐 스크롤 멈추세요! 아직도 불편하게 고민하고 계신가요? 압도적인 완성도로 찾아온 특별한 솔루션! 지금 프로필 링크에서 특별 혜택을 직접 확인해 보세요!",
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
      "안녕하세요! 브랜드 앰배서더 지아입니다. 바쁜 일상 속에서도 놓칠 수 없는 특별한 가치! 시트봇과 함께라면 여러분만의 특별한 여유가 시작됩니다. 지금 확인해 보세요!",
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
      "반갑습니다. 전문 컨설턴트 서연입니다. 기업 경영에서 가장 중요한 것은 데이터의 신속한 의사결정입니다. 스마트한 AI 에이전트가 여러분의 비즈니스를 완벽히 서포트합니다.",
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

/**
 * 프롬프트 메타 지시문([연기 지시: ...] 등)을 100% 제거하고
 * 쇼츠 자막용 1~2줄 펀치라인 배열로 분할
 */
function cleanAndSplitScript(rawScript: string): string[] {
  if (!rawScript) return [];

  // [연기 지시: ...], (미소), [BGM: ...] 등 브라켓 태그 완전 제거
  const cleaned = rawScript
    .replace(/\[[\s\S]*?\]/g, " ")
    .replace(/\([\s\S]*?\)/g, " ")
    .replace(/【[\s\S]*?】/g, " ")
    .replace(/<[\s\S]*?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 문장 단위로 분할 (. ! ? 및 POINT 단위)
  const segments = cleaned
    .split(/(?<=[.!?])\s+|(?=POINT\s*\d+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (segments.length === 0) {
    return [cleaned || "놓치면 후회할 특별 혜택, 지금 확인하세요!"];
  }

  // 문장이 너무 길면 30자 단위로 자르기
  const result: string[] = [];
  for (const seg of segments) {
    if (seg.length > 42) {
      const sub = seg.split(/,\s*/);
      for (const s of sub) {
        if (s.trim()) result.push(s.trim());
      }
    } else {
      result.push(seg);
    }
  }

  return result.length > 0 ? result : [cleaned];
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
  const rawScript = scriptParam || model.defaultScript;

  // 정제된 쇼츠 펀치라인 자막 목록
  const captionLines = useMemo(() => cleanAndSplitScript(rawScript), [rawScript]);
  const fullCleanScript = useMemo(() => captionLines.join(" "), [captionLines]);

  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [likes, setLikes] = useState<number>(248);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [showFullScriptModal, setShowFullScriptModal] = useState<boolean>(false);

  // 15초 쇼츠 비디오 타임라인
  const DURATION = 15;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2600);
  };

  // TTS 음성 재생
  const playSpeech = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;

    const utt = new SpeechSynthesisUtterance(fullCleanScript);
    utt.lang = "ko-KR";
    utt.rate = 1.1;

    if (displayVoice.includes("Puck") || model.assetKey === "minsu") {
      utt.pitch = 0.95;
    } else if (displayVoice.includes("Aoede") || model.assetKey === "seoyeon") {
      utt.pitch = 1.1;
    } else {
      utt.pitch = 1.0;
    }

    window.speechSynthesis.speak(utt);
  };

  const stopSpeech = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  // 쇼츠 재생 시작 (사용자 인터랙션 핸들러 - 모바일 오디오 정책 대응)
  const handleStartShorts = () => {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentTime(0);
    playSpeech();
  };

  // 재생 / 일시정지 제어
  useEffect(() => {
    if (isPlaying && hasStarted) {
      const interval = 100;
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.1;
          if (next >= DURATION) {
            // 루프 재생
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
  }, [isPlaying, hasStarted, isMuted, fullCleanScript]);

  useEffect(() => {
    setProgress((currentTime / DURATION) * 100);
  }, [currentTime]);

  const togglePlay = () => {
    if (!hasStarted) {
      handleStartShorts();
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) playSpeech();
      else stopSpeech();
      return next;
    });
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        stopSpeech();
        showToast("🔇 음소거되었습니다.");
      } else {
        showToast("🔊 소리가 켜졌습니다.");
        if (isPlaying) playSpeech();
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

  // 현재 시간에 해당하는 단 1개의 쇼츠 자막 펀치라인 계산
  const activeCaptionIndex = Math.min(
    captionLines.length - 1,
    Math.floor((currentTime / DURATION) * captionLines.length)
  );
  const activeCaption = captionLines[activeCaptionIndex] || "";

  // 15초 동안 4단 시네마틱 모션 씬 계산 (정면 인사 ➔ 45도 클로즈업 ➔ 워킹/발화 ➔ 마무리 제스처)
  let currentAngle: "front" | "quarter" | "walk" = "front";
  let cameraTransform = "scale(1.0) translateY(0px)";

  if (currentTime < 4) {
    currentAngle = "front";
    cameraTransform = isPlaying ? "scale(1.06) translateY(-8px)" : "scale(1.0)";
  } else if (currentTime < 8) {
    currentAngle = "quarter";
    cameraTransform = isPlaying ? "scale(1.1) translateX(-6px)" : "scale(1.04)";
  } else if (currentTime < 12) {
    currentAngle = "walk";
    cameraTransform = isPlaying ? "scale(1.04) translateY(-4px)" : "scale(1.0)";
  } else {
    currentAngle = "front";
    cameraTransform = isPlaying ? "scale(1.08) translateY(-10px)" : "scale(1.02)";
  }

  const currentImage = `/assets/models/${model.assetKey}_${currentAngle}.jpg`;

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col items-center justify-center font-sans select-none p-0 sm:p-4 overflow-hidden">
      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="fixed top-6 z-50 bg-slate-900/95 border border-purple-500/50 text-purple-200 text-xs px-4 py-2 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.5)] backdrop-blur-md animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* 9:16 모바일 세로형 쇼츠 비디오 컨테이너 */}
      <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[840px] sm:rounded-3xl overflow-hidden bg-black shadow-[0_0_60px_rgba(0,0,0,0.9)] border border-slate-800/80 flex flex-col justify-between">
        {/* 상단 프로그레스 타임라인 (15초 세그먼트) */}
        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 flex flex-col space-y-1 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 h-full transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 상단 헤더 뱃지 & 컨트롤 */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-2">
              <Link
                href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
                className="bg-black/40 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20 hover:bg-black/60 transition flex items-center space-x-1"
              >
                <span>🎭</span>
                <span className="text-[11px] font-medium">3D 스튜디오</span>
              </Link>
              <span className="bg-purple-600/85 backdrop-blur text-[10px] text-purple-100 px-2.5 py-0.5 rounded-full border border-purple-400/40 font-semibold tracking-tight shadow">
                Veo 3 AI Shorts
              </span>
            </div>

            <button
              onClick={toggleMute}
              className="bg-black/50 backdrop-blur-md text-white text-xs p-1.5 rounded-full border border-white/20 hover:bg-black/70 transition shadow"
              title={isMuted ? "소리 켜기" : "음소거"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>

        {/* 🎬 메인 비디오 렌더링 스테이지 (전신 완벽 프레이밍 & 시네마틱 모션) */}
        <div
          onClick={togglePlay}
          className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer bg-slate-950"
        >
          {/* Veo 3 시네마틱 모션 레이어 (얼굴 상단 잘림 방지: object-top & center top) */}
          <div
            className="relative w-full h-full flex items-center justify-center transition-transform duration-1000 ease-out"
            style={{ transform: cameraTransform }}
          >
            <img
              src={currentImage}
              alt={displayName}
              className="w-full h-full object-cover object-top select-none pointer-events-none filter brightness-100 contrast-105"
            />

            {/* 스튜디오 조명 & 앰비언트 비네팅 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 pointer-events-none" />

            {/* 발화 음성 반응 펄스 조명 (말할 때 은은하게 빛남) */}
            {isPlaying && !isMuted && (
              <div className="absolute top-1/4 w-40 h-40 rounded-full bg-purple-500/15 blur-3xl animate-pulse pointer-events-none" />
            )}
          </div>

          {/* 우측 상단 플로팅 PPL 제품 카드 (글래스모피즘 미니 배너) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-14 left-3 right-16 z-20 pointer-events-none"
          >
            <div className="inline-flex items-center space-x-1.5 bg-black/60 backdrop-blur-md border border-amber-400/50 rounded-full px-3 py-1 shadow-lg">
              <span className="text-xs">🏷️</span>
              <span className="text-[11px] font-bold text-amber-300 truncate max-w-[220px]">
                PPL: {displayTopic}
              </span>
            </div>
          </div>

          {/* 🌟 쇼츠 시작 전 대기 화면 (원터치 재생 네온 버튼) */}
          {!hasStarted && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center space-y-4 p-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 p-[3px] shadow-[0_0_40px_rgba(168,85,247,0.8)] animate-pulse">
                <div className="w-full h-full rounded-full bg-black/80 flex items-center justify-center text-white text-3xl pl-1">
                  ▶
                </div>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-extrabold text-white tracking-wide">
                  🎬 AI 전속 모델 쇼츠 재생
                </h3>
                <p className="text-xs text-purple-300 font-medium">
                  화면을 터치하면 음성(TTS)과 함께 15초 영상이 시작됩니다
                </p>
              </div>
              <span className="text-[10px] bg-white/10 text-slate-300 px-3 py-1 rounded-full border border-white/20">
                Google Gemini · Veo 3 Video Engine
              </span>
            </div>
          )}

          {/* 일시정지 상태 오버레이 */}
          {hasStarted && !isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/40 flex items-center justify-center text-white text-2xl pl-1 shadow-2xl">
                ▶
              </div>
            </div>
          )}

          {/* 우측 플로팅 액션 바 (좋아요, 대본, 공유, 3D) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-3 bottom-24 z-20 flex flex-col items-center space-y-3.5"
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

            {/* 대본 전문 보기 모달 버튼 */}
            <button
              onClick={() => setShowFullScriptModal(true)}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-amber-300 border border-amber-400/40 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">📝</span>
              </div>
              <span className="text-[10px] font-bold text-amber-200 drop-shadow">대본</span>
            </button>

            {/* 공유 버튼 */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/20 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">🔗</span>
              </div>
              <span className="text-[10px] font-bold text-white drop-shadow">공유</span>
            </button>

            {/* 구글 시트 대장 안내 */}
            <button
              onClick={() => showToast("💾 구글 드라이브 및 구글 시트에 자동 장부화되었습니다.")}
              className="flex flex-col items-center space-y-1 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-emerald-400 border border-emerald-400/40 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">📊</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-300 drop-shadow">장부</span>
            </button>
          </div>

          {/* 🎯 하단 쇼츠 바이럴 자막 (화면을 가리지 않는 1~2줄 역동적 펀치라인) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 left-4 right-16 z-20 flex flex-col space-y-2 pointer-events-auto"
          >
            {/* 모델 핸들 & 보이스 뱃지 */}
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                @{displayName}
              </span>
              <span className="bg-purple-900/80 border border-purple-400/50 text-purple-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {displayVoice.split(" ")[0]}
              </span>
              {isPlaying && !isMuted && (
                <span className="flex space-x-0.5 items-end h-3">
                  <span className="w-1 h-2 bg-purple-400 animate-pulse" />
                  <span className="w-1 h-3.5 bg-pink-400 animate-pulse delay-75" />
                  <span className="w-1 h-2 bg-amber-400 animate-pulse delay-150" />
                </span>
              )}
            </div>

            {/* 틱톡/유튜브 쇼츠 스타일 다이내믹 바이럴 자막 (가장 핵심!) */}
            <div className="relative min-h-[58px] flex items-center">
              <div className="bg-black/70 backdrop-blur-md border border-white/20 rounded-2xl px-3.5 py-2 shadow-[0_4px_25px_rgba(0,0,0,0.8)] max-w-full transition-all duration-200">
                <p className="text-sm sm:text-base font-black text-amber-300 leading-snug tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                  {activeCaption}
                </p>
              </div>
            </div>

            {/* 하단 미니 타이머 & ID 바 */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span className="font-mono">
                {Math.floor(currentTime)}s / {DURATION}s
              </span>
              <button
                onClick={() => setShowFullScriptModal(true)}
                className="text-[10px] text-purple-300 hover:underline"
              >
                대본 전문 보기 ➔
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 📝 대본 전문 모달 팝업 (원할 때만 열어서 확인) */}
      {showFullScriptModal && (
        <div
          onClick={() => setShowFullScriptModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 space-y-3.5 max-h-[80vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📝</span>
                <h4 className="text-sm font-bold text-white">홍보 쇼츠 대본 전문</h4>
              </div>
              <button
                onClick={() => setShowFullScriptModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] text-amber-400 font-bold block">✨ 홍보 주제</span>
                <p className="text-slate-200 font-medium">{displayTopic}</p>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] text-purple-400 font-bold block">🎙️ AI 발화 대본</span>
                <p className="text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                  {fullCleanScript}
                </p>
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={() => setShowFullScriptModal(false)}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2.5 rounded-xl transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
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
