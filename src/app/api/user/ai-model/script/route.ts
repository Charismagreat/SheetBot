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
 * 안전한 URL/헤더 디코딩 헬퍼
 */
function safeDecode(val: string | null | undefined): string {
  if (!val) return "";
  try {
    return decodeURIComponent(val).trim();
  } catch {
    return val.trim();
  }
}

/**
 * 전속 모델(페르소나) 맞춤형 AI 홍보 쇼츠 대본 자동 추천 공통 핸들러
 */
async function handleScriptSuggestion(req: NextRequest) {
  try {
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const searchParams = req.nextUrl.searchParams;

    // 헤더 값 추출 (다양한 커스텀 헤더 지원)
    const headerEmail = safeDecode(req.headers.get("x-sheetbot-user-email") || req.headers.get("x-user-email"));
    const headerPhone = safeDecode(req.headers.get("x-filetosheet-phone") || req.headers.get("x-sheetbot-phone"));
    const headerTopic = safeDecode(req.headers.get("x-sheetbot-topic") || req.headers.get("x-topic"));
    const headerModelName = safeDecode(req.headers.get("x-sheetbot-model-name") || req.headers.get("x-model-name"));
    const headerModelVoice = safeDecode(req.headers.get("x-sheetbot-model-voice") || req.headers.get("x-model-voice"));

    // 요청 바디 파싱 (터널 프록시 chunked transfer 및 stream 유실 3단 방어)
    let json: Record<string, any> = {};
    const rawText = await req.text().catch(() => "");
    if (rawText && rawText.trim()) {
      try {
        json = JSON.parse(rawText.trim());
      } catch {
        // JSON 파싱 실패 시 x-www-form-urlencoded 또는 URLSearchParams 형태 파싱 시도
        try {
          const params = new URLSearchParams(rawText.trim());
          for (const [key, value] of params.entries()) {
            json[key] = value;
          }
        } catch {}
      }
    }

    // 1. topic 다중 채널 폴백 추출 (JSON -> 쿼리 스트링 -> 헤더)
    let topic = String(
      json.topic ||
      searchParams.get("topic") ||
      headerTopic ||
      ""
    ).trim();

    // 2. 모델 정보 추출
    const modelName = String(
      json.modelName ||
      searchParams.get("modelName") ||
      headerModelName ||
      "지아"
    ).trim();

    const modelVoice = String(
      json.modelVoice ||
      searchParams.get("modelVoice") ||
      headerModelVoice ||
      "Kore"
    ).trim();

    // 3. 사용자 식별자 추출 (JSON -> 쿼리 스트링 -> 헤더 -> 세션 -> 전화번호)
    const userEmailInput = String(
      json.userEmail ||
      json.email ||
      searchParams.get("userEmail") ||
      searchParams.get("email") ||
      ""
    ).trim();

    const phoneInput = String(
      json.phoneNumber ||
      json.phone ||
      searchParams.get("phoneNumber") ||
      searchParams.get("phone") ||
      headerPhone ||
      ""
    ).trim();

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

    // 사용자 식별자가 없더라도 게스트 폴백으로 대본 추천 허용 (401 에러로 UX 중단 방지)
    if (!userEmail) {
      userEmail = "guest_aimodel@sheetbot.cloud";
    }

    // 4. 제품명/주제가 비어있는 경우: 400 에러를 반환하지 않고 모델 페르소나 기본 추천 주제로 지능형 대체 (400 원천 차단)
    if (!topic) {
      topic = `${modelName} 추천 트렌디 인기 상품`;
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

    // 토큰 차감 및 감사 로그 기록 (대본 추천: 1토큰 - 비회원 게스트는 차감 무시)
    if (userEmail && !userEmail.startsWith("guest_")) {
      await deductTokens(userEmail, 1, "AI 전속 모델 쇼츠 대본 추천").catch(() => {});
      await recordAiUsageLog({
        userEmail,
        feature: "AI_MODEL_SCRIPT",
        tokensUsed: 1,
        details: `주제: ${topic.slice(0, 30)}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      script: script || `안녕하세요! ${modelName}입니다. 오늘 소개해드릴 제품은 ${topic}입니다. 지금 프로필 링크에서 만나보세요!`,
      topic,
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

export async function POST(req: NextRequest) {
  return handleScriptSuggestion(req);
}

export async function GET(req: NextRequest) {
  return handleScriptSuggestion(req);
}
