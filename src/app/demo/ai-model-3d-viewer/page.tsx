"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getEgdeskBasePath } from "@/lib/egdesk-helpers";

function resolveStaticAssetUrl(relativePath: string): string {
  const cleanRel = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  if (typeof window === "undefined") {
    return `/t/mcp-server-fxkud1/p/SheetBot${cleanRel}`;
  }
  const basePath = getEgdeskBasePath();
  if (basePath) return `${basePath}${cleanRel}`;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return cleanRel;
  return `/t/mcp-server-fxkud1/p/SheetBot${cleanRel}`;
}

interface ModelSpec {
  id: string;
  assetKey: "jia" | "minsu" | "seoyeon";
  name: string;
  role: string;
  voice: string;
  height: string;
  outfit: string;
  lighting: string;
  description: string;
  accentColor: string;
}

const PRESET_MODELS: Record<string, ModelSpec> = {
  model_jia: {
    id: "model_jia",
    assetKey: "jia",
    name: "지아 (Jia)",
    role: "20대 후반 브랜드 앰배서더",
    voice: "Kore (밝고 친근한 톤)",
    height: "168cm / 슬림 체형",
    outfit: "테일러드 베이지 블레이저 & 슬랙스, 누드 펌프스",
    lighting: "소프트 스튜디오 확산광 (Diffused 85mm)",
    description:
      "밝고 신뢰감 있는 미소와 세련된 비즈니스 캐주얼로 뷰티, 카페, 패션, 라이프스타일 제품에 최적화된 대표 모델입니다.",
    accentColor: "purple",
  },
  model_minsu: {
    id: "model_minsu",
    assetKey: "minsu",
    name: "민수 (Minsu)",
    role: "30대 스마트 비즈니스 매니저",
    voice: "Puck (명쾌하고 자신감 있는 톤)",
    height: "180cm / 슬림핏 정장",
    outfit: "다크 네이비 2피스 수트, 화이트 드레스 셔츠, 가죽 구두",
    lighting: "모던 글래스 오피스 하이라이트 라이팅",
    description:
      "단단하고 전문적인 인상으로 IT 솔루션, SaaS, 금융, B2B 비즈니스 및 고가 전자기기 홍보에 최적화되어 있습니다.",
    accentColor: "blue",
  },
  model_seoyeon: {
    id: "model_seoyeon",
    assetKey: "seoyeon",
    name: "서연 (Seoyeon)",
    role: "20대 후반 전문 컨설턴트",
    voice: "Aoede (지적이고 차분한 톤)",
    height: "166cm / 단정한 실루엣",
    outfit: "실크 크림 블라우스, 펜슬 스커트, 슬림 메탈릭 안경",
    lighting: "클래식 라이브러리 스튜디오 소프트 웜 라이트",
    description:
      "지적이고 안정감 있는 발화와 단아한 자세로 법률/세무, 학술, 교육, 프리미엄 웰니스 제품을 전문 담당합니다.",
    accentColor: "emerald",
  },
};

type AngleKey = "front" | "quarter" | "side" | "walk" | "sheet";
const ROTATION_ORDER: AngleKey[] = ["front", "quarter", "side", "walk"];

const ANGLE_LABELS: Record<AngleKey, { short: string; full: string; deg: string }> = {
  front: { short: "정면 0°", full: "📐 정면 스튜디오 (Front 0°)", deg: "0°" },
  quarter: { short: "45도", full: "📐 반측면 포즈 (Quarter 45°)", deg: "45°" },
  side: { short: "측면 90°", full: "📐 측면 프로필 (Profile 90°)", deg: "90°" },
  walk: { short: "워킹/프리젠테이션", full: "🚶 제품 소개 & 프리젠테이션 포즈", deg: "PPL" },
  sheet: { short: "4분할 시트", full: "🖼️ 360° 전신 턴어라운드 마스터 시트", deg: "360°" },
};

function ViewerContent() {
  const searchParams = useSearchParams();
  const rawModelId = searchParams.get("modelId") || "model_jia";
  const initialId = PRESET_MODELS[rawModelId] ? rawModelId : "model_jia";

  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [activeAngle, setActiveAngle] = useState<AngleKey>("front");
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [pplEnabled, setPplEnabled] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [dragDeltaX, setDragDeltaX] = useState<number>(0);

  const dragStartXRef = useRef<number | null>(null);
  const model = PRESET_MODELS[selectedId] || PRESET_MODELS.model_jia;

  // 자동 회전 턴테이블 타이머
  useEffect(() => {
    if (!autoRotate) return;
    const timer = setInterval(() => {
      setActiveAngle((prev) => {
        const idx = ROTATION_ORDER.indexOf(prev === "sheet" ? "front" : prev);
        return ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
      });
    }, 1600);
    return () => clearInterval(timer);
  }, [autoRotate]);

  // 드래그 / 터치 스와이프로 3D 각도 회전
  const handlePointerDown = (clientX: number) => {
    dragStartXRef.current = clientX;
    setDragDeltaX(0);
  };

  const handlePointerMove = (clientX: number) => {
    if (dragStartXRef.current === null) return;
    const delta = clientX - dragStartXRef.current;
    setDragDeltaX(Math.max(-45, Math.min(45, delta)));

    if (Math.abs(delta) > 48) {
      const currentIdx = ROTATION_ORDER.indexOf(activeAngle === "sheet" ? "front" : activeAngle);
      const nextIdx =
        delta > 0
          ? (currentIdx + 1) % ROTATION_ORDER.length
          : (currentIdx - 1 + ROTATION_ORDER.length) % ROTATION_ORDER.length;
      setActiveAngle(ROTATION_ORDER[nextIdx]);
      dragStartXRef.current = clientX;
      setDragDeltaX(0);
    }
  };

  const handlePointerUp = () => {
    dragStartXRef.current = null;
    setDragDeltaX(0);
  };

  const currentImageUrl =
    activeAngle === "sheet"
      ? resolveStaticAssetUrl(`/assets/models/${model.assetKey}_turnaround.jpg`)
      : resolveStaticAssetUrl(`/assets/models/${model.assetKey}_${activeAngle}.jpg`);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans select-none">
      {/* 모든 각도 이미지 프리로드 (끊김 없는 0ms 각도 전환 보장) */}
      <div className="hidden" aria-hidden="true">
        {Object.values(PRESET_MODELS).map((m) =>
          (["front", "quarter", "side", "walk", "turnaround"] as const).map((ang) => (
            <img key={`${m.id}_${ang}`} src={resolveStaticAssetUrl(`/assets/models/${m.assetKey}_${ang}.jpg`)} alt="" />
          ))
        )}
      </div>

      {/* 상단 네비게이션 헤더 */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-2.5">
          <span className="text-xl">🎭</span>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">
              SheetBot AI Model 3D Studio
            </h1>
            <p className="text-[10px] text-purple-400">
              Google Gemini &amp; Veo 3 Multimodal Persona
            </p>
          </div>
        </div>
        <button
          onClick={() => setAutoRotate((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-all flex items-center space-x-1 ${
            autoRotate
              ? "bg-purple-600 text-white border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.6)]"
              : "bg-purple-950/60 text-purple-300 border-purple-700/50 hover:bg-purple-900/60"
          }`}
        >
          <span>{autoRotate ? "⏸ 회전 정지" : "🔄 360° 자동 회전"}</span>
        </button>
      </header>

      {/* 메인 뷰어 컨테이너 */}
      <main className="flex-1 max-w-lg mx-auto w-full p-3.5 flex flex-col space-y-3.5">
        {/* 모델 선택 탭 (실제 3D 얼굴 썸네일 포함) */}
        <div className="grid grid-cols-3 gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
          {Object.values(PRESET_MODELS).map((m) => {
            const isSelected = selectedId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedId(m.id);
                  setIsZoomed(false);
                }}
                className={`flex items-center justify-center space-x-2 py-2 px-2 rounded-lg transition-all ${
                  isSelected
                    ? "bg-purple-600 text-white shadow-lg ring-1 ring-purple-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <img
                  src={resolveStaticAssetUrl(`/assets/models/${m.assetKey}_avatar.jpg`)}
                  alt={m.name}
                  className="w-6 h-6 rounded-full object-cover border border-white/30"
                />
                <span className="text-xs font-bold">{m.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        {/* 3D 전신 인터랙티브 뷰포트 */}
        <div className="relative bg-[#0B111E] rounded-2xl border border-purple-500/30 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col items-center justify-between min-h-[540px]">
          {/* 상단 스펙 뱃지 & 확대 버튼 */}
          <div className="w-full flex items-center justify-between p-3.5 z-20">
            <div className="flex items-center space-x-1.5">
              <span className="bg-slate-900/85 backdrop-blur text-[11px] text-purple-300 px-2.5 py-1 rounded-full border border-purple-500/40 font-semibold">
                8K Octane Render
              </span>
              <span className="bg-slate-900/85 backdrop-blur text-[11px] text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/40 font-semibold">
                신장 {model.height.split(" / ")[0]}
              </span>
            </div>
            <button
              onClick={() => setIsZoomed((z) => !z)}
              className="bg-slate-900/85 backdrop-blur text-[11px] text-slate-200 px-2.5 py-1 rounded-full border border-slate-700 hover:border-purple-400 transition"
            >
              {isZoomed ? "🔎 축소" : "🔍 확대"}
            </button>
          </div>

          {/* 3D 전신 렌더링 이미지 스테이지 (좌우 드래그 턴테이블 지원) */}
          <div
            className="relative flex-1 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing px-2"
            onMouseDown={(e) => handlePointerDown(e.clientX)}
            onMouseMove={(e) => handlePointerMove(e.clientX)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
            onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
            onTouchEnd={handlePointerUp}
          >
            {activeAngle === "sheet" ? (
              <div className="w-full py-4 flex flex-col items-center">
                <img
                  src={currentImageUrl}
                  alt={`${model.name} 360 턴어라운드 시트`}
                  className={`w-full rounded-xl border border-purple-500/30 shadow-2xl transition-transform duration-300 ${
                    isZoomed ? "scale-125" : "scale-100"
                  }`}
                  draggable={false}
                />
                <p className="text-[11px] text-purple-300 mt-3 font-medium">
                  💡 정면(0°) · 반측면(45°) · 측면(90°) · 프리젠테이션 4분할 마스터 시트
                </p>
              </div>
            ) : (
              <div
                className="relative flex items-center justify-center transition-transform duration-200 ease-out"
                style={{
                  transform: `perspective(900px) rotateY(${dragDeltaX * 0.35}deg) scale(${
                    isZoomed ? 1.28 : 1.0
                  })`,
                }}
              >
                <img
                  src={currentImageUrl}
                  alt={`${model.name} - ${ANGLE_LABELS[activeAngle].full}`}
                  className="max-h-[430px] w-auto object-contain rounded-xl select-none pointer-events-none drop-shadow-[0_10px_25px_rgba(139,92,246,0.25)]"
                  draggable={false}
                />

                {/* PPL 제품 합성 시뮬레이션 오버레이 */}
                {pplEnabled && (
                  <div className="absolute right-3 top-1/3 bg-amber-950/90 backdrop-blur-md border border-amber-400/60 rounded-xl px-3 py-2 shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center space-x-2 animate-pulse">
                    <span className="text-lg">🧴</span>
                    <div>
                      <p className="text-[10px] font-bold text-amber-300">PPL 제품 핸드 트래킹</p>
                      <p className="text-[9px] text-amber-100">Veo 3 앵커 포인트 동기화됨</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 좌우 스와이프 안내 힌트 오버레이 */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur px-3 py-1 rounded-full border border-slate-800/80 flex items-center space-x-2 pointer-events-none">
              <span className="text-[10px] text-purple-300 font-semibold">
                {ANGLE_LABELS[activeAngle].full}
              </span>
              <span className="text-[10px] text-slate-400">· 좌우로 밀어서 회전 ↔</span>
            </div>
          </div>

          {/* 하단 각도 선택 컨트롤 바 */}
          <div className="w-full bg-slate-900/90 border-t border-slate-800/80 p-3 flex flex-wrap gap-1.5 justify-center z-20">
            {(["front", "quarter", "side", "walk", "sheet"] as AngleKey[]).map((angle) => (
              <button
                key={angle}
                onClick={() => {
                  setAutoRotate(false);
                  setActiveAngle(angle);
                }}
                className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                  activeAngle === angle
                    ? "bg-purple-600 text-white border-purple-400 font-bold shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                    : "bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500"
                }`}
              >
                {ANGLE_LABELS[angle].short}
              </button>
            ))}
          </div>
        </div>

        {/* 모델 상세 3D 스펙 카드 */}
        <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img
                src={resolveStaticAssetUrl(`/assets/models/${model.assetKey}_avatar.jpg`)}
                alt={model.name}
                className="w-8 h-8 rounded-full object-cover border border-purple-400/50"
              />
              <div>
                <h2 className="text-sm font-bold text-purple-300">
                  📋 {model.name} 전신 3D 스펙
                </h2>
                <p className="text-[10px] text-slate-400">{model.role}</p>
              </div>
            </div>
            <button
              onClick={() => {
                const next = !pplEnabled;
                setPplEnabled(next);
                if (next) setActiveAngle("walk");
              }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition ${
                pplEnabled
                  ? "bg-amber-600 text-white border-amber-400 shadow"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
              }`}
            >
              {pplEnabled ? "✓ 제품 PPL 모드 ON" : "+ 제품 PPL 합성 모드"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block text-[10px]">🎙️ TTS 보이스</span>
              <span className="font-semibold text-slate-200">{model.voice}</span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block text-[10px]">📐 신장 / 체형</span>
              <span className="font-semibold text-slate-200">{model.height}</span>
            </div>
            <div className="col-span-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block text-[10px]">👗 기본 의상</span>
              <span className="text-slate-200 text-[11px]">{model.outfit}</span>
            </div>
            <div className="col-span-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block text-[10px]">💡 스튜디오 조명</span>
              <span className="text-slate-200 text-[11px]">{model.lighting}</span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            {model.description}
          </p>
        </div>

        {/* 모바일 닫기 / 앱 복귀 안내 */}
        <div className="text-center pt-1 pb-5">
          <p className="text-[11px] text-slate-500">
            스마트폰 뒤로가기 버튼(◀)을 누르면 시트봇 앱으로 복귀합니다.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AiModel3dViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070B14] text-white flex items-center justify-center text-sm">
          3D 모델 스튜디오 로딩 중...
        </div>
      }
    >
      <ViewerContent />
    </Suspense>
  );
}
