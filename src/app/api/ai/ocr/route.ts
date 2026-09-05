export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { callAiCaller } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/ai/ocr
 * 구글 시트 Apps Script(사이드바)에서 전달된 PDF/이미지 파일을
 * 이지데스크 AI Caller를 경유하여 OCR 및 문서 데이터 자동 추출
 * (사용자의 개인 API 키 불필요, 이지데스크 중앙 AI Caller 사용)
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const { fileData, fileName, mimeType, headers, prompt: userPrompt } = body;

    if (!fileData) {
      return NextResponse.json(
        { success: false, error: "분석할 파일 데이터(Base64)가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 대상 시트 헤더 컬럼 안내 (기본: 발주서 접수대장 규격)
    const targetHeaders = Array.isArray(headers) && headers.length > 0
      ? headers.join(", ")
      : "접수일(발행일자), 수주번호, 적요(프로젝트명), 품번, 품명, 규격, 도면번호, 수량, 단가, 금액, 납기, 담당자";

    const ocrPrompt = `당신은 문서 및 발주서 OCR 전문 AI입니다.
전달된 파일(파일명: ${fileName || "문서"}, 종류: ${mimeType || "문서/이미지"})의 내용을 꼼꼼히 분석하여,
다음 스프레드시트 컬럼 항목에 맞게 정밀하게 데이터를 추출하세요.

[추출 대상 컬럼 목록]:
${targetHeaders}

[추가 요청사항]:
${userPrompt || "모든 품목 항목을 행별로 빠짐없이 추출하세요."}

반드시 다음 JSON 형식으로만 응답하세요. 마크다운(\`\`\`json) 없이 순수 JSON만 출력해야 합니다:
{
  "success": true,
  "summary": "추출된 발주서 개요 요약",
  "rows": [
    {
      "접수일": "YYYY-MM-DD",
      "수주번호": "...",
      "적요": "...",
      "품번": "...",
      "품명": "...",
      "규격": "...",
      "도면번호": "...",
      "수량": 0,
      "단가": 0,
      "금액": 0,
      "납기": "MM/DD 또는 YYYY-MM-DD",
      "담당자": "..."
    }
  ],
  "values": [
    ["컬럼1값", "컬럼2값", "컬럼3값", "..."]
  ]
}`;

    // 이지데스크 중앙 AI Caller 호출 (사용자 개인 API 키 불필요)
    const callerRes = await callAiCaller(ocrPrompt, {
      caller: "sheetbot-ocr-service",
      model: "gemini-2.5-flash",
      temperature: 0.1,
    });

    let resultJson: any = null;
    if (callerRes && callerRes.text) {
      const text = callerRes.text.trim();
      try {
        resultJson = JSON.parse(text);
      } catch {
        const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        try {
          resultJson = JSON.parse(clean);
        } catch {
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end > start) {
            resultJson = JSON.parse(text.substring(start, end + 1));
          }
        }
      }
    }

    if (!resultJson) {
      throw new Error("AI Caller OCR 데이터 추출 응답을 파싱할 수 없습니다.");
    }

    return NextResponse.json({
      success: true,
      data: resultJson,
    });
  } catch (error: any) {
    console.error("OCR API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "OCR 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
