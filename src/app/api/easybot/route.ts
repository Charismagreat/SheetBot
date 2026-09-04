export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";
import { recordAiUsageLog } from "@/lib/ai-usage";

export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail();
    const body = await request.json();
    const { message, history } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ success: false, error: "메시지를 입력해 주세요." }, { status: 400 });
    }

    const systemPrompt = `당신은 Google 스프레드시트와 Google Apps Script(GAS) 자동화 전문 AI 어시스턴트 "이지봇(EasyBot)"입니다.
사용자는 구글 시트 기반 자동화 SaaS인 SheetBot을 이용하고 있습니다.

[당신의 역할 및 지침]:
1. Google Apps Script 코드 작성법, 구글 시트 수식(QUERY, VLOOKUP, ARRAYFORMULA 등), 정기 스케줄 및 트리거(onEdit, onOpen 등) 설정법에 대해 친절하고 전문적으로 답변하세요.
2. 코드를 안내할 때는 항상 깔끔한 마크다운 코드 블록(\`\`\`javascript 또는 \`\`\`gs)으로 작성하고, 각 라인에 주석을 달아 이해를 돕습니다.
3. 시트 자동화 시 발생할 수 있는 구글 API 할당량 한도나 예외 처리(try-catch)에 대한 팁을 함께 제공하세요.
4. 사용자가 특정 자동화 기능 작성을 원하면 "새 프로젝트 생성 모달"에서 구글 시트 URL과 함께 입력하여 원클릭으로 클라우드에 배포할 수 있음을 적극 안내하세요.
5. 답변은 항상 자연스러운 한국어로 친절하게 작성하세요.`;

    let conversationText = "";
    if (Array.isArray(history) && history.length > 0) {
      conversationText = history
        .slice(-6)
        .map((m: any) => `${m.role === "user" ? "사용자" : "이지봇"}: ${m.content}`)
        .join("\n");
    }

    const fullPrompt = `${systemPrompt}\n\n[이전 대화 내역]\n${conversationText}\n\n[사용자 최신 질문]\n${message}`;

    let replyContent = "";

    // 1. 이지데스크 AI Caller 우선 호출
    try {
      const callerRes = await callAiCaller(fullPrompt, {
        caller: "sheetbot-easybot",
        temperature: 0.4,
      });
      if (callerRes && callerRes.text) {
        replyContent = callerRes.text.trim();
      }
    } catch (err: any) {
      console.warn("[EasyBot] AI Caller call warning:", err.message);
    }

    // 2. Fallback Gemini 호출
    if (!replyContent) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
      if (apiKey) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                generationConfig: { temperature: 0.4 },
              }),
            }
          );
          if (geminiRes.ok) {
            const data = await geminiRes.json();
            replyContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          }
        } catch (apiErr: any) {
          console.warn("[EasyBot] Gemini fallback warning:", apiErr.message);
        }
      }
    }

    // 3. 기본 안전 응답 폴백
    if (!replyContent) {
      replyContent = `안녕하세요! Google Apps Script 및 스프레드시트 자동화 도우미 이지봇입니다. 🤖\n\n문의하신 "${message}"에 대한 안내입니다.\n\n구글 시트 상단 메뉴 자동화나 정기 실행 트리거가 필요하시면, 상단의 **[+ 새 프로젝트 생성]** 버튼을 눌러 스프레드시트 URL과 요구사항을 입력해 보세요. AI가 완벽한 \`Code.gs\` 코드를 자동 생성하여 구글 클라우드에 직접 배포해 드립니다.`;
    }

    // 실시간 AI 사용량 적재
    void recordAiUsageLog({
      userEmail: userEmail || "guest",
      caller: "sheetbot-easybot",
      purpose: "이지봇 실시간 대화",
      model: "gemini-2.0-flash",
      promptText: fullPrompt,
      responseText: replyContent,
    });

    return NextResponse.json({
      success: true,
      reply: replyContent,
      userEmail: userEmail || "guest",
    });
  } catch (error: any) {
    console.error("EasyBot API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
