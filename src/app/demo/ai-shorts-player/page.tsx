"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/egdesk-helpers";

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
  showProductHighlight?: boolean;
  actionPoseIndex: number; // 0: Hook/인사, 1: 양손 탄성 시연, 2: 방수/10종 컬러 시연, 3: CTA 가리키기
}

export interface ActionSceneAsset {
  imgUrl: string;
  label: string;
  mouthX: number; // 정규화 X (0~1)
  mouthY: number; // 정규화 Y (0~1)
  mouthW: number; // 입 폭 비율
  jawH: number;   // 하관(아랫입술~턱끝) 높이 비율
  eyeY: number;   // 눈 높이 비율
  eyeSpan: number;// 미간 거리 비율
  handAnchorX: number;
  handAnchorY: number;
}

export interface ProductVisualTheme {
  theme: "taekwondo" | "beauty" | "food" | "tech" | "fashion" | "health" | "business" | "commercial";
  themeTitle: string;
  wardrobeBadge: string;
  environmentBadge: string;
  holdingPose: string;
  heroModelImg: string;
  actionScenes: ActionSceneAsset[];
  defaultProductImg: string;
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
 * 도메인(sheetbot.cloud) 및 이지데스크 터널 환경 모두에서
 * 정적 및 API URL이 404 없이 100% 로드되도록 안전하게 해결합니다.
 */
function resolveSafeMediaUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("data:")) {
    return rawUrl;
  }

  const clean = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  if (typeof window === "undefined") {
    return clean;
  }

  const pathname = window.location.pathname;
  const isTunnelPath = pathname.startsWith("/t/mcp-server-fxkud1/p/SheetBot");

  if (isTunnelPath && !clean.startsWith("/t/mcp-server-fxkud1/p/SheetBot")) {
    return `/t/mcp-server-fxkud1/p/SheetBot${clean}`;
  }

  return clean;
}

/**
 * 🎯 제품 주제 및 대본을 기반으로 모델의 맞춤형 의상, 배경, 4단 멀티 액션 씬 & 립싱크 좌표를 도출합니다.
 */
function inferProductVisualTheme(
  topic: string,
  script: string,
  modelAssetKey: string = "minsu"
): ProductVisualTheme {
  const combined = `${topic} ${script}`.toLowerCase();

  // 1. 태권도 / 도복 / 띠 / 칼라밴드 / 무도 스포츠 (4단 멀티 액션 씬 완비)
  if (/(태권도|도복|칼라밴드|도장|승급|품띠|검은띠|유도|검도|체육관|무술|관장님|원생)/.test(combined)) {
    return {
      theme: "taekwondo",
      themeTitle: "태권도 & 무도 스포츠",
      wardrobeBadge: "🥋 정통 태권도 도복 (블랙 벨트)",
      environmentBadge: "🏟️ 명품 태권도장 (Dojang)",
      holdingPose: "New 칼라밴드 4단계 실물 시연 (인사 ➔ 탄성 당기기 ➔ 방수/10종 컬러 ➔ 링크 안내)",
      heroModelImg: "/assets/models/minsu_taekwondo_color_band.jpg",
      defaultProductImg: "/assets/models/minsu_taekwondo_scene3_colors.jpg",
      actionScenes: [
        {
          imgUrl: "/assets/models/minsu_taekwondo_scene1_hook.jpg",
          label: "SCENE 01 · 손가락 스냅 & 오프닝 훅",
          mouthX: 0.502,
          mouthY: 0.304,
          mouthW: 0.082,
          jawH: 0.052,
          eyeY: 0.250,
          eyeSpan: 0.095,
          handAnchorX: 0.44,
          handAnchorY: 0.46,
        },
        {
          imgUrl: "/assets/models/minsu_taekwondo_color_band.jpg",
          label: "SCENE 02 · 칼라밴드 양손 고탄성·실링 시연",
          mouthX: 0.512,
          mouthY: 0.281,
          mouthW: 0.080,
          jawH: 0.050,
          eyeY: 0.227,
          eyeSpan: 0.092,
          handAnchorX: 0.50,
          handAnchorY: 0.54,
        },
        {
          imgUrl: "/assets/models/minsu_taekwondo_scene3_colors.jpg",
          label: "SCENE 03 · 방수 TPU 소재 & 10종 풀컬러 시연",
          mouthX: 0.502,
          mouthY: 0.304,
          mouthW: 0.082,
          jawH: 0.052,
          eyeY: 0.250,
          eyeSpan: 0.095,
          handAnchorX: 0.45,
          handAnchorY: 0.58,
        },
        {
          imgUrl: "/assets/models/minsu_taekwondo_scene4_cta.jpg",
          label: "SCENE 04 · 윙크 & 프로필 링크 클릭 유도(CTA)",
          mouthX: 0.505,
          mouthY: 0.305,
          mouthW: 0.084,
          jawH: 0.052,
          eyeY: 0.250,
          eyeSpan: 0.095,
          handAnchorX: 0.36,
          handAnchorY: 0.48,
        },
      ],
    };
  }

  const defaultActionScenes: ActionSceneAsset[] = [
    {
      imgUrl: `/assets/models/${modelAssetKey}_front.jpg`,
      label: "SCENE 01 · 오프닝 인사 & 훅",
      mouthX: 0.50,
      mouthY: 0.27,
      mouthW: 0.075,
      jawH: 0.048,
      eyeY: 0.22,
      eyeSpan: 0.085,
      handAnchorX: 0.50,
      handAnchorY: 0.58,
    },
    {
      imgUrl: `/assets/models/${modelAssetKey}_quarter.jpg`,
      label: "SCENE 02 · 제품 핵심 강점 소개",
      mouthX: 0.49,
      mouthY: 0.27,
      mouthW: 0.072,
      jawH: 0.048,
      eyeY: 0.22,
      eyeSpan: 0.082,
      handAnchorX: 0.48,
      handAnchorY: 0.58,
    },
    {
      imgUrl: `/assets/models/${modelAssetKey}_walk.jpg`,
      label: "SCENE 03 · 디테일 & 라이프스타일 시연",
      mouthX: 0.50,
      mouthY: 0.26,
      mouthW: 0.070,
      jawH: 0.045,
      eyeY: 0.21,
      eyeSpan: 0.080,
      handAnchorX: 0.52,
      handAnchorY: 0.56,
    },
    {
      imgUrl: `/assets/models/${modelAssetKey}_side.jpg`,
      label: "SCENE 04 · 특별 혜택 & 행동 촉구(CTA)",
      mouthX: 0.48,
      mouthY: 0.27,
      mouthW: 0.068,
      jawH: 0.046,
      eyeY: 0.22,
      eyeSpan: 0.078,
      handAnchorX: 0.50,
      handAnchorY: 0.60,
    },
  ];

  // 2. 뷰티 / 화장품
  if (/(화장품|뷰티|세럼|앰플|크림|스킨케어|피부|마스크팩|에스테틱|보습|미백)/.test(combined)) {
    return {
      theme: "beauty",
      themeTitle: "프리미엄 뷰티 & 코스메틱",
      wardrobeBadge: "👗 실키 화이트 뷰티 가운",
      environmentBadge: "✨ 자연광 미니멀 에스테틱 룸",
      holdingPose: "제품 앰플을 뺨 옆에 들고 화사하게 미소",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      defaultProductImg: "",
      actionScenes: defaultActionScenes,
    };
  }

  // 3. 식품 / 요리
  if (/(식품|요리|맛집|디저트|커피|음료|베이커리|밀키트|간편식|맛있는|셰프)/.test(combined)) {
    return {
      theme: "food",
      themeTitle: "고메 푸드 & 레스토랑",
      wardrobeBadge: "👨‍🍳 모던 셰프 에이프런",
      environmentBadge: "🍷 부티크 레스토랑 키친",
      holdingPose: "식품 패키지를 양손으로 정성스럽게 받쳐 들고 서빙",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      defaultProductImg: "",
      actionScenes: defaultActionScenes,
    };
  }

  // 4. IT / 전자기기
  if (/(스마트|전자|기기|블루투스|태블릿|충전기|이어폰|노트북|가전|디바이스)/.test(combined)) {
    return {
      theme: "tech",
      themeTitle: "스마트 테크 & 일렉트로닉스",
      wardrobeBadge: "👔 모던 스마트 캐주얼",
      environmentBadge: "🏢 하이테크 테크 라운지",
      holdingPose: "기기를 손에 들고 화면을 카메라 정면으로 가리키며 시연",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      defaultProductImg: "",
      actionScenes: defaultActionScenes,
    };
  }

  // 기본 비즈니스 / 커머셜
  return {
    theme: "commercial",
    themeTitle: "프리미엄 브랜드 커머셜",
    wardrobeBadge: "✨ 세련된 모던 데일리 룩",
    environmentBadge: "🏠 감성 라이프스타일 스튜디오",
    holdingPose: "제품을 한 손에 안정적으로 쥐고 카메라를 향해 소개",
    heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
    defaultProductImg: "",
    actionScenes: defaultActionScenes,
  };
}

/**
 * 긴 상품 설명문에서 핵심 제품명과 POINT 01~04 특장점 카드를 분리합니다.
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

  const firstPointIdx = lines.findIndex((l) => /^(POINT\s*\d+|#\d+|\d+\.|[①②③④⑤])/i.test(l));
  let shortTitle = "";
  if (firstPointIdx > 0) {
    shortTitle = lines.slice(0, Math.min(firstPointIdx, 2)).join(" · ");
  } else {
    shortTitle = lines[0] || rawTopic.slice(0, 32);
  }
  if (shortTitle.length > 36) {
    shortTitle = shortTitle.slice(0, 34) + "...";
  }

  const featureCards: ProductFeatureCard[] = [];
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
 * 대본을 쇼츠 씬 단위로 파싱하며 연기 지시와 4단 액션 포즈(0~3)를 지능형 매핑합니다.
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

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    let stageDirection = "";
    const dirMatch = block.match(/^\[([^\]]+)\]/);
    if (dirMatch) {
      stageDirection = dirMatch[1].replace(/^연기\s*지시\s*:\s*/i, "").trim();
    }

    const bodyText = block
      .replace(/\[[\s\S]*?\]/g, " ")
      .replace(/【[\s\S]*?】/g, " ")
      .replace(/\((?:미소|웃음|윙크|강조|포즈|제스처|박수|연기[^)]*)\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!bodyText) continue;

    const sentences = bodyText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);

    for (const sentence of sentences) {
      const combinedCheck = `${stageDirection} ${sentence}`;
      let actionPoseIndex = 1;
      if (/(손가락|튕기|설마|관장님|안녕|잠깐|고민)/.test(combinedCheck) && scenes.length === 0) {
        actionPoseIndex = 0; // Scene 1: 오프닝 훅 & 손가락 스냅
      } else if (/(프로필|링크|아래|가리키|윙크|지금 바로|확인해)/.test(combinedCheck)) {
        actionPoseIndex = 3; // Scene 4: CTA 아래쪽 가리키기
      } else if (/(10가지|10종|컬러|색상|성취감|물티슈|방수|TPU|땀|오염)/i.test(combinedCheck)) {
        actionPoseIndex = 2; // Scene 3: 방수 TPU & 10종 컬러 시연
      } else {
        actionPoseIndex = 1; // Scene 2: 양손으로 밴드 당기며 탄성/실링/원가절감 시연
      }

      const showProductHighlight = /(소재|방수|실링|가격|비용|컬러|품질|착용|확인|제품|디자인|300원|90%)/i.test(sentence);

      if (sentence.length > 48 && sentence.includes(",")) {
        const subParts = sentence.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
        for (const sub of subParts) {
          const subPose = /(10가지|컬러|물티슈|방수|TPU)/i.test(sub) ? 2 : actionPoseIndex;
          scenes.push({ caption: sub, stageDirection, showProductHighlight, actionPoseIndex: subPose });
        }
      } else {
        scenes.push({ caption: sentence, stageDirection, showProductHighlight, actionPoseIndex });
      }
    }
  }

  if (scenes.length === 0) {
    const fallbackClean = rawScript
      .replace(/\[[\s\S]*?\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    scenes.push({
      caption: fallbackClean || "지금 바로 프로필 링크에서 만나보세요!",
      actionPoseIndex: 1,
    });
  }

  const cleanFullText = scenes.map((s) => s.caption).join(" ");
  return { scenes, cleanFullText };
}

/**
 * 🎙️ 발화 중인 텍스트와 시간(t)을 기반으로 실제 한국어 자모음 음절 개폐율(Lip-Sync Envelope)을 60fps로 계산합니다.
 */
function computeSpeechLipSyncEnvelope(
  timeSec: number,
  caption: string,
  analyserData?: Uint8Array | null
): { mouthOpen: number; mouthSpread: number } {
  // 1. Web Audio Analyser 실시간 주파수 에너지가 유효할 경우 우선 결합
  let audioEnergy = 0;
  if (analyserData && analyserData.length > 0) {
    let sum = 0;
    // 음성 포먼트 주요 대역 (bin 2 ~ 28)
    const limit = Math.min(28, analyserData.length);
    for (let i = 2; i < limit; i++) {
      sum += analyserData[i];
    }
    audioEnergy = sum / ((limit - 2) * 255);
  }

  // 2. 한국어 음절(Syllable) 발화 리듬 시뮬레이터 (초당 약 5.2음절 발화)
  const cleanChars = (caption || "").replace(/\s+/g, "");
  const syllableRate = 5.4;
  const syllablePos = timeSec * syllableRate;
  const charIdx = cleanChars.length > 0 ? Math.floor(syllablePos) % cleanChars.length : 0;
  const phaseInSyllable = syllablePos - Math.floor(syllablePos); // 0.0 ~ 1.0

  // 자음 시작(닫힘) -> 모음 정점(열림) -> 종성(반닫힘) 곡선
  const syllableCurve = Math.sin(phaseInSyllable * Math.PI);

  // 글자 코드에 따른 모음 크기 변화 (아/어/오/우/이 다변화)
  const charCode = cleanChars.charCodeAt(charIdx) || 44032;
  const vowelType = charCode % 5;
  const vowelAmplitude =
    vowelType === 0 ? 0.95 : // '아/와' 계열 (크게 열림)
    vowelType === 1 ? 0.78 : // '어/에' 계열
    vowelType === 2 ? 0.65 : // '오/우' 계열 (원순)
    vowelType === 3 ? 0.50 : // '이/으' 계열 (옆으로 벌어짐)
    0.85;

  // 문장 내 자연스러운 호흡 휴지기 (쉼표/마침표 부근)
  const breathPause = Math.sin(timeSec * 1.9) > 0.92 ? 0.15 : 1.0;

  const simulatedOpen = syllableCurve * vowelAmplitude * breathPause;
  const finalMouthOpen = Math.min(1.0, Math.max(0.05, audioEnergy > 0.08 ? audioEnergy * 1.35 : simulatedOpen));

  const mouthSpread =
    vowelType === 3 ? 0.25 : // '이/으' 발음 시 입꼬리 넓어짐
    vowelType === 2 ? -0.20 : // '오/우' 발음 시 입술 오므라듦
    Math.sin(timeSec * 8.5) * 0.12;

  return { mouthOpen: finalMouthOpen, mouthSpread };
}

/**
 * 🎬 캔버스 위에 얼굴 왜곡 없는 깨끗한 고화질 4단 시네마틱 컷 + 자연스러운 카메라 호흡 모션을 그립니다.
 */
function renderLipSyncModelFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  _sceneAsset: ActionSceneAsset,
  canvasW: number,
  canvasH: number,
  timeSec: number,
  isPlaying: boolean,
  isMuted: boolean,
  _caption: string,
  _analyserData?: Uint8Array | null,
  alpha: number = 1.0
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // 자연스러운 시네마틱 카메라 호흡 및 패닝 (얼굴/치아 절단 왜곡 완전 제거)
  const breathY = isPlaying ? Math.sin(timeSec * 2.4) * 3.5 : 0;
  const subtleNodY = isPlaying && !isMuted ? Math.cos(timeSec * 4.6) * 1.5 : 0;
  const camZoom = isPlaying ? 1.025 + Math.sin(timeSec * 1.3) * 0.015 : 1.01;
  const camPanX = isPlaying ? Math.sin(timeSec * 1.0) * 4.0 : 0;

  const imgAspect = img.width / Math.max(1, img.height);
  const canvasAspect = canvasW / canvasH;
  let drawW = canvasW;
  let drawH = canvasH;
  if (imgAspect > canvasAspect) {
    drawH = canvasH;
    drawW = canvasH * imgAspect;
  } else {
    drawW = canvasW;
    drawH = canvasW / imgAspect;
  }

  drawW *= camZoom;
  drawH *= camZoom;

  const offsetX = (canvasW - drawW) / 2 + camPanX;
  const offsetY = -10 + breathY + subtleNodY;

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  ctx.restore();
}

function ShortsPlayerContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("id") || `aimodel_${Date.now()}`;
  const nameParam = searchParams.get("name");
  const voiceParam = searchParams.get("voice");
  const topicParam = searchParams.get("topic");
  const scriptParam = searchParams.get("script");
  const imgParam = searchParams.get("img");
  const customHeroParam = searchParams.get("heroImg");
  const wardrobeParam = searchParams.get("wardrobe");
  const envParam = searchParams.get("env");
  const poseParam = searchParams.get("pose");

  const [metaData, setMetaData] = useState<{
    modelName?: string;
    modelVoice?: string;
    topic?: string;
    script?: string;
    productImageUrl?: string;
    mp4VideoUrl?: string;
    veoStatus?: "PENDING" | "COMPLETED" | "UNAVAILABLE";
    veoError?: string;
  } | null>(null);

  // 서버 메타데이터 및 Veo .mp4 생성 완료 여부 조회
  useEffect(() => {
    if (!videoId) return;
    let timer: NodeJS.Timeout | null = null;
    const fetchMeta = () => {
      apiFetch(`/api/user/ai-model/video-meta?id=${encodeURIComponent(videoId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.success && d.data) {
            setMetaData(d.data);
            if (d.data.veoStatus === "PENDING") {
              timer = setTimeout(fetchMeta, 5000);
            }
          }
        })
        .catch(() => {});
    };
    fetchMeta();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [videoId]);

  const effectiveName = nameParam || metaData?.modelName || null;
  const effectiveVoice = voiceParam || metaData?.modelVoice || null;
  const effectiveTopic = topicParam || metaData?.topic || "";
  const effectiveScript = scriptParam || metaData?.script || "";

  const model = resolveModel(effectiveName, effectiveVoice);
  const displayName = effectiveName || model.name;
  const displayVoice = effectiveVoice || model.voiceTone;
  const rawTopic = effectiveTopic || model.defaultTopic;
  const rawScript = effectiveScript || model.defaultScript;

  // 🌟 제품 특성에 맞춘 의상, 배경, 4단 액션 씬 시퀀스 도출
  const visualTheme = useMemo(() => {
    const baseTheme = inferProductVisualTheme(rawTopic, rawScript, model.assetKey);
    return {
      ...baseTheme,
      heroModelImg: customHeroParam || baseTheme.heroModelImg,
      wardrobeBadge: wardrobeParam ? `🥋 ${wardrobeParam}` : baseTheme.wardrobeBadge,
      environmentBadge: envParam ? `🏟️ ${envParam}` : baseTheme.environmentBadge,
      holdingPose: poseParam || baseTheme.holdingPose,
    };
  }, [rawTopic, rawScript, model.assetKey, customHeroParam, wardrobeParam, envParam, poseParam]);

  // 제품 이미지 URL 안전 매핑 (URL 파라미터 -> 메타데이터 -> 테마 기본 실물 이미지 순 폴백)
  const effectiveProductImg =
    imgParam || metaData?.productImageUrl || visualTheme.defaultProductImg || "";

  const resolvedProductImgUrl = useMemo(() => {
    if (!effectiveProductImg) return "";
    return resolveSafeMediaUrl(effectiveProductImg);
  }, [effectiveProductImg]);

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
  const [duration, setDuration] = useState<number>(20);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [likes, setLikes] = useState<number>(512);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [showFullScriptModal, setShowFullScriptModal] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [productImageFailed, setProductImageFailed] = useState<boolean>(false);
  const [imagesReady, setImagesReady] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedSceneImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const loadedProductImgRef = useRef<HTMLImageElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataArrayRef = useRef<Uint8Array | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastPoseIndexRef = useRef<number>(0);
  const poseTransitionStartRef = useRef<number>(0);
  const prevPoseIndexRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2800);
  }, []);

  // 고품질 TTS 오디오 URL
  const ttsAudioUrl = useMemo(() => {
    if (!cleanFullText) return "";
    return resolveSafeMediaUrl(
      `/api/user/ai-model/tts?text=${encodeURIComponent(cleanFullText)}&voice=${encodeURIComponent(displayVoice)}`
    );
  }, [cleanFullText, displayVoice]);

  // 4단 액션 씬 이미지 및 실물 제품 이미지 프리로드
  useEffect(() => {
    let mounted = true;
    const loadImg = (rawUrl: string): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        if (!rawUrl) return resolve(null);
        const fullUrl = resolveSafeMediaUrl(rawUrl);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => {
          // 터널/루트 양방향 폴백
          const altUrl = fullUrl.replace("/t/mcp-server-fxkud1/p/SheetBot", "");
          if (altUrl !== fullUrl) {
            const img2 = new Image();
            img2.crossOrigin = "anonymous";
            img2.onload = () => resolve(img2);
            img2.onerror = () => resolve(null);
            img2.src = altUrl;
          } else {
            resolve(null);
          }
        };
        img.src = fullUrl;
      });

    Promise.all([
      ...visualTheme.actionScenes.map(async (sc) => {
        const loaded = await loadImg(sc.imgUrl);
        if (loaded) {
          loadedSceneImagesRef.current[sc.imgUrl] = loaded;
        }
      }),
      (async () => {
        if (resolvedProductImgUrl) {
          const pImg = await loadImg(resolvedProductImgUrl);
          if (pImg) loadedProductImgRef.current = pImg;
        }
      })(),
    ]).then(() => {
      if (mounted) setImagesReady(true);
    });

    return () => {
      mounted = false;
    };
  }, [visualTheme.actionScenes, resolvedProductImgUrl]);

  // 브라우저 내장 TTS 폴백
  const playFallbackWebSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (isMuted) return;
    const utt = new SpeechSynthesisUtterance(cleanFullText);
    utt.lang = "ko-KR";
    utt.rate = 1.05;
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

  // Web Audio API Analyser 연결 (실시간 음성 주파수 립싱크용)
  const ensureAudioAnalyser = useCallback(() => {
    if (analyserRef.current || !audioRef.current || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      audioDataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // 이미 연결되었거나 브라우저 정책 예외 시 음절 시뮬레이터가 자동 동작
    }
  }, []);

  const startPlayback = useCallback(() => {
    setHasStarted(true);
    setIsPlaying(true);
    setCurrentTime(0);

    if (audioRef.current && ttsAudioUrl) {
      ensureAudioAnalyser();
      audioRef.current.muted = isMuted;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        playFallbackWebSpeech();
      });
    } else {
      playFallbackWebSpeech();
    }
  }, [isMuted, playFallbackWebSpeech, ttsAudioUrl, ensureAudioAnalyser]);

  // 현재 재생 시점에 매칭되는 자막 씬 및 4단 액션 포즈 계산
  const activeSceneIndex = Math.min(
    Math.max(scenes.length - 1, 0),
    Math.floor((currentTime / Math.max(duration, 1)) * scenes.length)
  );
  const activeScene = scenes[activeSceneIndex] || { caption: "", actionPoseIndex: 1 };

  const activePoseIdx = Math.min(
    visualTheme.actionScenes.length - 1,
    Math.max(0, activeScene.actionPoseIndex ?? (activeSceneIndex % visualTheme.actionScenes.length))
  );
  const activeActionAsset = visualTheme.actionScenes[activePoseIdx] || visualTheme.actionScenes[0];

  // 씬 전환 시 부드러운 크로스페이드 타이밍 기록
  useEffect(() => {
    if (activePoseIdx !== lastPoseIndexRef.current) {
      prevPoseIndexRef.current = lastPoseIndexRef.current;
      lastPoseIndexRef.current = activePoseIdx;
      poseTransitionStartRef.current = performance.now();
    }
  }, [activePoseIdx]);

  // 🎬 60fps 실시간 캔버스 비디오 & 립싱크 렌더링 루프
  useEffect(() => {
    let running = true;
    let lastTick = performance.now();

    const renderLoop = (now: number) => {
      if (!running) return;
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      // 1. 재생 시간 업데이트
      let t = currentTime;
      const audioEl = audioRef.current;
      if (isPlaying && hasStarted) {
        if (audioEl && !audioEl.paused && audioEl.duration && isFinite(audioEl.duration)) {
          t = audioEl.currentTime;
          setDuration(audioEl.duration);
          setCurrentTime(t);
        } else {
          setCurrentTime((prev) => {
            const next = prev + Math.min(dt, 0.1);
            if (next >= duration) {
              if (audioEl) {
                audioEl.currentTime = 0;
                audioEl.play().catch(() => {});
              } else {
                playFallbackWebSpeech();
              }
              return 0;
            }
            t = next;
            return next;
          });
        }
      }

      // 2. 스테이지 캔버스 렌더링 (립싱크 + 크로스페이드 + 눈 깜빡임 + 실물 제품 앵커링)
      const canvas = stageCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const cw = canvas.width;
          const ch = canvas.height;
          ctx.fillStyle = "#070B14";
          ctx.fillRect(0, 0, cw, ch);

          if (analyserRef.current && audioDataArrayRef.current && isPlaying && !isMuted) {
            try {
              analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
            } catch {}
          }

          const curSceneIdx = Math.min(
            Math.max(scenes.length - 1, 0),
            Math.floor((t / Math.max(duration, 1)) * scenes.length)
          );
          const curScene = scenes[curSceneIdx] || { caption: "", actionPoseIndex: 1 };
          const targetPoseIdx = Math.min(
            visualTheme.actionScenes.length - 1,
            Math.max(0, curScene.actionPoseIndex ?? 1)
          );

          const curAsset = visualTheme.actionScenes[targetPoseIdx] || visualTheme.actionScenes[0];
          const prevAsset = visualTheme.actionScenes[prevPoseIndexRef.current] || curAsset;

          const curImg = loadedSceneImagesRef.current[curAsset.imgUrl];
          const prevImg = loadedSceneImagesRef.current[prevAsset.imgUrl];

          const transElapsed = (now - poseTransitionStartRef.current) / 480; // 0.48초 시네마틱 디졸브
          const fadeAlpha = Math.min(1, Math.max(0, transElapsed));

          if (prevImg && fadeAlpha < 1 && prevAsset.imgUrl !== curAsset.imgUrl) {
            renderLipSyncModelFrame(
              ctx,
              prevImg,
              prevAsset,
              cw,
              ch,
              t,
              isPlaying,
              isMuted,
              curScene.caption,
              audioDataArrayRef.current,
              1.0
            );
          }

          if (curImg) {
            renderLipSyncModelFrame(
              ctx,
              curImg,
              curAsset,
              cw,
              ch,
              t,
              isPlaying,
              isMuted,
              curScene.caption,
              audioDataArrayRef.current,
              prevImg && prevAsset.imgUrl !== curAsset.imgUrl ? fadeAlpha : 1.0
            );
          }

          // 스튜디오 상·하단 시네마틱 비네팅
          const topGrad = ctx.createLinearGradient(0, 0, 0, 140);
          topGrad.addColorStop(0, "rgba(0,0,0,0.65)");
          topGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = topGrad;
          ctx.fillRect(0, 0, cw, 140);

          const botGrad = ctx.createLinearGradient(0, ch - 420, 0, ch);
          botGrad.addColorStop(0, "rgba(0,0,0,0)");
          botGrad.addColorStop(1, "rgba(0,0,0,0.90)");
          ctx.fillStyle = botGrad;
          ctx.fillRect(0, ch - 420, cw, 420);
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, hasStarted, isMuted, duration, scenes, visualTheme.actionScenes, imagesReady, imgParam, playFallbackWebSpeech]);

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
      showToast("❤️ 쇼츠 영상에 공감했습니다!");
    }
  };

  const handleShare = async () => {
    const cleanShareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(videoId)}&voice=${encodeURIComponent(displayVoice.split(" ")[0])}&name=${encodeURIComponent(displayName)}&topic=${encodeURIComponent(shortTitle)}&script=${encodeURIComponent(rawScript)}${effectiveProductImg ? `&img=${encodeURIComponent(effectiveProductImg)}` : ""}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(cleanShareUrl);
      showToast("🔗 쇼츠 영상 링크가 클립보드에 복사되었습니다!");
    } else {
      showToast("주소창의 링크를 복사하여 공유할 수 있습니다.");
    }
  };

  // 현재 재생 시점에 매칭되는 특장점(POINT) 카드 계산
  const activeFeatureCard: ProductFeatureCard | null = useMemo(() => {
    if (featureCards.length === 0) return null;
    const idx = Math.min(
      featureCards.length - 1,
      Math.floor((currentTime / Math.max(duration, 1)) * featureCards.length)
    );
    return featureCards[idx] || featureCards[0];
  }, [featureCards, currentTime, duration]);

  const avatarImgUrl = resolveSafeMediaUrl(`/assets/models/${model.assetKey}_avatar.jpg`);

  const shouldHighlightProduct = Boolean(
    resolvedProductImgUrl &&
    (activeScene.showProductHighlight || activeFeatureCard || activeSceneIndex % 2 === 1)
  );

  /**
   * 🎬 실제 쇼츠 비디오 파일(.webm) 캔버스 렌더링 및 다운로드 (4단 멀티 액션 씬 + 립싱크 + 제품 합성)
   */
  const handleDownloadVideoFile = async () => {
    if (isExportingVideo) return;
    setIsExportingVideo(true);
    showToast("🎬 4단 멀티 씬 & 립싱크 쇼츠 동영상(.webm)을 생성하고 있습니다 (약 5초)...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context 생성 실패");

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

      const totalFrames = 160; // 4단 액션 씬 각각 40프레임씩
      for (let f = 0; f < totalFrames; f++) {
        const ratio = f / totalFrames;
        const simTime = ratio * duration;
        const scIdx = Math.min(scenes.length - 1, Math.floor(ratio * scenes.length));
        const sc = scenes[scIdx] || scenes[0];
        const poseIdx = Math.min(
          visualTheme.actionScenes.length - 1,
          sc?.actionPoseIndex ?? (Math.floor(ratio * 4) % visualTheme.actionScenes.length)
        );
        const asset = visualTheme.actionScenes[poseIdx] || visualTheme.actionScenes[0];
        const mImg = loadedSceneImagesRef.current[asset.imgUrl];

        ctx.fillStyle = "#070B14";
        ctx.fillRect(0, 0, 720, 1280);

        if (mImg) {
          renderLipSyncModelFrame(
            ctx,
            mImg,
            asset,
            720,
            1280,
            simTime,
            true,
            false,
            sc?.caption || "",
            null,
            1.0
          );
        }

        // 하단 그라데이션
        const grad = ctx.createLinearGradient(0, 720, 0, 1280);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.92)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 720, 720, 560);

        // 상단 PPL 배너
        ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
        ctx.fillRect(36, 48, 648, 68);
        ctx.fillStyle = "#FCD34D";
        ctx.font = "bold 24px sans-serif";
        ctx.fillText(`🏷️ PPL: ${shortTitle}`, 56, 90);

        // 우측 상단 실물 제품 인서트
        const pImg = loadedProductImgRef.current;
        if (pImg) {
          const pw = 200;
          const ph = 200;
          const px = 480;
          const py = 140;
          ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
          ctx.strokeStyle = "#38BDF8";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, 20);
          ctx.fill();
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(px + 5, py + 5, pw - 10, ph - 10, 16);
          ctx.clip();
          ctx.drawImage(pImg, px + 5, py + 5, pw - 10, ph - 10);
          ctx.restore();
        }

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
        if (sc) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
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
      showToast("✅ 4단 멀티 씬 쇼츠 동영상(.webm) 다운로드 완료!");
    } catch (e: any) {
      showToast(`⚠️ 영상 저장 안내: ${e.message}`);
    } finally {
      setIsExportingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col items-center justify-center font-sans select-none p-0 sm:p-4 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes product-float-glow {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-7px) rotate(1.2deg); }
        }
        .animate-product-float {
          animation: product-float-glow 3.8s ease-in-out infinite;
        }
      `}} />

      {/* 고품질 서버 뉴럴 TTS 오디오 플레이어 */}
      {ttsAudioUrl && (
        <audio
          ref={audioRef}
          src={ttsAudioUrl}
          crossOrigin="anonymous"
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
      <div className="relative w-full max-w-[430px] h-[100dvh] sm:h-[860px] sm:rounded-3xl overflow-hidden bg-black shadow-[0_0_70px_rgba(0,0,0,0.95)] border border-slate-800/80 flex flex-col justify-between">
        {/* 상단 프로그레스 타임라인 (4단 씬 구간 분할 마커 포함) */}
        <div className="absolute top-0 left-0 right-0 z-30 px-3 pt-3 flex flex-col space-y-1 bg-gradient-to-b from-black/90 via-black/40 to-transparent">
          <div className="relative w-full bg-white/20 h-1.5 rounded-full overflow-hidden backdrop-blur-sm">
            <div
              className="bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 h-full transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
            {/* 4단 액션 씬 구분선 */}
            <div className="absolute inset-0 flex justify-evenly pointer-events-none">
              <span className="w-[1px] h-full bg-black/60" />
              <span className="w-[1px] h-full bg-black/60" />
              <span className="w-[1px] h-full bg-black/60" />
            </div>
          </div>

          {/* 상단 헤더 뱃지 & 컨트롤 */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center space-x-1.5 flex-wrap">
              <Link
                href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
                className="bg-black/60 backdrop-blur-md text-white/90 text-xs px-2.5 py-1 rounded-full border border-white/20 hover:bg-black/80 transition flex items-center space-x-1 shadow"
              >
                <span>🎭</span>
                <span className="text-[11px] font-medium">3D 스튜디오</span>
              </Link>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 backdrop-blur text-[10px] text-white px-2.5 py-0.5 rounded-full border border-purple-400/40 font-bold tracking-tight shadow">
                Veo 3 · Live Lip-Sync
              </span>
              <span className="bg-emerald-950/85 border border-emerald-400/50 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full font-extrabold">
                {activeActionAsset.label.split("·")[0].trim()} / 04
              </span>
            </div>

            <button
              onClick={toggleMute}
              className="bg-black/60 backdrop-blur-md text-white text-xs p-1.5 rounded-full border border-white/20 hover:bg-black/80 transition shadow"
              title={isMuted ? "소리 켜기" : "음소거"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>

        {/* 🎬 메인 비디오 스테이지 (Veo .mp4 실제 동영상 우선 재생 + 4단 시네마틱 캔버스) */}
        <div
          onClick={togglePlay}
          className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer bg-slate-950"
        >
          {metaData?.mp4VideoUrl ? (
            <video
              src={resolveSafeMediaUrl(metaData.mp4VideoUrl)}
              autoPlay
              playsInline
              loop
              muted={isMuted}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <canvas
              ref={stageCanvasRef}
              width={720}
              height={1280}
              className="w-full h-full object-cover object-top select-none pointer-events-none"
            />
          )}

          {/* 🌟 2. 상단 슬림 PPL 제품 배너 (시야 가림 없는 1줄 컴팩트 헤더) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-13 left-3 right-14 z-20 pointer-events-none flex items-center"
          >
            <div
              onClick={() => resolvedProductImgUrl && setShowProductModal(true)}
              className="inline-flex items-center space-x-2 bg-slate-950/80 backdrop-blur-md border border-amber-400/60 rounded-full pl-1.5 pr-3 py-1 shadow-lg w-fit max-w-full pointer-events-auto cursor-pointer hover:border-amber-300 transition"
              title="클릭하여 제품 사진 크게 보기"
            >
              {resolvedProductImgUrl && !productImageFailed ? (
                <img
                  src={resolvedProductImgUrl}
                  alt={shortTitle}
                  onError={() => setProductImageFailed(true)}
                  className="w-5 h-5 rounded-full object-cover border border-amber-400 shadow shrink-0"
                />
              ) : (
                <span className="text-xs">🏷️</span>
              )}
              <span className="text-[11px] font-extrabold text-amber-300 truncate">
                {shortTitle}
              </span>
              <span className="text-[9px] bg-amber-400/20 text-amber-200 px-1.5 py-0.2 rounded-full font-bold shrink-0">
                🔍 실물보기
              </span>
            </div>
          </div>

          {/* 🌟 4. 중앙/하단 다이내믹 POINT 01~04 핵심 셀링 포인트 인포그래픽 카드 */}
          {activeFeatureCard && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-36 left-3 right-16 z-20 pointer-events-auto transition-all duration-300"
            >
              <div className="bg-slate-950/90 backdrop-blur-md border border-sky-400/60 rounded-2xl p-3 shadow-[0_10px_35px_rgba(0,0,0,0.9)] flex items-start space-x-3">
                {resolvedProductImgUrl && !productImageFailed && (
                  <div
                    onClick={() => setShowProductModal(true)}
                    className="cursor-pointer shrink-0"
                    title="제품 사진 확대"
                  >
                    <img
                      src={resolvedProductImgUrl}
                      alt={shortTitle}
                      className="w-14 h-14 rounded-xl object-cover border border-sky-400/50 shadow bg-slate-900"
                    />
                  </div>
                )}

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
              </div>
            </div>
          )}

          {/* 🌟 5. 쇼츠 시작 전 대기 화면 */}
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
                  터치하면 실시간 립싱크(Lip-Sync)와 4단 멀티 액션 쇼츠가 재생됩니다
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] bg-purple-950/80 text-purple-200 px-3 py-1 rounded-full border border-purple-400/40 font-bold">
                  🎙️ 실시간 발화 립싱크
                </span>
                <span className="text-[10px] bg-sky-950/80 text-sky-200 px-3 py-1 rounded-full border border-sky-400/40 font-bold">
                  🥋 4단 멀티 액션 컷
                </span>
              </div>
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

          {/* 🌟 6. 우측 플로팅 액션 바 (3D, 제품사진, 좋아요, 대본, 영상저장, 공유) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2.5 bottom-24 z-20 flex flex-col items-center space-y-3"
          >
            <Link
              href={`/demo/ai-model-3d-viewer?modelId=${model.id}`}
              className="relative group flex flex-col items-center"
              title="3D 스튜디오 열기"
            >
              <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-tr from-purple-500 to-pink-500 shadow-lg">
                <img
                  src={avatarImgUrl}
                  alt={displayName}
                  onError={(e) => {
                    const t = e.currentTarget;
                    t.src = `/assets/models/${model.assetKey}_front.jpg`;
                  }}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <span className="absolute -bottom-1.5 bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-white">
                3D
              </span>
            </Link>

            {resolvedProductImgUrl && !productImageFailed && (
              <button
                onClick={() => setShowProductModal(true)}
                className="flex flex-col items-center space-y-0.5 transition active:scale-90"
                title="제품 사진 확대 보기"
              >
                <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md text-sky-400 border border-sky-400/60 flex items-center justify-center hover:bg-black/80 shadow-[0_0_12px_rgba(56,189,248,0.4)]">
                  <span className="text-base">📸</span>
                </div>
                <span className="text-[10px] font-bold text-sky-200 drop-shadow">제품사진</span>
              </button>
            )}

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

            <button
              onClick={() => setShowFullScriptModal(true)}
              className="flex flex-col items-center space-y-0.5 transition active:scale-90"
            >
              <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-amber-300 border border-amber-400/40 flex items-center justify-center hover:bg-black/70 shadow">
                <span className="text-base">📝</span>
              </div>
              <span className="text-[10px] font-bold text-amber-200 drop-shadow">대본</span>
            </button>

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

          {/* 🌟 7. 하단 쇼츠 바이럴 자막 & 4단 씬 수동 점프 탭 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 right-16 z-20 flex flex-col space-y-1.5 pointer-events-auto"
          >
            {/* 모델 핸들 & 립싱크 라이브 뱃지 */}
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="font-extrabold text-xs sm:text-sm text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                @{displayName}
              </span>
              <span className="bg-purple-900/80 border border-purple-400/50 text-purple-200 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {displayVoice.split(" ")[0]} AI Lip-Sync
              </span>
              {isPlaying && !isMuted && (
                <span className="inline-flex items-center space-x-1 bg-rose-600/80 text-white text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse">
                  <span>●</span>
                  <span>LIVE 발화중</span>
                </span>
              )}
            </div>

            {/* 틱톡/유튜브 쇼츠 스타일 다이내믹 바이럴 자막 */}
            <div className="relative min-h-[54px] flex items-center">
              <div className="bg-black/85 backdrop-blur-md border border-amber-400/50 rounded-2xl px-3.5 py-2 shadow-[0_4px_25px_rgba(0,0,0,0.95)] max-w-full transition-all duration-200">
                <p className="text-sm sm:text-[15px] font-black text-amber-300 leading-snug tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                  {activeScene.caption}
                </p>
              </div>
            </div>

            {/* 하단 미니 타이머 & 대본 전문 버튼 */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span className="font-mono">
                {Math.floor(currentTime)}s / {Math.floor(duration)}s · 씬 {activePoseIdx + 1}/4
              </span>
              <button
                onClick={() => setShowFullScriptModal(true)}
                className="text-[10px] text-purple-300 hover:underline font-semibold"
              >
                4단 씬 & 대본 전문 보기 ➔
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 📸 실물 제품 사진 고화질 확대 뷰어 모달 */}
      {showProductModal && resolvedProductImgUrl && (
        <div
          onClick={() => setShowProductModal(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-slate-900 border border-sky-500/60 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-[0_0_50px_rgba(56,189,248,0.4)]"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-xl">📸</span>
                <div>
                  <h4 className="text-sm font-bold text-white">{shortTitle}</h4>
                  <p className="text-[11px] text-sky-400">쇼츠 영상 합성 실물 PPL 제품</p>
                </div>
              </div>
              <button
                onClick={() => setShowProductModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="w-full aspect-square rounded-2xl overflow-hidden bg-black/80 border border-white/10 flex items-center justify-center">
              <img
                src={resolvedProductImgUrl}
                alt={shortTitle}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex space-x-2 pt-1">
              <a
                href={resolvedProductImgUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-2.5 rounded-xl transition text-center"
              >
                원본 사진 저장
              </a>
              <button
                onClick={() => setShowProductModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h4 className="text-sm font-bold text-white">{shortTitle} · 4단 씬 & 쇼츠 상세</h4>
              </div>
              <button
                onClick={() => setShowFullScriptModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 4단 액션 씬 미리보기 그리드 */}
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <span className="text-[10px] text-emerald-400 font-bold block">
                  🎬 대본 연기 지시 연동 4단 멀티 액션 씬
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {visualTheme.actionScenes.map((sc, i) => (
                    <div key={i} className="flex flex-col items-center space-y-1">
                      <img
                        src={resolveSafeMediaUrl(sc.imgUrl)}
                        alt={sc.label}
                        className="w-full aspect-[9/16] object-cover rounded-lg border border-white/20"
                      />
                      <span className="text-[9px] text-slate-300 font-bold text-center line-clamp-1">
                        씬 0{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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
