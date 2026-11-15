export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { deductTokens } from "@/lib/token-wallet";

/**
 * AI Caller 응답 2중 언래핑 안전 파서 (재발 방지 절대 원칙)
 */
function unwrapAiCallerText(rawText: string): string {
  if (!rawText) return "";
  let clean = rawText.trim();
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed === "object" && parsed !== null) {
      if (typeof parsed.content === "string") return parsed.content;
      if (Array.isArray(parsed.content) && parsed.content[0]?.text) {
        return parsed.content[0].text;
      }
    }
  } catch {}
  return clean;
}

/**
 * POST /api/user/ai-model/script
 * 
 * 전속 모델(페르소나) 맞춤형 AI 홍보 쇼츠 대본 자동 추천
 */
export async function POST(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const headerPhone = req.headers.get("x-filetosheet-phone") || req.headers.get("x-sheetbot-phone");

    const json = await req.json().catch(() => ({}));
    const userEmailInput = String(json.userEmail || json.email || "").trim();
    const phoneInput = String(json.phoneNumber || json.phone || headerPhone || "").trim();
    const topic = String(json.topic || "").trim();
    const modelName = String(json.modelName || "지아").trim();
    const modelVoice = String(json.modelVoice || "Kore").trim();

    let userEmail = (userEmailInput && userEmailInput.includes("@"))
      ? userEmailInput.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    // 파투(FileToSheet) 휴대폰 로그인 회원 지원
    if (!userEmail && phoneInput) {
      const cleanDigits = phoneInput.replace(/[^0-9]/g, "");
      if (cleanDigits.length >= 8) {
        userEmail = `fts_${cleanDigits}@filetosheet.cloud`;
      }
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "구글 계정 로그인 또는 파투(FileToSheet) 휴대폰 로그인이 필요합니다." },
        { status: 401 }
      );
    }

    if (!topic) {
      return NextResponse.json({ success: false, error: "제품명이나 핵심 주제를 입력해 주세요." }, { status: 400 });
    }

    const systemPrompt = `당신은 최고 수준의 숏폼(유튜브 쇼츠, 인스타 릴스, 틱톡) 광고 카피라이터이자 브랜드 디렉터입니다.
회사 전속 모델인 '${modelName}'(보이스: ${modelVoice})의 페르소나를 살려, 15~30초 동안 시청자를 사로잡는 세로형 쇼츠 홍보 발화 대본을 작성하세요.

[규칙]
1. 첫 문장은 스크롤을 멈추게 하는 강력한 훅(Hook)으로 시작할 것.
2. 제품/서비스의 차별점과 혜택을 2~3문장으로 간결하고 명확하게 전달할 것.
3. 마지막은 친근한 행동 촉구(Call to Action: 프로필 링크 확인, 지금 바로 주문 등)로 마무리할 것.
4. 모델의 연기 톤 지시는 맨 앞이나 문맥에 '[연기 지시: 밝고 자신감 있는 미소로...]' 형식으로 자연스럽게 포함할 것.
5. 오직 모델이 발화할 대본과 연기 지시만 깔끔하게 출력하고, 불필요한 설명이나 따옴표는 생략할 것.`;

    const userPrompt = `제품/홍보 주제: ${topic}`;

    let script = "";
    try {
      const aiRes = await callAiCaller(
        `${systemPrompt}\n\n${userPrompt}`,
        { model: "gemini-2.5-flash" }
      );
      script = unwrapAiCallerText(aiRes?.text || aiRes?.content || "");
    } catch (e: any) {
      console.warn("[AiModelScript Fallback Used]:", e?.message);
    }

    if (!script) {
      script = `[연기 지시: 카메라를 향해 밝고 당당한 미소로 인사하며]\n안녕하세요! 전속 모델 ${modelName}입니다.\n\n[연기 지시: 제품의 핵심을 짚으며 신뢰감 넘치는 톤으로]\n이번에 새롭게 준비한 '${topic}'!\n직접 확인해보시면 탁월한 품질과 차별화된 매력을 바로 느끼실 수 있습니다.\n\n[연기 지시: 활기차게 제스처를 취하며]\n놓치면 아쉬운 특별 혜택, 지금 바로 확인해 보세요!`;
    }

    // 토큰 차감 및 감사 로그 기록 (대본 추천: 1토큰)
    await deductTokens(userEmail, 1, "AI 전속 모델 쇼츠 대본 추천").catch(() => {});
    await recordAiUsageLog({
      userEmail,
      feature: "AI_MODEL_SCRIPT",
      tokensUsed: 1,
      details: `주제: ${topic.slice(0, 30)}`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      script: script || `안녕하세요! ${modelName}입니다. 오늘 소개해드릴 제품은 ${topic}입니다. 지금 프로필 링크에서 만나보세요!`,
      modelName,
      modelVoice,
    });
  } catch (error: any) {
    console.error("[AiModelScript Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "대본 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
