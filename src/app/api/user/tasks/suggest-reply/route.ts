export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";

/**
 * POST /api/user/tasks/suggest-reply
 * 스마트 통합 할 일 허브(TasksActivity)에서 특정 과업(통화 녹음 후속조치, 문자, 카톡, 부재중, 주문/견적 등)을 선택했을 때,
 * 과업 맥락과 상대방 정보에 맞춘 AI 추천 답장 문구 3종을 실시간 생성합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email") || "";
    const phoneParam =
      body.phoneNumber ||
      req.headers.get("x-user-phone") ||
      "";
    const cleanPhone = String(phoneParam).replace(/[^0-9]/g, "");

    const userEmail =
      rawEmail ||
      (headerEmail.includes("@") ? headerEmail.trim().toLowerCase() : "") ||
      (cleanPhone.length >= 10 ? `${cleanPhone}@fts.local` : "guest@sheetbot.cloud");

    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const contactName = String(body.contactName || "").trim();
    const sourceType = String(body.sourceType || "SMS").trim().toUpperCase();

    if (!title) {
      return NextResponse.json(
        { success: false, error: "할 일 제목(title)이 필요합니다." },
        { status: 400 }
      );
    }

    const cleanName = contactName
      .replace(/\([0-9\-\s+]+\)/g, "")
      .replace(/^(고객|상대방)\s*:\s*/i, "")
      .trim();

    const sourceLabel =
      sourceType === "CALL_RECORDING"
        ? "통화 녹음 후속 조치"
        : sourceType === "MISSED_CALL"
        ? "부재중 전화 콜백/회신"
        : sourceType === "KAKAO"
        ? "카카오톡 대화 답장"
        : sourceType === "ORDER_DELAY" || sourceType === "ORDER"
        ? "주문/견적 처리 안내"
        : "비즈니스 문자 답장";

    const prompt = `당신은 비즈니스 커뮤니케이션 전문가입니다.
사용자가 스마트폰 '통합 할 일 허브'에서 아래 할 일(과업)을 보고 상대방(${cleanName || "고객/거래처"})에게 보낼 답장 문자(또는 카카오톡 메시지)를 작성하려고 합니다.

[과업 정보]
- 출처 유형: ${sourceLabel} (${sourceType})
- 상대방 이름/상호: ${cleanName || "고객님"}
- 할 일 제목: ${title}
- 상세 요약/원문: ${description || "(상세 내용 없음)"}

[작성 지침]
1. 위 할 일 내용에 등장하는 핵심 키워드(예: 품목명, 서류명, API 키, 일정, 시간, 장소, 금액 등)를 자연스럽게 반영하여, 바로 전송할 수 있는 정중하고 자연스러운 한국어 답장 문구 3가지를 작성하세요.
2. 할 일 제목이 "본인: 상대방으로부터 코아스카 API 키를 전달받아..." 또는 "상대방이 3시 반쯤 출발 예정..."처럼 제3자 요약문 형태라도, 실제 상대방에게 보내는 1인칭 비즈니스 메시지("안녕하세요...", "말씀해주신...")로 자연스럽게 변환하세요.
3. 3가지 문구는 각각 다음 스타일로 구성하세요:
   - 1번(즉시 실행/요청형): 해당 과업의 핵심 요청·전달·진행 사항을 명확하고 정중하게 안내하는 문구 (40~75자 내외)
   - 2번(일정/확인 약속형): 확인 후 빠르게 처리하거나 회신/연락드리겠다는 신뢰감 있는 문구 (35~65자 내외)
   - 3번(간결 단문형): 핵심만 짧고 깔끔하게 전달하는 단문 메시지 (25~45자 내외, SMS 단문 규격 적합)
4. 반드시 아래 JSON 배열 형식으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON만 출력):
{
  "suggestions": [
    "추천 문구 1",
    "추천 문구 2",
    "추천 문구 3"
  ]
}`;

    const aiRes = await callAiCaller(prompt, {
      caller: `task_reply_suggest:${userEmail}`,
      model: "gemini-3.8-flash",
      temperature: 0.3,
      maxOutputTokens: 400,
    });

    let rawText = String(aiRes.text || aiRes.content || "").trim();
    if (rawText.startsWith("```json")) {
      rawText = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        suggestions = parsed.map((s) => String(s || "").trim()).filter(Boolean);
      } else if (parsed && Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions.map((s: any) => String(s || "").trim()).filter(Boolean);
      }
    } catch {
      // JSON 파싱 실패 시 줄 단위 추출 폴백
      suggestions = rawText
        .split(/\r?\n/)
        .map((l) => l.replace(/^[0-9\-\•\*\.\s"']+|[",']+$/g, "").trim())
        .filter((l) => l.length >= 10 && !l.startsWith("{") && !l.startsWith("]"));
    }

    if (suggestions.length === 0) {
      const prefix = cleanName ? `${cleanName}님, ` : "";
      suggestions = [
        `안녕하세요 ${prefix}말씀해주신 내용 확인하여 빠르게 진행 후 안내드리겠습니다.`,
        `${prefix}요청하신 사항 확인 중입니다. 정리되는 대로 곧 연락드리겠습니다.`,
        `확인 감사합니다. 처리 완료 후 다시 말씀드리겠습니다.`,
      ];
    }

    return NextResponse.json({
      success: true,
      suggestions: suggestions.slice(0, 3),
    });
  } catch (err: any) {
    console.error("[Task Suggest Reply API] Error:", err);
    return NextResponse.json({
      success: true,
      suggestions: [
        "안녕하세요, 말씀하신 내용 확인 후 빠르게 진행하여 연락드리겠습니다.",
        "요청하신 건 확인 중입니다. 처리되는 대로 바로 회신드리겠습니다.",
        "네, 확인했습니다. 곧 연락드리겠습니다.",
      ],
    });
  }
}
