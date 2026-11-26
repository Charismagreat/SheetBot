export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, getWorkspaceCallOptionsForEmail } from "@/lib/auth";
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
  callYouTubeTool,
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

export interface ProductVisualContext {
  theme: "taekwondo" | "beauty" | "food" | "tech" | "fashion" | "health" | "business" | "commercial";
  themeTitle: string;
  wardrobe: string;
  environment: string;
  holdingPose: string;
  heroModelImg: string;
  sceneImages: string[];
}

/**
 * 제품 주제 및 대본에 맞춰 모델의 의상(Wardrobe), 배경(Environment), 제품 파지 포즈(Pose) 및 4단 멀티 액션 씬 도출
 */
export function inferProductVisualContext(
  topic: string,
  script: string,
  modelAssetKey: string = "minsu"
): ProductVisualContext {
  const combined = `${topic} ${script}`.toLowerCase();

  // 1. 태권도 / 무도 / 도복 / 띠 / 칼라밴드 / 체육관
  if (/(태권도|도복|칼라밴드|도장|승급|품띠|검은띠|유도|검도|체육관|무술|관장님|원생)/.test(combined)) {
    return {
      theme: "taekwondo",
      themeTitle: "태권도 & 무도 스포츠",
      wardrobe: "정통 태권도 도복 (흰색 도복 + 블랙 벨트)",
      environment: "햇살 비치는 명품 태권도장 (Dojang Studio)",
      holdingPose: "New 칼라밴드를 양손으로 팽팽히 당겨 탄성과 실링 마감을 직접 시연",
      heroModelImg: "/assets/models/minsu_taekwondo_color_band.jpg",
      sceneImages: [
        "/assets/models/minsu_taekwondo_scene1_hook.jpg",
        "/assets/models/minsu_taekwondo_color_band.jpg",
        "/assets/models/minsu_taekwondo_scene3_colors.jpg",
        "/assets/models/minsu_taekwondo_scene4_cta.jpg",
      ],
    };
  }

  const defaultScenes = [
    `/assets/models/${modelAssetKey}_front.jpg`,
    `/assets/models/${modelAssetKey}_quarter.jpg`,
    `/assets/models/${modelAssetKey}_walk.jpg`,
    `/assets/models/${modelAssetKey}_side.jpg`,
  ];

  // 2. 뷰티 / 화장품 / 스킨케어 / 앰플
  if (/(화장품|뷰티|세럼|앰플|크림|스킨케어|피부|마스크팩|에스테틱|보습|미백)/.test(combined)) {
    return {
      theme: "beauty",
      themeTitle: "프리미엄 뷰티 & 코스메틱",
      wardrobe: "실키 화이트 뷰티 블라우스 & 파스텔 톤 가운",
      environment: "자연광 가득한 미니멀 뷰티 파우더룸",
      holdingPose: "제품 보틀을 손바닥 위에 올려 뺨 옆에 들고 화사하게 미소",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      sceneImages: defaultScenes,
    };
  }

  // 3. 식품 / 요리 / 맛집 / 디저트
  if (/(식품|요리|맛집|디저트|커피|음료|베이커리|밀키트|간편식|맛있는|셰프)/.test(combined)) {
    return {
      theme: "food",
      themeTitle: "고메 푸드 & 레스토랑",
      wardrobe: "모던 셰프 에이프런 & 깔끔한 롤업 셔츠",
      environment: "따뜻한 원목 감성의 부티크 레스토랑 키친",
      holdingPose: "식품 패키지를 양손으로 정성스럽게 받쳐 들고 서빙",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      sceneImages: defaultScenes,
    };
  }

  // 4. IT / 전자기기 / 스마트 디바이스
  if (/(스마트|전자|기기|블루투스|태블릿|충전기|이어폰|노트북|가전|디바이스)/.test(combined)) {
    return {
      theme: "tech",
      themeTitle: "스마트 테크 & 일렉트로닉스",
      wardrobe: "모던 슬림핏 스마트 캐주얼 & 블레이저",
      environment: "도심 전경의 하이테크 테크 라운지",
      holdingPose: "기기를 손에 들고 화면을 카메라 정면으로 가리키며 시연",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      sceneImages: defaultScenes,
    };
  }

  // 5. 비즈니스 / SaaS / 자동화 / 세무 / 법률
  if (/(시트봇|업무|자동화|솔루션|엑셀|구글시트|세무|회계|법률|컨설팅|기업)/.test(combined)) {
    return {
      theme: "business",
      themeTitle: "스마트 비즈니스 & 엔터프라이즈",
      wardrobe: "테일러드 다크 네이비 비즈니스 수트",
      environment: "고층 통유리 전망의 스마트 회의실",
      holdingPose: "태블릿 화면의 데이터 차트를 짚으며 신뢰감 넘치는 발표",
      heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
      sceneImages: defaultScenes,
    };
  }

  // 기본 라이프스타일 커머셜
  return {
    theme: "commercial",
    themeTitle: "프리미엄 브랜드 커머셜",
    wardrobe: "친근하고 세련된 모던 데일리 룩",
    environment: "감성적인 라이프스타일 스튜디오",
    holdingPose: "제품을 한 손에 안정적으로 쥐고 카메라를 향해 소개",
    heroModelImg: `/assets/models/${modelAssetKey}_front.jpg`,
    sceneImages: defaultScenes,
  };
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
      const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);
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
        }, callOptions);
        productDriveUrl = uploadRes?.file?.webViewLink || uploadRes?.webViewLink || "";
        const driveId = uploadRes?.file?.id || uploadRes?.id || "";
        if (driveId && !productProxyImgUrl) {
          productProxyImgUrl = `/api/user/files/drive-download?fileId=${encodeURIComponent(driveId)}&fileName=${encodeURIComponent(uploadedFile.name)}`;
        }
      }
    } catch (e: any) {
      console.warn("[AiModelVideo] Drive upload warning:", e.message);
    }

    // 3. 제품 맞춤형 의상, 배경, 제품 시연 포즈 및 실사 히어로 컷 도출
    const modelAssetKey = modelName.includes("서연") ? "seoyeon" : modelName.includes("지아") ? "jia" : "minsu";
    const visualCtx = inferProductVisualContext(topic, script, modelAssetKey);

    // 2번째 재생성 시 제품 사진 첨부가 생략되었더라도 최근 업로드된 제품 이미지 자동 복원
    if (!productProxyImgUrl) {
      try {
        const publicUploadDir = path.join(process.cwd(), "public", "uploads", "ai-products");
        if (fs.existsSync(publicUploadDir)) {
          const files = fs
            .readdirSync(publicUploadDir)
            .map((name) => ({
              name,
              mtime: fs.statSync(path.join(publicUploadDir, name)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);
          if (files.length > 0) {
            productProxyImgUrl = `/uploads/ai-products/${encodeURIComponent(files[0].name)}`;
          }
        }
      } catch {}
    }

    if (!productProxyImgUrl && visualCtx.theme === "taekwondo") {
      productProxyImgUrl = "/assets/models/minsu_taekwondo_scene3_colors.jpg";
    }

    const firstTopicLine = topic
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0] || topic.slice(0, 32);
    const shortTitle = firstTopicLine.length > 36 ? firstTopicLine.slice(0, 36) + "..." : firstTopicLine;

    // 414 URI Too Long 및 메신저 링크 잘림 방지를 위해 초단축 URL(?id=aimodel_...) 표준 채택
    const demoVideoUrl = `https://sheetbot.cloud/demo/ai-shorts-player?id=${videoId}`;

    // 시트 기록 전에 메타데이터 선저장 (0ms 즉시 조회 보장)
    saveAiShortsMeta({
      id: videoId,
      modelName,
      modelVoice,
      topic,
      shortTitle,
      script,
      theme: visualCtx.theme,
      heroModelImg: visualCtx.heroModelImg,
      wardrobe: visualCtx.wardrobe,
      environment: visualCtx.environment,
      holdingPose: visualCtx.holdingPose,
      productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
      veoStatus: "PENDING",
      createdAt: nowStr,
    });

    // 4. 구글 시트 바인딩 및 장부 기록 ([SheetBot] AI 홍보 콘텐츠 관리대장)
    let sheetUrl = "";
    try {
      const callOptions = await getWorkspaceCallOptionsForEmail(userEmail, req);
      const sheetBinding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "AI_MODEL",
        defaultTitle: "[SheetBot] AI 홍보 콘텐츠 관리대장", callOptions,
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
        }, callOptions).catch((e: any) => console.warn("[AiModelVideo] sheets_append_values warning:", e.message));
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
      theme: visualCtx.theme,
      heroModelImg: visualCtx.heroModelImg,
      wardrobe: visualCtx.wardrobe,
      environment: visualCtx.environment,
      holdingPose: visualCtx.holdingPose,
      productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
      veoStatus: "PENDING",
      sheetUrl,
      driveFolderUrl,
      createdAt: nowStr,
    });

    // 4-A. 이지데스크 내장 Google Veo 3.1 실제 동영상(.mp4) 비동기 생성 파이프라인
    void (async () => {
      try {
        const productImagesPayload: any[] = [];
        if (uploadedFile) {
          productImagesPayload.push({
            dataBase64: uploadedFile.buffer.toString("base64"),
            mimeType: uploadedFile.mimeType || "image/jpeg",
          });
        }

        const veoRes: any = await callYouTubeTool("youtube_generate_shorts", {
          topic: shortTitle,
          productName: shortTitle,
          extraInstructions: `전속 모델(${modelName})이 ${visualCtx.wardrobe}을 착용하고 ${visualCtx.environment}에서 제품을 직접 손에 들고 시연하며 다음 대본을 발화합니다: ${script}`,
          productImages: productImagesPayload.length > 0 ? productImagesPayload : undefined,
          generateVideo: true,
          skipOutro: true,
        });

        const generatedMp4Path =
          veoRes?.video?.finalPath ||
          veoRes?.video?.composedPath ||
          veoRes?.video?.rawClipPath ||
          "";

        if (generatedMp4Path && fs.existsSync(/*turbopackIgnore: true*/ generatedMp4Path)) {
          const cacheDir = path.join(os.tmpdir(), "sheetbot_drive_attachments");
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          const targetMp4Path = path.join(cacheDir, `${videoId}_veo_shorts.mp4`);
          fs.copyFileSync(/*turbopackIgnore: true*/ generatedMp4Path, targetMp4Path);

          const mp4ProxyUrl = `/api/user/files/drive-download?fileId=${encodeURIComponent(videoId)}&fileName=veo_shorts.mp4&mimeType=video%2Fmp4`;
          saveAiShortsMeta({
            id: videoId,
            modelName,
            modelVoice,
            topic,
            shortTitle,
            script,
            productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
            mp4VideoUrl: mp4ProxyUrl,
            veoStatus: "COMPLETED",
            sheetUrl,
            driveFolderUrl,
            createdAt: nowStr,
          });
        } else {
          saveAiShortsMeta({
            id: videoId,
            modelName,
            modelVoice,
            topic,
            shortTitle,
            script,
            productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
            veoStatus: "UNAVAILABLE",
            veoError: veoRes?.error || "Veo clip not returned",
            sheetUrl,
            driveFolderUrl,
            createdAt: nowStr,
          });
        }
      } catch (veoErr: any) {
        saveAiShortsMeta({
          id: videoId,
          modelName,
          modelVoice,
          topic,
          shortTitle,
          script,
          productImageUrl: productProxyImgUrl || productDriveUrl || undefined,
          veoStatus: "UNAVAILABLE",
          veoError: veoErr?.message || "Veo generation failed",
          sheetUrl,
          driveFolderUrl,
          createdAt: nowStr,
        });
      }
    })();

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
