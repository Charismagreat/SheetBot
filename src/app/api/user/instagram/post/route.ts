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
  findOrCreateEgdeskSubfolder,
  insertRows,
  queryTable,
  callDriveTool,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { setupDatabase } from "@/lib/setup-db";

const INSTAGRAM_SHEET_HEADERS = [
  "ID",
  "작성/발행 일시",
  "포스팅 주제",
  "타깃 키워드",
  "피드 캡션 미리보기",
  "추천 해시태그",
  "인스타 피드 링크/뷰어",
  "사진 보관함 링크",
  "포스팅 요약 (3줄)",
  "발행 상태",
];

// 3.5초 타임아웃 가드 헬퍼
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

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

function unwrapAiCallerJson<T>(rawText: string, fallback: T): T {
  const unwrapped = unwrapAiCallerText(rawText);
  try {
    const cleanJson = unwrapped
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleanJson);
  } catch {
    return fallback;
  }
}

/**
 * GET /api/user/instagram/post?id=xxx
 * 
 * 특정 인스타그램 포스팅 단건 조회 (웹 뷰어 지원)
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id 파라미터가 필요합니다." }, { status: 400 });
    }

    let rows = await queryTable<any>("sheetbot_instagram_posts", {
      where: { uuid: id, deleted_at: null },
      limit: 1,
    });

    if (!rows || rows.length === 0) {
      if (!isNaN(Number(id))) {
        rows = await queryTable<any>("sheetbot_instagram_posts", {
          where: { id: Number(id), deleted_at: null },
          limit: 1,
        });
      }
    }

    if (!rows || rows.length === 0) {
      // 최근 등록건 중 일치하는 레코드 탐색 (폴백)
      const allRows = await queryTable<any>("sheetbot_instagram_posts", {
        limit: 10,
        orderBy: "id",
        orderDirection: "DESC",
      });
      const matched = allRows.find((r: any) => r.uuid === id || String(r.id) === id);
      if (matched) rows = [matched];
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: "해당 인스타그램 포스팅을 찾을 수 없습니다." }, { status: 404 });
    }

    const row = rows[0];
    let imageList: Array<{ name: string; url: string }> = [];
    let carouselSlides: Array<{ slide: number; title: string; text: string }> = [];
    let refUrls: string[] = [];

    try {
      if (row.image_drive_urls_json) imageList = JSON.parse(row.image_drive_urls_json);
    } catch {}
    try {
      if (row.carousel_slides_json) carouselSlides = JSON.parse(row.carousel_slides_json);
    } catch {}
    try {
      if (row.ref_urls_json) refUrls = JSON.parse(row.ref_urls_json);
    } catch {}

    return NextResponse.json({
      success: true,
      post: {
        id: row.id,
        topic: row.topic,
        keywords: row.keywords,
        tone: row.tone || "감성 & 정보",
        caption: row.caption,
        hashtags: row.hashtags,
        carouselSlides,
        summary: row.summary,
        imageList,
        driveFolderUrl: row.drive_folder_url,
        refUrls,
        imageCount: row.image_count || 0,
        reportUrl: row.report_url,
        sheetUrl: row.sheet_url,
        instagramPostUrl: row.instagram_post_url,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  } catch (error: any) {
    console.error("[InstagramPost GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "인스타그램 포스팅 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/instagram/post
 * 
 * 사진 멀티 업로드 + 주제/키워드 + 톤앤매너 + 벤치마킹 링크 수신
 * 1. 구글 드라이브 인스타그램 사진 전용 보관함 격리 업로드
 * 2. 이지데스크 표준 AI Caller 경유 Gemini 2.5 Flash 인스타그램 특화 캡션/해시태그 생성
 * 3. SQLite DB 및 구글 시트 [SheetBot] 인스타그램 마케팅 관리 대장 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let userEmailInput = "";
    let topic = "";
    let keywords = "";
    let tone = "감성 & 친근한 후기";
    let refUrls: string[] = [];
    const uploadedFiles: Array<{ name: string; buffer: Buffer; mimeType: string }> = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      userEmailInput = String(formData.get("userEmail") || formData.get("email") || "").trim();
      topic = String(formData.get("topic") || "").trim();
      keywords = String(formData.get("keywords") || "").trim();
      tone = String(formData.get("tone") || "감성 & 친근한 후기").trim();

      const url1 = String(formData.get("refUrl1") || "").trim();
      const url2 = String(formData.get("refUrl2") || "").trim();
      const url3 = String(formData.get("refUrl3") || "").trim();
      refUrls = [url1, url2, url3].filter((u) => u.startsWith("http"));

      const allEntries = [...formData.getAll("files"), ...formData.getAll("images")];
      for (const entry of allEntries) {
        if (entry && typeof entry === "object" && "arrayBuffer" in entry) {
          const file = entry as File;
          const buf = Buffer.from(await file.arrayBuffer());
          uploadedFiles.push({
            name: file.name || `insta_${Date.now()}.jpg`,
            buffer: buf,
            mimeType: file.type || "image/jpeg",
          });
        }
      }
    } else {
      const json = await req.json().catch(() => ({}));
      userEmailInput = String(json.userEmail || json.email || "").trim();
      topic = String(json.topic || "").trim();
      keywords = String(json.keywords || "").trim();
      tone = String(json.tone || "감성 & 친근한 후기").trim();
      if (Array.isArray(json.refUrls)) {
        refUrls = json.refUrls.filter((u: any) => typeof u === "string" && u.startsWith("http"));
      }
    }

    const userEmail = (userEmailInput && userEmailInput.includes("@"))
      ? userEmailInput.toLowerCase().trim()
      : (sessionEmail || (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : ""));

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!topic) {
      return NextResponse.json({ success: false, error: "포스팅 주제를 입력해 주세요." }, { status: 400 });
    }

    const nowStr = getKoreanTimeString();
    const instagramId = `insta_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. 구글 드라이브 [SheetBot] 인스타그램 사진 보관함 격리 업로드
    const imageDriveList: Array<{ name: string; url: string; base64: string }> = [];
    let driveFolderUrl = "";

    try {
      const parentFolder = await findOrCreateEgdeskFolder("[SheetBot] 연동 데이터");
      const instaFolder = await findOrCreateSubfolder("[SheetBot] 인스타그램 사진 보관함", parentFolder.id);
      driveFolderUrl = instaFolder.id ? `https://drive.google.com/drive/folders/${instaFolder.id}` : "";

      await Promise.allSettled(
        uploadedFiles.map(async (file, idx) => {
          const b64 = file.buffer.toString("base64");
          const safeName = `${instagramId}_photo_${idx + 1}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

          const uploadRes = await callDriveTool("drive_upload", {
            name: safeName,
            content: b64,
            mimeType: file.mimeType,
            folderId: instaFolder.id,
            encoding: "base64",
          }).catch(() => null);

          const fileUrl = uploadRes?.webViewLink || uploadRes?.url || (uploadRes?.id ? `https://drive.google.com/file/d/${uploadRes.id}/view` : "");
          imageDriveList.push({ name: safeName, url: fileUrl, base64: b64 });
        })
      );
    } catch (driveErr: any) {
      console.warn("[InstagramPost] Drive upload warning:", driveErr.message);
    }

    // 2. 벤치마킹 참고 링크 맥락 구성
    const refSummaryForAi = refUrls.length > 0
      ? `의뢰인이 참고하고자 하는 상위 인기 인스타그램 계정/게시물 링크: ${refUrls.join(", ")}\n해당 계정들의 감성 무드, 짧은 호흡의 줄바꿈, 세련된 이모지 활용법을 벤치마킹하세요.`
      : "참고 링크 없음 (주제 및 키워드를 토대로 가장 반응률 높은 인스타그램 피드 구조를 스스로 설계할 것)";

    // 3. AI Caller(callAiCaller) 경유 인스타그램 전문 카피라이터 프롬프트 작성
    const prompt = `당신은 대한민국 최고의 인스타그램 전문 콘텐츠 마케터이자 SNS 카피라이터입니다.
다음 의뢰인의 주제, 타깃 키워드, 톤앤매너, 첨부 사진 정보를 바탕으로
인스타그램 피드에서 시선을 사로잡고(저장/공유/댓글) 검색 노출을 극대화하는 매력적인 인스타그램 캡션과 해시태그를 작성하세요.

[포스팅 기본 정보]:
- 메인 주제: ${topic}
- 핵심 키워드: ${keywords || "주제 관련 핵심 키워드"}
- 톤앤매너: ${tone}
- 첨부된 사진 수: 총 ${imageDriveList.length}장

[벤치마킹 가이드]:
${refSummaryForAi}

[작성 가이드라인 - 엄격 준수]:
1. **첫 줄 (Hooking Line)**: 스크롤을 내리다 0.5초 만에 멈추게 만드는 직관적이고 강력한 한 줄 카피 (예: "✨ 드디어 찾았다... 나만 알고 싶은 분위기 깡패 카페 ☕️")
2. **본문 (Body)**:
   - 가독성을 극대화하기 위해 1~2문장 단위로 줄바꿈 및 온점(.) 여백을 둘 것.
   - 친근하고 감성적인 어투 (~했는데요, ~추천해요, ~더라구요)와 적절하고 감각적인 이모지(2~4개) 배치.
   - 핵심 경험(맛, 분위기, 꿀팁, 이용 팁 등)을 생생하게 서술.
3. **행동 유도 (CTA)**: 독자 참여를 이끄는 마지막 질문/제안 (예: "저장해두고 이번 주말 데이트 때 꼭 가보세요! 📌", "여러분이 가장 좋아하는 메뉴는?")
4. **해시태그 (Hashtags)**:
   - 20~25개의 타깃 해시태그를 생성하세요.
   - 대형 태그(10만+ 유입용) + 중소형 태그(1만~5만 타깃용) + 세부 위치/상황별 니치 태그를 완벽히 믹스하세요.
5. **캐러셀 슬라이드별 카피 (사진이 있는 경우)**:
   - 사진 장수(총 ${imageDriveList.length || 3}장)에 맞춰 슬라이드 1(표지/헤드라인), 슬라이드 2~N(상세 포인트), 마지막 슬라이드(아웃트로/CTA)에 들어갈 텍스트 추천.
6. **3줄 요약**: 바쁜 현대인을 위한 피드 핵심 요약 3줄.

반드시 아래 JSON 포맷으로만 응답하세요:
{
  "hook": "첫 줄 훅 카피",
  "caption": "전체 인스타그램 본문 캡션 (줄바꿈 포함)",
  "hashtags": "#태그1 #태그2 #태그3 #태그4 #태그5 ...",
  "summary": "1. [요점 1] ...\\n2. [요점 2] ...\\n3. [요점 3] ...",
  "carouselSlides": [
    { "slide": 1, "title": "표지 타이틀", "text": "핵심 부제" },
    { "slide": 2, "title": "포인트 1", "text": "상세 설명" }
  ]
}`;

    let hook = `✨ ${topic} - 솔직 후기 및 추천 꿀팁!`;
    let caption = `✨ ${topic}\n\n오늘은 정말 추천하고 싶은 ${topic}에 다녀왔어요!\n분위기부터 만족도까지 100% 만족스러웠던 솔직한 순간을 공유합니다.\n\n📌 저장해두고 꼭 참고해 보세요!`;
    let hashtags = `#${topic.replace(/\s+/g, "")} #인스타핫플 #주말추천 #일상기록 #데일리후기`;
    let summary = `1. [주제] ${topic}\n2. [키워드] ${keywords || "-"}\n3. [안내] 감성 가득 인스타그램 피드 원고입니다.`;
    let carouselSlides: Array<{ slide: number; title: string; text: string }> = [
      { slide: 1, title: topic, text: "솔직 후기 & 추천 꿀팁" },
    ];

    try {
      // 이지데스크 표준 AI Caller 경유
      const aiRes = await withTimeout(
        callAiCaller(prompt, { model: "gemini-2.5-flash", temperature: 0.4 }),
        12000,
        null
      );

      if (aiRes?.text) {
        const parsed = unwrapAiCallerJson<any>(aiRes.text, null);
        if (parsed) {
          if (parsed.hook) hook = String(parsed.hook).trim();
          if (parsed.caption) caption = String(parsed.caption).trim();
          if (parsed.hashtags) {
            hashtags = Array.isArray(parsed.hashtags)
              ? parsed.hashtags.map((t: string) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
              : String(parsed.hashtags).trim();
          }
          if (parsed.summary) summary = String(parsed.summary).trim();
          if (Array.isArray(parsed.carouselSlides)) {
            carouselSlides = parsed.carouselSlides;
          }
        }
      }
    } catch (aiErr: any) {
      console.warn("[InstagramPost] AI Caller warning:", aiErr.message);
    }

    const reportUrl = `https://sheetbot.cloud/instagram-post?id=${instagramId}`;
    const instagramPostUrl = "https://www.instagram.com/";

    // 4. 구글 스프레드시트 [SheetBot] 인스타그램 마케팅 관리 대장 적재
    let sheetUrl = "";
    try {
      const binding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "INSTAGRAM",
        defaultTitle: "[SheetBot] 인스타그램 마케팅 관리 대장",
      });

      sheetUrl = binding.spreadsheetUrl;

      if (binding.isNew) {
        await callSheetsTool("sheets_append_values", {
          spreadsheetId: binding.spreadsheetId,
          range: "A1:J1",
          values: [INSTAGRAM_SHEET_HEADERS],
        }).catch(() => {});
      }

      const captionPreview = caption.length > 60 ? caption.slice(0, 60) + "..." : caption;
      const rowValues = [
        instagramId,
        nowStr,
        topic,
        keywords || "-",
        captionPreview,
        hashtags,
        reportUrl,
        driveFolderUrl || "-",
        summary,
        "피드 작성 완료 (발행 대기)",
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId: binding.spreadsheetId,
        range: "A:J",
        values: [rowValues],
      });
    } catch (sheetErr: any) {
      console.warn("[InstagramPost] Sheets append warning:", sheetErr.message);
    }

    // 5. SQLite DB sheetbot_instagram_posts 적재
    try {
      await insertRows("sheetbot_instagram_posts", [
        {
          uuid: instagramId,
          user_email: userEmail,
          topic,
          keywords,
          tone,
          caption: `${hook}\n\n${caption}\n\n${hashtags}`,
          hashtags,
          carousel_slides_json: JSON.stringify(carouselSlides),
          summary,
          image_drive_urls_json: JSON.stringify(imageDriveList),
          drive_folder_url: driveFolderUrl,
          ref_urls_json: JSON.stringify(refUrls),
          image_count: imageDriveList.length,
          report_url: reportUrl,
          sheet_url: sheetUrl,
          instagram_post_url: instagramPostUrl,
          status: "CREATED",
          created_at: nowStr,
        },
      ]);
    } catch (dbErr: any) {
      console.warn("[InstagramPost] DB insert warning:", dbErr.message);
    }


    // 토큰 정산 (10토큰 차감)
    void deductTokens(userEmail, 10, "INSTAGRAM_POST", instagramId).catch(() => {});
    void recordAiUsageLog({
      userEmail,
      taskType: "INSTAGRAM_POST",
      model: "gemini-2.5-flash",
      promptTokens: 1200,
      completionTokens: 800,
      costKrw: 5,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      instagramId,
      hook,
      caption,
      hashtags,
      summary,
      carouselSlides,
      imageCount: imageDriveList.length,
      reportUrl,
      sheetUrl,
      instagramPostUrl,
      driveFolderUrl,
    });
  } catch (error: any) {
    console.error("[InstagramPost POST] Fatal Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "인스타그램 콘텐츠 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
