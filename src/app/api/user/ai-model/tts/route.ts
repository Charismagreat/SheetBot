export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/**
 * 텍스트에서 연기 지시문([연기 지시: ...]) 등을 제거하고
 * Google TTS 최대 길이(180자) 이하의 자연스러운 문장 청크로 분할합니다.
 */
function splitTextForTts(rawText: string): string[] {
  const cleaned = rawText
    .replace(/\[[\s\S]*?\]/g, " ")
    .replace(/【[\s\S]*?】/g, " ")
    .replace(/\((?:미소|웃음|윙크|강조|포즈|제스처|연기[^)]*)\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return ["안녕하세요. 시트봇 AI 전속 모델입니다."];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const s of sentences) {
    if (s.length <= 160) {
      chunks.push(s);
    } else {
      const subParts = s.split(/,\s*/);
      let current = "";
      for (const part of subParts) {
        if ((current + ", " + part).length > 160) {
          if (current) chunks.push(current.trim());
          current = part;
        } else {
          current = current ? `${current}, ${part}` : part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks.length > 0 ? chunks : [cleaned.slice(0, 160)];
}

/**
 * GET /api/user/ai-model/tts?text=...&voice=...
 * 대본 전체를 끊김 없는 단일 MP3 오디오 스트림(audio/mpeg)으로 합성하여 반환합니다.
 */
export async function GET(req: NextRequest) {
  try {
    const rawText = (req.nextUrl.searchParams.get("text") || "").trim();
    if (!rawText) {
      return NextResponse.json({ success: false, error: "text is required" }, { status: 400 });
    }

    const chunks = splitTextForTts(rawText);
    const buffers: Buffer[] = [];

    for (const chunk of chunks) {
      const encoded = encodeURIComponent(chunk);
      const ttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encoded}&tl=ko&client=tw-ob&ttsspeed=1.05`;
      const res = await fetch(ttsUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const arrBuf = await res.arrayBuffer();
        if (arrBuf.byteLength > 0) {
          buffers.push(Buffer.from(arrBuf));
        }
      }
    }

    if (buffers.length === 0) {
      return NextResponse.json({ success: false, error: "TTS generation failed" }, { status: 502 });
    }

    const combined = Buffer.concat(buffers);
    return new NextResponse(combined, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(combined.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err: any) {
    console.error("[AiModelTTS] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
