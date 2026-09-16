export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { callAiCaller } from "@/lib/egdesk-helpers";
import type { ProposalData } from "@/lib/proposal-generator";

/**
 * 텍스트에서 JSON 블록을 추출하여 파싱하는 헬퍼
 */
function extractJsonFromText(text: string): any {
  if (!text) return null;
  // 1. ```json ... ``` 패턴 검사
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const targetStr = match ? match[1].trim() : text.trim();

  try {
    return JSON.parse(targetStr);
  } catch {
    // 2. { ... } 가장 바깥쪽 블록 탐색
    const firstBrace = targetStr.indexOf("{");
    const lastBrace = targetStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const braceJson = targetStr.slice(firstBrace, lastBrace + 1);
      return JSON.parse(braceJson);
    }
    throw new Error("AI 응답에서 유효한 JSON을 파싱할 수 없습니다.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { currentProposal, prompt } = body as {
      currentProposal: ProposalData;
      prompt: string;
    };

    if (!currentProposal) {
      return NextResponse.json({ success: false, error: "현재 견적서 데이터가 누락되었습니다." }, { status: 400 });
    }

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: "수정 지시사항을 입력해 주세요." }, { status: 400 });
    }

    const systemPrompt = `당신은 SheetBot Enterprise AX 공식 구축 제안서 및 견적서 전문 편집 AI입니다.
관리자의 자연어 지시사항에 따라 주어진 현재 견적서 JSON(ProposalData)의 특정 항목들을 정확하게 수정, 추가, 삭제하여 완전한 새 JSON을 생성해야 합니다.

[엄격한 수정 규칙]
1. 관리자의 지시사항(담당자 변경, 구축 범위 추가/삭제, 세부 견적 항목 수정/삭제/추가, 단가 변경 등)을 충실히 반영하세요.
2. 금액 무결성 보장 (매우 중요):
   - items의 각 항목: amount = quantity * unitPrice
   - quotation.subtotal = items 모든 항목의 amount 합계
   - quotation.vat = Math.round(subtotal * 0.1) (10%)
   - quotation.total = subtotal + vat
   - voucherDiscount가 존재하는 경우:
     - governmentSupportAmount = Math.round(subtotal * (supportRatio / 100))
     - clientSelfPayAmount = subtotal - governmentSupportAmount
3. 관리자가 명시적으로 변경을 지시하지 않은 기존 필드(공급자 정보 provider, 문서번호 docNumber, 발행일 등)는 기존 값을 그대로 유지하세요.
4. 고객 접수 요구사항(customerRequestInfo)이나 프로젝트 목적(objective), 구축 범위(targetAreas)도 지시 내용에 따라 자연스럽게 동기화하세요.
5. 오직 유효한 ProposalData JSON 하나만 반환하세요 (설명이나 부가 텍스트 금지).`;

    const userMessage = `[현재 견적서 데이터 JSON]
${JSON.stringify(currentProposal, null, 2)}

[관리자 자연어 수정 지시사항]
${prompt}

위 지시사항을 100% 반영하여 계산식과 데이터가 완벽하게 일치하는 새로운 ProposalData JSON을 생성해 주세요.`;

    const aiRes = await callAiCaller(userMessage, {
      model: "gemini-3.8-flash",
      temperature: 0.1,
      systemPrompt,
    });

    const parsedJson = extractJsonFromText(aiRes.text || aiRes.content || "");
    if (!parsedJson || !parsedJson.quotation || !Array.isArray(parsedJson.quotation.items)) {
      throw new Error("AI가 생성한 견적서 형식이 올바르지 않습니다.");
    }

    // 금액 무결성 2차 방어 검증 (자바스크립트 수식 재연산)
    const items = parsedJson.quotation.items.map((item: any) => {
      const q = Number(item.quantity) || 1;
      const p = Number(item.unitPrice) || 0;
      return {
        ...item,
        quantity: q,
        unitPrice: p,
        amount: q * p,
      };
    });

    const subtotal = items.reduce((sum: number, it: any) => sum + it.amount, 0);
    const vat = Math.round(subtotal * 0.1);
    const total = subtotal + vat;

    parsedJson.quotation.items = items;
    parsedJson.quotation.subtotal = subtotal;
    parsedJson.quotation.vat = vat;
    parsedJson.quotation.total = total;

    if (parsedJson.voucherDiscount) {
      const ratio = Number(parsedJson.voucherDiscount.supportRatio) || 80;
      const govAmt = Math.round((subtotal * (ratio / 100)) / 10000) * 10000;
      parsedJson.voucherDiscount.governmentSupportAmount = govAmt;
      parsedJson.voucherDiscount.clientSelfPayAmount = subtotal - govAmt;
    }

    return NextResponse.json({
      success: true,
      updatedProposal: parsedJson,
      message: "자연어 지시사항에 따라 견적서가 성공적으로 수정되었습니다.",
    });
  } catch (err: any) {
    console.error("[Proposal Edit Route Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "견적서 자연어 수정 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
