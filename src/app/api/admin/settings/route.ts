export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAiModelSettings, saveAiModelSettings, DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import { getCurrentUserEmail } from "@/lib/auth";

// 지원 모델 후보 목록 (Gemini 최신 라인업)
export const AVAILABLE_MODELS = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    tag: "최신 플래그십 (강력 추천)",
    description: "가장 최신 세대 고속/초지능 모델로 극대화된 코딩 및 스프레드시트 수식 해결 능력",
    isRecommended: true,
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    tag: "최신 고지능",
    description: "복잡한 다단계 비즈니스 로직 및 고난도 Apps Script 작성에 최적화",
    isRecommended: false,
  },
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    tag: "고성능 안정화",
    description: "우수한 처리 속도와 높은 답변 정확도를 겸비한 3.x 세대 플래시 모델",
    isRecommended: false,
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    tag: "3.5 표준 추천",
    description: "빠른 응답 속도와 우수한 코드 작성 능력, 100만 토큰 컨텍스트 지원",
    isRecommended: false,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite",
    tag: "초경량 / 최저비용",
    description: "단순 질의응답 및 도움말 호버 등 경량 작업에 최적화된 저비용 모델",
    isRecommended: false,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    tag: "2.5 표준",
    description: "이전 2.5 기본 Flash 모델로 안정적인 스크립트 작성",
    isRecommended: false,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    tag: "심층 추론 (Pro)",
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
