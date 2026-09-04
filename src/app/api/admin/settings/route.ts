export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAiModelSettings, saveAiModelSettings, DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import { getCurrentUserEmail } from "@/lib/auth";

// 지원 모델 후보 목록 (Gemini 최신 라인업)
export const AVAILABLE_MODELS = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    tag: "추천 (최신 고속/고지능)",
    description: "빠른 응답 속도와 우수한 코드 작성 능력, 100만 토큰 컨텍스트 지원",
    isRecommended: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    tag: "초경량 / 최저비용",
    description: "단순 질의응답 및 도움말 호버 등 경량 작업에 최적화",
    isRecommended: false,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    tag: "안정성 검증",
    description: "이전 기본 Flash 모델로 안정적인 스크립트 작성",
    isRecommended: false,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
    tag: "경량형",
    description: "저비용 고속 응답용 2.5 라인업 경량 모델",
    isRecommended: false,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    tag: "심층 추론 (고성능)",
    description: "복잡한 대형 스프레드시트 구조 분석 및 정밀 스크립트 생성",
    isRecommended: false,
  },
];

export async function GET() {
  try {
    const settings = await getAiModelSettings();
    return NextResponse.json({
      success: true,
      settings,
      availableModels: AVAILABLE_MODELS,
      defaultSettings: DEFAULT_AI_SETTINGS,
    });
  } catch (error: any) {
    console.error("[Settings-API] GET Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "설정 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail().catch(() => null);
    const body = await request.json();

    const updated = await saveAiModelSettings(body, userEmail || "anonymous_admin");

    return NextResponse.json({
      success: true,
      message: "AI 모델 설정이 성공적으로 저장되었습니다.",
      settings: updated,
    });
  } catch (error: any) {
    console.error("[Settings-API] POST Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "설정 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
