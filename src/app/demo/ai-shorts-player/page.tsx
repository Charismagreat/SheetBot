"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getEgdeskBasePath, apiFetch } from "@/lib/egdesk-helpers";

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

export interface ProductFeatureCard {
  badge: string;
  headline: string;
  detail: string;
  hasColorPalette?: boolean;
}

export interface ScriptSceneSegment {
  caption: string;
  stageDirection?: string;
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

const TAEKWONDO_BELT_COLORS = [
  { name: "백띠", hex: "#F8FAFC" },
  { name: "노란띠", hex: "#FACC15" },
  { name: "주황띠", hex: "#FB923C" },
  { name: "초록띠", hex: "#22C55E" },
  { name: "파란띠", hex: "#3B82F6" },
  { name: "보라띠", hex: "#A855F7" },
  { name: "밤띠", hex: "#78350F" },
  { name: "빨간띠", hex: "#EF4444" },
  { name: "품띠", hex: "#EC4899" },
  { name: "검은띠", hex: "#1E293B" },
];

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
 * 도메인(sheetbot.cloud) 및 이지데스크 터널(/t/mcp-server-fxkud1/p/SheetBot) 환경 모두에서
 * 정적 이미지가 400 Bad Request 없이 100% 로드되도록 BasePath를 결합합니다.
 */
function resolveStaticAssetUrl(relativePath: string): string {
  const cleanRel = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  if (typeof window === "undefined") {
    return `/t/mcp-server-fxkud1/p/SheetBot${cleanRel}`;
  }
  const basePath = getEgdeskBasePath();
  if (basePath) {
    return `${basePath}${cleanRel}`;
  }
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return cleanRel;
  }
  return `/t/mcp-server-fxkud1/p/SheetBot${cleanRel}`;
}

/**
 * 긴 상품 설명문이 들어온 topic에서:
 * 1) 상단 PPL 배너용 짧은 핵심 제품명(shortTitle)
 * 2) 화면에 슬라이드로 띄울 POINT 01 ~ 04 핵심 특장점 카드(featureCards)
 * 를 자동으로 분리 추출합니다.
 */
function parseTopicAndFeatureCards(rawTopic: string): {
  shortTitle: string;
  featureCards: ProductFeatureCard[];
} {
  if (!rawTopic || !rawTopic.trim()) {
    return {
      shortTitle: "시트봇 AI 전속 모델 쇼츠",
      featureCards: [],
    };
  }

  const lines = rawTopic
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 첫 번째 POINT 이전의 줄들을 합쳐서 짧은 타이틀 구성
  const firstPointIdx = lines.findIndex((l) => /^(POINT\s*\d+|#\d+|\d+\.|[①②③④⑤])/i.test(l));
  let shortTitle = "";
  if (firstPointIdx > 0) {
    shortTitle = lines.slice(0, Math.min(firstPointIdx, 2)).join(" · ");
  } else {
    shortTitle = lines[0] || rawTopic.slice(0, 32);
  }
  if (shortTitle.length > 38) {
    shortTitle = shortTitle.slice(0, 36) + "...";
  }

  const featureCards: ProductFeatureCard[] = [];

  // POINT 01, POINT 02 등 블록 파싱
  const pointBlocks = rawTopic.split(/(?=POINT\s*\d+)/i).map((b) => b.trim()).filter(Boolean);
  if (pointBlocks.length > 1 || /^POINT\s*\d+/i.test(pointBlocks[0] || "")) {
    for (const block of pointBlocks) {
      if (!/^POINT\s*\d+/i.test(block)) continue;
      const bLines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const badge = bLines[0] || "KEY POINT";
      const headline = bLines[1] || badge;
      const detail = bLines.slice(2).join(" ");
      const hasColorPalette = /(10가지|10종|컬러|색상|라인업)/.test(`${badge} ${headline} ${detail}`);
      featureCards.push({
        badge,
        headline,
        detail,
        hasColorPalette,
      });
    }
  } else if (lines.length >= 2) {
    // 일반 여러 줄 설명문일 경우 2~3개 카드로 자동 구성
    for (let i = 1; i < lines.length; i += 2) {
      const headline = lines[i];
      const detail = lines[i + 1] || "";
      featureCards.push({
        badge: `POINT 0${featureCards.length + 1}`,
        headline,
        detail,
        hasColorPalette: /(10가지|10종|컬러|색상|라인업)/.test(`${headline} ${detail}`),
      });
    }
  }

  return { shortTitle, featureCards };
}

/**
 * 대본에서 [연기 지시: ...]는 씬 연출 뱃지로 분리하고,
 * (TPU), (실링), (3,000~5,000원) 등 실제 제품 스펙 소괄호는 100% 보존하여
 * 쇼츠 자막 세그먼트 배열로 변환합니다.
 */
function parseScriptIntoScenes(rawScript: string): {
  scenes: ScriptSceneSegment[];
  cleanFullText: string;
} {
  if (!rawScript) {
    return { scenes: [], cleanFullText: "" };
  }

  const blocks = rawScript
    .split(/(?=\[[^\]]*?\])/)
    .map((b) => b.trim())
    .filter(Boolean);

  const scenes: ScriptSceneSegment[] = [];

  for (const block of blocks) {
    let stageDirection = "";
    const dirMatch = block.match(/^\[([^\]]+)\]/);
    if (dirMatch) {
      stageDirection = dirMatch[1].replace(/^연기\s*지시\s*:\s*/i, "").trim();
    }

    // [연기 지시: ...] 브라켓과 (미소), (윙크) 같은 감정 지시어만 제거하고 (TPU), (3,000~5,000원) 등 스펙은 보존!
    const bodyText = block
      .replace(/\[[\s\S]*?\]/g, " ")
      .replace(/【[\s\S]*?】/g, " ")
      .replace(/\((?:미소|웃음|윙크|강조|포즈|제스처|박수|연기[^)]*)\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!bodyText) continue;

    // 문장 단위로 세분화
    const sentences = bodyText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);

    for (const sentence of sentences) {
      if (sentence.length > 48 && sentence.includes(",")) {
        const subParts = sentence.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
        for (const sub of subParts) {
          scenes.push({ caption: sub, stageDirection });
        }
      } else {
        scenes.push({ caption: sentence, stageDirection });
      }
    }
  }

  if (scenes.length === 0) {
    const fallbackClean = rawScript
      .replace(/\[[\s\S]*?\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    scenes.push({ caption: fallbackClean || "지금 바로 확인해 보세요!" });
  }

  const cleanFullText = scenes.map((s) => s.caption).join(" ");
  return { scenes, cleanFullText };
}

function ShortsPlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("id") || `aimodel_${Date.now()}`;
  const nameParam = searchParams.get("name");
  const voiceParam = searchParams.get("voice");
  const topicParam = searchParams.get("topic");
  const scriptParam = searchParams.get("script");
  const imgParam = searchParams.get("img");

  const [metaData, setMetaData] = useState<{
    modelName?: string;
    modelVoice?: string;
    topic?: string;
    script?: string;
    productImageUrl?: string;
  } | null>(null);

  // 단축 URL(?id=aimodel_...) 접속 시 서버 메타데이터 자동 조회
  useEffect(() => {
    if (videoId && (!topicParam || !scriptParam || !imgParam)) {
      apiFetch(`/api/user/ai-model/video-meta?id=${encodeURIComponent(videoId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.success && d.data) {
            setMetaData(d.data);
          }
        })
        .catch(() => {});
    }
  }, [videoId, topicParam, scriptParam, imgParam]);

  const effectiveName = nameParam || metaData?.modelName || null;
  const effectiveVoice = voiceParam || metaData?.modelVoice || null;
  const effectiveTopic = topicParam || metaData?.topic || "";
  const effectiveScript = scriptParam || metaData?.script || "";
  const effectiveProductImg = imgParam || metaData?.productImageUrl || "";

  const model = resolveModel(effectiveName, effectiveVoice);
  const displayName = effectiveName || model.name;
  const displayVoice = effectiveVoice || model.voiceTone;
  const rawTopic = effectiveTopic || model.defaultTopic;
  const rawScript = effectiveScript || model.defaultScript;

  const { shortTitle, featureCards } = useMemo(
    () => parseTopicAndFeatureCards(rawTopic),
    [rawTopic]
  );

  const { scenes, cleanFullText } = useMemo(
    () => parseScriptIntoScenes(rawScript),
    [rawScript]
  );

  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(18);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [likes, setLikes] = useState<number>(312);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [showFullScriptModal, setShowFullScriptModal] = useState<boolean>(false);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2800);
  }, []);

  // 고품질 서버 TTS 오디오 URL
  const ttsAudioUrl = useMemo(() => {
    if (!cleanFullText) return "";
    return resolveStaticAssetUrl(
      `/api/user/ai-model/tts?text=${encodeURIComponent(cleanFullText)}&voice=${encodeURIComponent(displayVoice)}`
    );
  }, [cleanFullText, displayVoice]);

  // 브라우저 내장 TTS 폴백
  const playFallbackWebSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;
    const utt = new SpeechSynthesisUtterance(cleanFullText);
    utt.lang = "ko-KR";
    utt.rate = 1.08;
    utt.pitch = model.assetKey === "minsu" ? 0.95 : model.assetKey === "seoyeon" ? 1.08 : 1.02;
    window.speechSynthesis.speak(utt);
  }, [cleanFullText, isMuted, model.assetKey]);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const startPlayback = useCallback(() => {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentTime(0);

    if (audioRef.current && ttsAudioUrl) {
      audioRef.current.muted = isMuted;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        playFallbackWebSpeech();
      });
    } else {
      playFallbackWebSpeech();
    }
  }, [isMuted, playFallbackWebSpeech, ttsAudioUrl]);

  // 타이머 및 오디오 진행도 동기화
  useEffect(() => {
    if (isPlaying && hasStarted) {
      timerRef.current = setInterval(() => {
        const audioEl = audioRef.current;
        if (audioEl && !audioEl.paused && audioEl.duration && isFinite(audioEl.duration)) {
          setDuration(audioEl.duration);
          setCurrentTime(audioEl.currentTime);
        } else {
          setCurrentTime((prev) => {
            const next = prev + 0.1;
            if (next >= duration) {
              if (audioEl) {
                audioEl.currentTime = 0;
                audioEl.play().catch(() => {});
              } else {
                playFallbackWebSpeech();
              }
              return 0;
            }
            return next;
          });
        }
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, hasStarted, duration, playFallbackWebSpeech]);

  useEffect(() => {
    return () => stopAllAudio();
  }, [stopAllAudio]);

  const progress = Math.min(100, (currentTime / Math.max(duration, 1)) * 100);

  const togglePlay = () => {
    if (!hasStarted) {
      startPlayback();
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        if (audioRef.current) {
          audioRef.current.play().catch(() => playFallbackWebSpeech());
        } else {
          playFallbackWebSpeech();
        }
      } else {
        stopAllAudio();
      }
      return next;
    });
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      if (next) {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        showToast("🔇 음소거되었습니다.");
      } else {
        showToast("🔊 소리가 켜졌습니다.");
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
    const cleanShareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(videoId)}&voice=${encodeURIComponent(displayVoice.split(" ")[0])}&name=${encodeURIComponent(displayName)}&topic=${encodeURIComponent(shortTitle)}&script=${encodeURIComponent(rawScript)}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(cleanShareUrl);
      showToast("🔗 쇼츠 영상 링크가 클립보드에 복사되었습니다!");
    } else {
      showToast("주소창 URL을 복사하여 공유할 수 있습니다.");
    }
  };

  // 현재 시간에 매칭되는 자막 및 연출 지시어 계산
  const activeSceneIndex = Math.min(
    Math.max(scenes.length - 1, 0),
    Math.floor((currentTime / Math.max(duration, 1)) * scenes.length)
  );
  const activeScene = scenes[activeSceneIndex] || { caption: "" };

  // 현재 시간에 매칭되는 POINT 01 ~ 04 핵심 특장점 카드 계산
  const activeFeatureCard: ProductFeatureCard | null = useMemo(() => {
    if (featureCards.length === 0) return null;
    const idx = Math.min(
      featureCards.length - 1,
      Math.floor((currentTime / Math.max(duration, 1)) * featureCards.length)
    );
    return featureCards[idx] || featureCards[0];
  }, [featureCards, currentTime, duration]);

  // 4단 시네마틱 카메라 워크 & 앵글 전환 (front -> quarter -> side -> walk)
  const angleCycle: Array<"front" | "quarter" | "side" | "walk"> = [
    "front",
    "quarter",
    "walk",
    "side",
    "front",
  ];
  const currentAngle = angleCycle[activeSceneIndex % angleCycle.length] || "front";
  const phaseProgress = ((currentTime % 4) / 4);
  const scaleVal = isPlaying ? 1.03 + phaseProgress * 0.06 : 1.0;
  const translateXVal = isPlaying ? (activeSceneIndex % 2 === 0 ? -phaseProgress * 6 : phaseProgress * 6) : 0;
  const cameraTransform = `scale(${scaleVal.toFixed(3)}) translate(${translateXVal.toFixed(1)}px, -${(phaseProgress * 6).toFixed(1)}px)`;

  const currentModelImgUrl = resolveStaticAssetUrl(`/assets/models/${model.assetKey}_${currentAngle}.jpg`);
  const avatarImgUrl = resolveStaticAssetUrl(`/assets/models/${model.assetKey}_avatar.jpg`);
  const resolvedProductImgUrl = effectiveProductImg
    ? effectiveProductImg.startsWith("http")
      ? effectiveProductImg
      : resolveStaticAssetUrl(effectiveProductImg)
    : "";

  /**
   * 🎬 실제 쇼츠 비디오 파일(.webm) 캔버스 렌더링 및 다운로드
   */
  const handleDownloadVideoFile = async () => {
    if (isExportingVideo) return;
    setIsExportingVideo(true);
    showToast("🎬 쇼츠 동영상(.webm) 파일을 생성하고 있습니다 (약 4초 소요)...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context 생성 실패");

      const loadImage = (url: string): Promise<HTMLImageElement | null> =>
        new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => {
            const fallbackUrl = url.replace("/t/mcp-server-fxkud1/p/SheetBot", "");
            const img2 = new Image();
            img2.crossOrigin = "anonymous";
            img2.onload = () => resolve(img2);
            img2.onerror = () => resolve(null);
            img2.src = fallbackUrl;
          };
          img.src = url;
        });

      const [frontImg, quarterImg, walkImg] = await Promise.all([
        loadImage(resolveStaticAssetUrl(`/assets/models/${model.assetKey}_front.jpg`)),
        loadImage(resolveStaticAssetUrl(`/assets/models/${model.assetKey}_quarter.jpg`)),
        loadImage(resolveStaticAssetUrl(`/assets/models/${model.assetKey}_walk.jpg`)),
      ]);
      const imgs = [frontImg, quarterImg, walkImg].filter(Boolean) as HTMLImageElement[];

      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start();

      const totalFrames = 120; // 4초 고속 렌더링
      for (let f = 0; f < totalFrames; f++) {
        const ratio = f / totalFrames;
        ctx.fillStyle = "#070B14";
        ctx.fillRect(0, 0, 720, 1280);

        if (imgs.length > 0) {
          const img = imgs[Math.floor(ratio * imgs.length) % imgs.length];
          const z = 1.0 + (f % 30) * 0.002;
          const dw = 720 * z;
          const dh = 1280 * z;
          ctx.drawImage(img, -(dw - 720) / 2, 0, dw, dh);
        }

        // 상단/하단 그라데이션
        const grad = ctx.createLinearGradient(0, 700, 0, 1280);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.92)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 700, 720, 580);

        // 상단 PPL 배너
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(36, 48, 648, 64);
        ctx.fillStyle = "#FCD34D";
        ctx.font = "bold 24px sans-serif";
        ctx.fillText(`🏷️ PPL: ${shortTitle}`, 56, 88);

        // 포인트 카드 오버레이
        if (featureCards.length > 0) {
          const fc = featureCards[Math.floor(ratio * featureCards.length) % featureCards.length];
          ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
          ctx.fillRect(36, 820, 648, 150);
          ctx.strokeStyle = "#38BDF8";
          ctx.lineWidth = 2;
          ctx.strokeRect(36, 820, 648, 150);
          ctx.fillStyle = "#38BDF8";
          ctx.font = "bold 22px sans-serif";
          ctx.fillText(fc.badge, 58, 862);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 26px sans-serif";
          ctx.fillText(fc.headline.slice(0, 26), 58, 906);
          ctx.fillStyle = "#CBD5E1";
          ctx.font = "20px sans-serif";
          ctx.fillText(fc.detail.slice(0, 34), 58, 944);
        }

        // 하단 자막
        const sc = scenes[Math.floor(ratio * scenes.length) % scenes.length];
        if (sc) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
          ctx.fillRect(36, 1020, 648, 140);
          ctx.fillStyle = "#FDE047";
          ctx.font = "bold 28px sans-serif";
          ctx.fillText(sc.caption.slice(0, 24), 56, 1078);
          if (sc.caption.length > 24) {
            ctx.fillText(sc.caption.slice(24, 48), 56, 1122);
          }
        }

        await new Promise((r) => setTimeout(r, 25));
      }

      recorder.stop();
      const videoBlob = await recordDone;
      const dlUrl = URL.createObjectURL(videoBlob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `SheetBot_Shorts_${videoId}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("✅ 쇼츠 동영상 파일 다운로드가 완료되었습니다!");
    } catch (e: any) {
      showToast(`⚠️ 영상 저장 안내: ${e.message}`);
    } finally {
      setIsExportingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col items-center justify-center font-sans select-none p-0 sm:p-4 overflow-hidden">
      {/* 숨겨진 고품질 서버 뉴럴 TTS 오디오 플레이어 */}
      {ttsAudioUrl && (
        <audio
          ref={audioRef}
          src={ttsAudioUrl}
          preload="auto"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && isFinite(d) && d > 2) {
              setDuration(Math.ceil(d));
            }
          }}
          onEnded={() => {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          }}
        />
      )}

      {/* 토스트 알림 */}
      {toastMessage && (
        <div className="fixed top-6 z-50 bg-slate-900/95 border border-purple-500/50 text-purple-200 text-xs px-4 py-2 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.5)] backdrop-blur-md animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* 9:16 모바일 세로형 쇼츠 비디오 컨테이너 */}
      <div className="relative w-full max-w-[420px] h-[100dvh] sm:h-[840px] sm:rounded-3xl overflow-hidden bg-black shadow-[0_0_60px_rgba(0,0,0,0.9)] border border-slate-800/80 flex flex-col justify-between">
        {/* 상단 프로그레스 타임라인 */}
        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 flex flex-col space-y-1 bg-gradient-to-b from-black/85 via-black/40 to-transparent">
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
                className="bg-black/50 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20 hover:bg-black/70 transition flex items-center space-x-1"
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

        {/* 🎬 메인 비디오 렌더링 스테이지 */}
        <div
          onClick={togglePlay}
          className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer bg-slate-950"
        >
          {/* 전속 모델 시네마틱 모션 레이어 (BasePath 자동 보정 + onError 양방향 폴백) */}
          <div
            className="relative w-full h-full flex items-center justify-center transition-transform duration-500 ease-out"
            style={{ transform: cameraTransform }}
          >
            <img
              src={currentModelImgUrl}
              alt={displayName}
              onError={(e) => {
                const target = e.currentTarget;
                const fallback = `/assets/models/${model.assetKey}_${currentAngle}.jpg`;
                const tunnelFallback = `/t/mcp-server-fxkud1/p/SheetBot/assets/models/${model.assetKey}_${currentAngle}.jpg`;
                if (!target.src.includes("/t/mcp-server-fxkud1")) {
                  target.src = tunnelFallback;
                } else if (target.dataset.retried !== "1") {
                  target.dataset.retried = "1";
                  target.src = fallback;
                }
              }}
              className="w-full h-full object-cover object-top select-none pointer-events-none filter brightness-100 contrast-105"
            />

            {/* 스튜디오 조명 & 앰비언트 비네팅 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/15 to-black/35 pointer-events-none" />

            {/* 발화 음성 반응 펄스 조명 */}
            {isPlaying && !isMuted && (
              <div className="absolute top-1/4 w-44 h-44 rounded-full bg-purple-500/15 blur-3xl animate-pulse pointer-events-none" />
            )}
          </div>

          {/* 상단 플로팅 PPL 제품 요약 배너 (긴 본문 대신 1줄 핵심 제품명만 깔끔하게 노출) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-13 left-3 right-14 z-20 pointer-events-none flex flex-col space-y-1.5"
          >
            <div className="inline-flex items-center space-x-1.5 bg-black/70 backdrop-blur-md border border-amber-400/60 rounded-full px-3 py-1 shadow-lg w-fit max-w-full">
              <span className="text-xs">🏷️</span>
              <span className="text-[11px] font-extrabold text-amber-300 truncate">
                PPL: {shortTitle}
              </span>
            </div>

            {/* 현재 씬 연기/연출 지시 인디케이터 */}
            {activeScene.stageDirection && (
              <div className="inline-flex items-center space-x-1 bg-indigo-950/80 backdrop-blur-md border border-indigo-400/40 rounded-full px-2.5 py-0.5 w-fit max-w-full">
                <span className="text-[10px]">🎬</span>
                <span className="text-[10px] text-indigo-200 font-medium truncate">
                  {activeScene.stageDirection}
                </span>
              </div>
            )}
          </div>

          {/* 💎 중앙/하단 다이내믹 제품 사진 & POINT 01~04 인포그래픽 쇼케이스 카드 (대본과 시각 화면 완벽 일치!) */}
          {(activeFeatureCard || resolvedProductImgUrl) && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-36 left-3 right-16 z-20 pointer-events-auto transition-all duration-300"
            >
              <div className="bg-slate-950/85 backdrop-blur-md border border-sky-400/50 rounded-2xl p-3 shadow-[0_8px_30px_rgba(0,0,0,0.85)] flex items-start space-x-3">
                {/* 업로드된 실제 제품 이미지가 있을 경우 썸네일 표시 */}
                {resolvedProductImgUrl && (
                  <img
                    src={resolvedProductImgUrl}
                    alt={shortTitle}
                    className="w-16 h-16 rounded-xl object-cover border border-white/20 shrink-0 bg-slate-900"
                  />
                )}

                {activeFeatureCard && (
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="inline-block bg-gradient-to-r from-sky-500 to-blue-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                        {activeFeatureCard.badge}
                      </span>
                      {featureCards.length > 1 && (
                        <div className="flex space-x-1">
                          {featureCards.map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 rounded-full transition-all ${
                                featureCards[i]?.badge === activeFeatureCard.badge
                                  ? "w-4 bg-amber-400"
                                  : "w-1.5 bg-slate-600"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs sm:text-[13px] font-extrabold text-white leading-snug line-clamp-2">
                      {activeFeatureCard.headline}
                    </p>

                    {activeFeatureCard.detail && (
                      <p className="text-[11px] text-slate-300 leading-tight line-clamp-2">
                        {activeFeatureCard.detail}
                      </p>
                    )}

                    {/* 10가지 컬러 라인업 언급 시 실제 10종 컬러 밴드 팔레트 시각화 */}
                    {activeFeatureCard.hasColorPalette && (
                      <div className="pt-1.5 flex items-center space-x-1 overflow-x-auto">
                        {TAEKWONDO_BELT_COLORS.map((c) => (
                          <div
                            key={c.name}
                            title={c.name}
                            className="w-4 h-4 rounded-full border border-white/50 shadow-sm shrink-0"
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                        <span className="text-[9px] text-amber-300 font-bold pl-1 shrink-0">
                          10종 풀컬러
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🌟 쇼츠 시작 전 대기 화면 */}
          {!hasStarted && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center space-y-4 p-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 p-[3px] shadow-[0_0_40px_rgba(168,85,247,0.8)] animate-pulse">
                <div className="w-full h-full rounded-full bg-black/80 flex items-center justify-center text-white text-3xl pl-1">
                  ▶
                </div>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-extrabold text-white tracking-wide">
                  🎬 {shortTitle}
                </h3>
                <p className="text-xs text-purple-300 font-medium">
                  화면을 터치하면 AI 보이스와 함께 제품 쇼츠 영상이 재생됩니다
                </p>
              </div>
              <span className="text-[10px] bg-white/10 text-slate-300 px-3 py-1 rounded-full border border-white/20">
                Google Gemini · Veo 3 AI Shorts Studio
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

          {/* 우측 플로팅 액션 바 (3D, 좋아요, 대본, 영상저장, 공유) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2.5 bottom-24 z-20 flex flex-col items-center space-y-3"
          >
            {/* 모델 아바타 프로필 링크 */}
            <Link
              href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
              className="relative group flex flex-col items-center"
            >
              <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-purple-500 to-pink-500 shadow-lg">
                <img
                  src={avatarImgUrl}
                  alt={displayName}
                  onError={(e) => {
                    const t = e.currentTarget;
                    if (!t.src.includes("/t/mcp-server-fxkud1")) {
                      t.src = `/t/mcp-server-fxkud1/p/SheetBot/assets/models/${model.assetKey}_avatar.jpg`;
                    }
                  }}
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
              className="flex flex-col items-center space-y-0.5 transition active:scale-90"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border ${
                  hasLiked
                    ? "bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)]"
                    : "bg-black/50 text-white border-white/20 hover:bg-black/70"
                }`}
              >
                <span className="text-base">❤️</span>
              </div>
              <span className="text-[10px] font-bold text-white drop-shadow">{likes}</span>
            </button>

            {/* 대본 전문 보기 모달 버튼 */}
            <button
              onClick={() => setShowFullScriptModal(true)}
              className="flex flex-col items-center space-y-0.5 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-amber-300 border border-amber-400/40 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">📝</span>
              </div>
              <span className="text-[10px] font-bold text-amber-200 drop-shadow">대본</span>
            </button>

            {/* 실제 동영상 파일(.webm) 다운로드 버튼 */}
            <button
              onClick={handleDownloadVideoFile}
              disabled={isExportingVideo}
              className="flex flex-col items-center space-y-0.5 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-sky-300 border border-sky-400/40 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">{isExportingVideo ? "⏳" : "⬇️"}</span>
              </div>
              <span className="text-[10px] font-bold text-sky-200 drop-shadow">
                {isExportingVideo ? "변환중" : "영상저장"}
              </span>
            </button>

            {/* 공유 버튼 */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center space-y-0.5 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/20 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">🔗</span>
              </div>
              <span className="text-[10px] font-bold text-white drop-shadow">공유</span>
            </button>
          </div>

          {/* 🎯 하단 쇼츠 바이럴 자막 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 right-16 z-20 flex flex-col space-y-1.5 pointer-events-auto"
          >
            {/* 모델 핸들 & 보이스 뱃지 */}
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-xs sm:text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                @{displayName}
              </span>
              <span className="bg-purple-900/80 border border-purple-400/50 text-purple-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {displayVoice.split(" ")[0]} AI Voice
              </span>
              {isPlaying && !isMuted && (
                <span className="flex space-x-0.5 items-end h-3">
                  <span className="w-1 h-2 bg-purple-400 animate-pulse" />
                  <span className="w-1 h-3.5 bg-pink-400 animate-pulse delay-75" />
                  <span className="w-1 h-2 bg-amber-400 animate-pulse delay-150" />
                </span>
              )}
            </div>

            {/* 틱톡/유튜브 쇼츠 스타일 다이내믹 바이럴 자막 */}
            <div className="relative min-h-[54px] flex items-center">
              <div className="bg-black/80 backdrop-blur-md border border-amber-400/40 rounded-2xl px-3.5 py-2 shadow-[0_4px_25px_rgba(0,0,0,0.9)] max-w-full transition-all duration-200">
                <p className="text-sm sm:text-[15px] font-black text-amber-300 leading-snug tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                  {activeScene.caption}
                </p>
              </div>
            </div>

            {/* 하단 미니 타이머 & 대본 전문 버튼 */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span className="font-mono">
                {Math.floor(currentTime)}s / {Math.floor(duration)}s
              </span>
              <button
                onClick={() => setShowFullScriptModal(true)}
                className="text-[10px] text-purple-300 hover:underline"
              >
                제품 포인트 & 대본 전문 보기 ➔
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 📝 제품 핵심 포인트 & 대본 전문 모달 팝업 */}
      {showFullScriptModal && (
        <div
          onClick={() => setShowFullScriptModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 space-y-3.5 max-h-[82vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📝</span>
                <h4 className="text-sm font-bold text-white">{shortTitle} · 쇼츠 상세 정보</h4>
              </div>
              <button
                onClick={() => setShowFullScriptModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {featureCards.length > 0 && (
                <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-[10px] text-sky-400 font-bold block">
                    💎 핵심 셀링 포인트 ({featureCards.length}가지)
                  </span>
                  <div className="space-y-2">
                    {featureCards.map((fc, idx) => (
                      <div key={idx} className="border-l-2 border-sky-500 pl-2.5 py-0.5 space-y-0.5">
                        <span className="text-[10px] font-bold text-sky-300">{fc.badge}</span>
                        <p className="text-slate-100 font-bold">{fc.headline}</p>
                        {fc.detail && <p className="text-slate-400 text-[11px]">{fc.detail}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] text-purple-400 font-bold block">🎙️ AI 발화 대본 전문</span>
                <p className="text-slate-200 leading-relaxed whitespace-pre-line font-normal">
                  {cleanFullText}
                </p>
              </div>
            </div>

            <div className="pt-1 flex space-x-2">
              <button
                onClick={() => {
                  setShowFullScriptModal(false);
                  handleDownloadVideoFile();
                }}
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-2.5 rounded-xl transition"
              >
                ⬇️ 쇼츠 동영상(.webm) 저장
              </button>
              <button
                onClick={() => setShowFullScriptModal(false)}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2.5 rounded-xl transition"
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
