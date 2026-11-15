"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ModelSpec {
  id: string;
  name: string;
  role: string;
  voice: string;
  height: string;
  outfit: string;
  lighting: string;
  description: string;
  avatarColor: string;
}

const PRESET_MODELS: Record<string, ModelSpec> = {
  model_jia: {
    id: "model_jia",
    name: "지아 (Jia)",
    role: "20대 후반 브랜드 앰배서더",
    voice: "Kore (밝고 친근한 톤)",
    height: "168cm / 슬림 체형",
    outfit: "테일러드 베이지 블레이저 & 슬랙스, 누드 펌프스",
    lighting: "소프트 스튜디오 확산광 (Diffused 85mm)",
    description: "밝고 신뢰감 있는 미소와 세련된 비즈니스 캐주얼로 뷰티, 카페, 패션, 라이프스타일 제품에 최적화된 대표 모델입니다.",
    avatarColor: "from-purple-500 to-indigo-600",
  },
  model_minsu: {
    id: "model_minsu",
    name: "민수 (Minsu)",
    role: "30대 스마트 비즈니스 매니저",
    voice: "Puck (명쾌하고 자신감 있는 톤)",
    height: "180cm / 슬림핏 정장",
    outfit: "다크 네이비 2피스 수트, 화이트 드레스 셔츠, 가죽 구두",
    lighting: "모던 글래스 오피스 하이라이트 라이팅",
    description: "단단하고 전문적인 인상으로 IT 솔루션, SaaS, 금융, B2B 비즈니스 및 고가 전자기기 홍보에 최적화되어 있습니다.",
    avatarColor: "from-blue-600 to-slate-800",
  },
  model_seoyeon: {
    id: "model_seoyeon",
    name: "서연 (Seoyeon)",
    role: "20대 후반 전문 컨설턴트",
    voice: "Aoede (지적이고 차분한 톤)",
    height: "166cm / 단정한 실루엣",
    outfit: "실크 크림 블라우스, 펜슬 스커트, 슬림 메탈릭 안경",
    lighting: "클래식 라이브러리 스튜디오 소프트 웜 라이트",
    description: "지적이고 안정감 있는 발화와 단아한 자세로 법률/세무, 학술, 교육, 프리미엄 웰니스 제품을 전문 담당합니다.",
    avatarColor: "from-emerald-600 to-teal-800",
  },
};

function ViewerContent() {
  const searchParams = useSearchParams();
  const initialModelId = searchParams.get("modelId") || "model_jia";
  const [selectedId, setSelectedId] = useState<string>(initialModelId);
  const [activeAngle, setActiveAngle] = useState<"FRONT" | "QUARTER" | "SIDE" | "WALK">("FRONT");
  const [pplEnabled, setPplEnabled] = useState(false);

  const model = PRESET_MODELS[selectedId] || PRESET_MODELS.model_jia;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 상단 네비게이션 */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🎭</span>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">SheetBot AI Model 3D Studio</h1>
            <p className="text-[10px] text-purple-400">Google Gemini &amp; Veo 3 Multimodal Persona</p>
          </div>
        </div>
        <span className="bg-purple-900/60 text-purple-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-purple-700/50">
          3D Interactive
        </span>
      </header>

      {/* 메인 뷰어 영역 */}
      <main className="flex-1 max-w-lg mx-auto w-full p-4 flex flex-col space-y-4">
        {/* 모델 선택 탭 */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          {Object.values(PRESET_MODELS).map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                selectedId === m.id
                  ? "bg-purple-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m.name.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* 3D 전신 쇼케이스 캔버스 카드 */}
        <div className="relative bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl p-6 flex flex-col items-center justify-center min-h-[460px]">
          {/* 상단 뱃지 */}
          <div className="absolute top-4 left-4 flex space-x-2">
            <span className="bg-black/60 backdrop-blur text-[11px] text-purple-300 px-3 py-1 rounded-full border border-purple-500/30 font-medium">
              8K Octane Render
            </span>
            <span className="bg-black/60 backdrop-blur text-[11px] text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/30 font-medium">
              신장 {model.height.split(" / ")[0]}
            </span>
          </div>

          {/* 3D 전신 아바타 비주얼 실루엣 플레이트 */}
          <div className="relative my-8 flex flex-col items-center">
            {/* 가상 3D 홀로그램 원형 베이스 플레이트 */}
            <div className="w-56 h-12 bg-purple-500/20 rounded-full blur-xl absolute bottom-0 -z-0"></div>
            <div className="w-48 h-6 rounded-full border border-purple-500/40 bg-purple-950/60 shadow-[0_0_20px_rgba(168,85,247,0.4)] absolute -bottom-2 -z-0"></div>

            {/* 전신 아바타 3D 카드 형상 */}
            <div className="w-44 h-80 rounded-2xl bg-gradient-to-tr from-slate-800 via-slate-700 to-slate-800 border-2 border-purple-400/50 shadow-2xl flex flex-col items-center justify-between p-4 relative overflow-hidden group">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${model.avatarColor} flex items-center justify-center text-3xl shadow-inner border border-white/20 mt-4`}>
                👤
              </div>

              {/* 체형 및 룩북 태그 */}
              <div className="text-center space-y-1 w-full z-10">
                <span className="inline-block text-[11px] font-bold text-white bg-purple-900/80 px-3 py-0.5 rounded-full border border-purple-400/40">
                  {model.name}
                </span>
                <p className="text-[10px] text-purple-200 font-medium">
                  {activeAngle === "FRONT" && "📐 정면 스튜디오 (Front 0°)"}
                  {activeAngle === "QUARTER" && "📐 반측면 포즈 (Quarter 45°)"}
                  {activeAngle === "SIDE" && "📐 측면 프로필 (Profile 90°)"}
                  {activeAngle === "WALK" && "🚶 자연스러운 워킹 포즈"}
                </p>
                {pplEnabled && (
                  <p className="text-[10px] text-amber-300 font-bold bg-amber-950/70 py-0.5 rounded border border-amber-600/40">
                    📷 손에 제품 든 컷 (PPL 합성 활성)
                  </p>
                )}
              </div>

              {/* 전신 비율 가이드라인 */}
              <div className="w-full text-center py-2 border-t border-slate-600/50">
                <span className="text-[9px] text-slate-400 tracking-wider">FULL BODY 3D RIGGED</span>
              </div>
            </div>
          </div>

          {/* 각도 제어 컨트롤러 */}
          <div className="w-full flex space-x-2 justify-center pt-2">
            {(["FRONT", "QUARTER", "SIDE", "WALK"] as const).map((angle) => (
              <button
                key={angle}
                onClick={() => setActiveAngle(angle)}
                className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                  activeAngle === angle
                    ? "bg-purple-600 text-white border-purple-400 font-bold shadow"
                    : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}
              >
                {angle === "FRONT" && "정면 0°"}
                {angle === "QUARTER" && "45도"}
                {angle === "SIDE" && "측면 90°"}
                {angle === "WALK" && "워킹"}
              </button>
            ))}
          </div>
        </div>

        {/* 모델 상세 스펙 카드 */}
        <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-purple-300">📋 {model.name} 전신 3D 스펙</h2>
            <button
              onClick={() => setPplEnabled(!pplEnabled)}
              className={`text-xs px-2.5 py-1 rounded-md border font-semibold transition ${
                pplEnabled
                  ? "bg-amber-600 text-white border-amber-400"
                  : "bg-slate-800 text-slate-300 border-slate-700"
              }`}
            >
              {pplEnabled ? "✓ 제품 PPL 모드 ON" : "+ 제품 PPL 합성 모드"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-800/60 p-2.5 rounded-lg">
              <span className="text-slate-400 block text-[10px]">🎙️ TTS 보이스</span>
              <span className="font-semibold text-slate-200">{model.voice}</span>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg">
              <span className="text-slate-400 block text-[10px]">📐 신장 / 체형</span>
              <span className="font-semibold text-slate-200">{model.height}</span>
            </div>
            <div className="col-span-2 bg-slate-800/60 p-2.5 rounded-lg">
              <span className="text-slate-400 block text-[10px]">👗 기본 의상</span>
              <span className="text-slate-200 text-[11px]">{model.outfit}</span>
            </div>
            <div className="col-span-2 bg-slate-800/60 p-2.5 rounded-lg">
              <span className="text-slate-400 block text-[10px]">💡 스튜디오 조명</span>
              <span className="text-slate-200 text-[11px]">{model.lighting}</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
            {model.description}
          </p>
        </div>

        {/* 모바일 닫기 / 앱 복귀 안내 */}
        <div className="text-center pt-2 pb-6">
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
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">로딩 중...</div>}>
      <ViewerContent />
    </Suspense>
  );
}
