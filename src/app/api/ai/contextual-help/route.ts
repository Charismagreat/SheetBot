export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { callAiCaller } from "@/lib/egdesk-helpers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hintKey, hintText, pagePath } = body;

    if (!hintKey && !hintText) {
      return NextResponse.json({ success: false, error: "힌트 정보가 누락되었습니다." }, { status: 400 });
    }

    const prompt = `당신은 Google 스프레드시트 및 Google Apps Script(GAS) 자동화 SaaS "SheetBot"의 AI 안내 도우미입니다.
현재 사용자가 웹 화면의 [${hintKey || "항목"}] 요소에 마우스를 올렸습니다.
힌트 요약: "${hintText || ""}"
현재 페이지 경로: "${pagePath || "/dashboard"}"

사용자가 이 기능을 200% 활용할 수 있도록 친절하고 명확하게 한국어로 1~3문장 이내로 핵심 설명과 실무 팁을 안내해 주세요.
불필요한 인사말이나 서론은 생략하고, 바로 본론 설명과 활용 팁만 작성하세요.`;

    let explanation = "";

    try {
      const callerRes = await callAiCaller(prompt, {
        caller: "sheetbot-contextual-help",
        temperature: 0.3,
      });
      if (callerRes && callerRes.text) {
        explanation = callerRes.text.trim();
      }
    } catch (err: any) {
      console.warn("[Contextual-Help] AI Caller warning:", err.message);
    }

    if (!explanation) {
      explanation = hintText
        ? `💡 ${hintText} 기능입니다. 시트 자동화 및 스케줄 연동에 필요한 설정을 안전하게 관리할 수 있습니다.`
        : `💡 해당 항목은 Google 스프레드시트 및 Apps Script 자동화 제어를 위한 인터페이스입니다.`;
    }

    return NextResponse.json({
      success: true,
      hintKey,
      explanation,
    });
  } catch (error: any) {
    console.error("Contextual Help error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
