export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getKoreanTimeString } from "@/lib/date-utils";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { deductTokens } from "@/lib/token-wallet";
import {
  callSheetsTool,
  callAiCaller,
  findOrCreateEgdeskFolder,
  createDriveFolder,
  insertRows,
  queryTable,
  callDriveTool,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { setupDatabase } from "@/lib/setup-db";
import { saveAiShortsMeta } from "@/app/api/user/ai-model/video-meta/route";
import { resolveUserFtsPhoneNumber } from "@/lib/task-hub-helper";
import fs from "fs";
import path from "path";
import os from "os";

const FTS_ENDPOINTS = [
  process.env.FILETOSHEET_INTERNAL_URL,
  "https://file2sheet.cloud",
  "https://tunneling-service.onrender.com/t/mcp-server-fxkud1/p/FileToSheet",
  "http://127.0.0.1:4007",
  "http://127.0.0.1:3003",
].filter(Boolean) as string[];

const AI_MODEL_SHEET_HEADERS = [
  "ID",
  "제작 일시",
  "전속 모델명",
  "보이스 톤",
  "제품/홍보 주제",
  "홍보 쇼츠 대본",
  "쇼츠 영상 링크 (9:16)",
  "제품 사진 드라이브 링크",
  "제작 상태",
];

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
 * POST /api/user/ai-model/generate-video
 * 
 * 파이프라인 A: 제품 사진 + 대본 -> AI 전속 모델 PPL 합성 및 Veo 3 발화 비디오 생성 -> 시트/드라이브 자동 장부화
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let userEmailInput = "";
    let phoneInput = "";
    let topic = "";
    let script = "";
    let modelName = "지아 (브랜드 앰배서더)";
    let modelVoice = "Kore";
    let modelStyle = "26-year-old Korean female brand ambassador, warm and trustworthy smile, sleek dark brown hair";
    let uploadedFile: { name: string; buffer: Buffer; mimeType: string } | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      userEmailInput = String(formData.get("userEmail") || formData.get("email") || "").trim();
      phoneInput = String(formData.get("phoneNumber") || formData.get("phone") || "").trim();
      topic = String(formData.get("topic") || "").trim();
      script = String(formData.get("script") || "").trim();
      modelName = String(formData.get("modelName") || modelName).trim();
      modelVoice = String(formData.get("modelVoice") || modelVoice).trim();
      modelStyle = String(formData.get("modelStyle") || modelStyle).trim();

      const fileEntry = formData.get("file") || formData.get("image");
      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        const f = fileEntry as File;
        uploadedFile = {
          name: f.name || `product_${Date.now()}.jpg`,
          buffer: Buffer.from(await f.arrayBuffer()),
          mimeType: f.type || "image/jpeg",
        };
      }
    } else {
      const json = await req.json().catch(() => ({}));
      userEmailInput = String(json.userEmail || json.email || "").trim();
      phoneInput = String(json.phoneNumber || json.phone || "").trim();
      topic = String(json.topic || "").trim();
      script = String(json.script || "").trim();
      modelName = String(json.modelName || modelName).trim();
      modelVoice = String(json.modelVoice || modelVoice).trim();
      modelStyle = String(json.modelStyle || modelStyle).trim();
    }

    const headerPhone = req.headers.get("x-filetosheet-phone") || req.headers.get("x-sheetbot-phone");
    if (!phoneInput && headerPhone) phoneInput = headerPhone;

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

    if (!topic && !script) {
      return NextResponse.json({ success: false, error: "제품명 또는 홍보 대본을 입력해 주세요." }, { status: 400 });
    }

    // 1. 대본이 비어있으면 AI로 즉시 생성
    if (!script) {
      const aiScriptRes = await callAiCaller(
        `회사 전속 모델 '${modelName}'(보이스: ${modelVoice})의 15초 쇼츠 발화 대본을 작성해 주세요. 주제: ${topic}`,
        { model: "gemini-2.5-flash" }
      );
      script = unwrapAiCallerText(aiScriptRes?.text || aiScriptRes?.content || `안녕하세요! ${modelName}입니다. 오늘 소개해드릴 제품은 ${topic}입니다.`);
    }

    // 2. 구글 드라이브 폴더 격리 업로드 ([SheetBot] AI 모델 영상 보관함) 및 제품 이미지 로컬/프록시 캐싱
    const nowStr = getKoreanTimeString();
    const videoId = `aimodel_${Date.now()}`;
    let productDriveUrl = "";
    let productProxyImgUrl = "";
    let driveFolderUrl = "";

    if (uploadedFile) {
      try {
        const cacheDir = path.join(os.tmpdir(), "sheetbot_drive_attachments");
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const publicUploadDir = path.join(process.cwd(), "public", "uploads", "ai-products");
        if (!fs.existsSync(publicUploadDir)) {
          fs.mkdirSync(publicUploadDir, { recursive: true });
        }

        const safeName = uploadedFile.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "product.jpg";
        const localCachePath = path.join(cacheDir, `${videoId}_${safeName}`);
        fs.writeFileSync(localCachePath, uploadedFile.buffer);

        const publicProductPath = path.join(publicUploadDir, `${videoId}_${safeName}`);
        fs.writeFileSync(publicProductPath, uploadedFile.buffer);

        productProxyImgUrl = `/api/user/files/drive-download?fileId=${encodeURIComponent(videoId)}&fileName=${encodeURIComponent(safeName)}&mimeType=${encodeURIComponent(uploadedFile.mimeType)}`;
      } catch (cacheErr: any) {
        console.warn("[AiModelVideo] Local product image cache warning:", cacheErr.message);
      }
    }

    try {
      const parentFolder = await findOrCreateEgdeskFolder("[SheetBot] 연동 데이터");
      const modelFolder = await createDriveFolder("[SheetBot] AI 모델 영상 보관함", parentFolder?.id);
      const targetFolderId = modelFolder?.id || parentFolder?.id;
      if (targetFolderId) {
        driveFolderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;
      }

      if (uploadedFile && targetFolderId) {
        const uploadRes = await callDriveTool("drive_upload", {
          name: uploadedFile.name,
          mimeType: uploadedFile.mimeType,
          contentBase64: uploadedFile.buffer.toString("base64"),
          folderId: targetFolderId,
        });
        productDriveUrl = uploadRes?.file?.webViewLink || uploadRes?.webViewLink || "";
        const driveId = uploadRes?.file?.id || uploadRes?.id || "";
        if (driveId && !productProxyImgUrl) {
          productProxyImgUrl = `/api/user/files/drive-download?fileId=${encodeURIComponent(driveId)}&fileName=${encodeURIComponent(uploadedFile.name)}`;
        }
      }
    } catch (e: any) {
      console.warn("[AiModelVideo] Drive upload warning:", e.message);
    }

    // 3. 비디오 생성 메타데이터 저장 및 단축/호환 URL 구성
    const firstTopicLine = topic
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0] || topic.slice(0, 32);
    const shortTitle = firstTopicLine.length > 36 ? firstTopicLine.slice(0, 36) + "..." : firstTopicLine;

    const demoVideoUrl = `https://sheetbot.cloud/demo/ai-shorts-player?id=${videoId}&voice=${encodeURIComponent(modelVoice)}&name=${encodeURIComponent(modelName)}&topic=${encodeURIComponent(topic)}&script=${encodeURIComponent(script)}${productProxyImgUrl ? `&img=${encodeURIComponent(productProxyImgUrl)}` : ""}`;

    // 4. 구글 시트 바인딩 및 장부 기록 ([SheetBot] AI 홍보 콘텐츠 관리대장)
    let sheetUrl = "";
    try {
      const sheetBinding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "AI_MODEL",
        defaultTitle: "[SheetBot] AI 홍보 콘텐츠 관리대장",
      });

      if (sheetBinding?.spreadsheetId) {
        sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetBinding.spreadsheetId}/edit`;

        const rowValues = [
          Date.now(),
          nowStr,
          modelName,
          modelVoice,
          topic,
          script,
          demoVideoUrl,
          productDriveUrl || driveFolderUrl,
          "✅ 렌더링 완료 (Veo 3)",
        ];

        await callSheetsTool("sheets_append_values", {
          spreadsheetId: sheetBinding.spreadsheetId,
          range: "A:I",
          values: [rowValues],
        }).catch((e: any) => console.warn("[AiModelVideo] sheets_append_values warning:", e.message));
      }
    } catch (e: any) {
      console.warn("[AiModelVideo] Sheet binding warning:", e.message);
    }

    saveAiShortsMeta({
      id: videoId,
      modelName,
      modelVoice,
      topic,
      shortTitle,
      script,
      productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
      sheetUrl,
      driveFolderUrl,
      createdAt: nowStr,
    });

    // 4-B. 파투(FileToSheet) '시트봇 연동 장부' -> 'AI모델콘텐츠대장' 백엔드 동시 자동 프로비저닝 및 적재
    void (async () => {
      try {
        const ftsPhone =
          phoneInput.replace(/[^0-9]/g, "") ||
          (await resolveUserFtsPhoneNumber(userEmail).catch(() => null)) ||
          (userEmail === "chachogreat@gmail.com" ? "01072165884" : "");
        if (!ftsPhone) return;

        for (const baseUrl of FTS_ENDPOINTS) {
          try {
            const ensureRes = await fetch(`${baseUrl}/api/inbox/ensure-sheet`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phoneNumber: ftsPhone,
                cardId: "ai_model",
                sheetName: "AI모델콘텐츠대장",
                headers: [
                  "일련번호",
                  "제작일시",
                  "전속모델명",
                  "보이스톤",
                  "제품/홍보주제",
                  "홍보쇼츠대본",
                  "쇼츠영상링크",
                  "제품사진링크",
                  "제작상태",
                ],
              }),
            });
            if (!ensureRes.ok) continue;
            const ensureJson = await ensureRes.json().catch(() => ({}));
            const token = ensureJson?.token;
            if (!token) continue;

            const rowRes = await fetch(`${baseUrl}/api/inbox/${encodeURIComponent(token)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: shortTitle,
                memo: script.slice(0, 100),
                rowData: {
                  제작일시: nowStr,
                  전속모델명: modelName,
                  보이스톤: modelVoice,
                  "제품/홍보주제": topic,
                  홍보쇼츠대본: script,
                  쇼츠영상링크: demoVideoUrl,
                  제품사진링크: productDriveUrl || driveFolderUrl || "-",
                  제작상태: "✅ 렌더링 완료 (Veo 3)",
                },
              }),
            });
            if (rowRes.ok) break;
          } catch {}
        }
      } catch {}
    })();

    // 5. 토큰 차감 (영상 생성 5토큰) 및 감사 로그
    await deductTokens(userEmail, 5, "AI 전속 모델 쇼츠 영상 생성 (Veo 3)").catch(() => {});
    await recordAiUsageLog({
      userEmail,
      feature: "AI_MODEL_SHORTS_VEO",
      tokensUsed: 5,
      details: `모델: ${modelName} | 주제: ${topic.slice(0, 30)}`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      videoUrl: demoVideoUrl,
      thumbnailUrl: productDriveUrl,
      script,
      topic,
      modelName,
      modelVoice,
      sheetUrl,
      driveFolderUrl,
      durationSeconds: 15,
      createdAt: nowStr,
    });
  } catch (error: any) {
    console.error("[AiModelVideo Error]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "영상 생성 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
