export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import {
  callSheetsTool,
  callAiCaller,
  insertRows,
  queryTable,
  uploadDriveFile,
  findOrCreateEgdeskFolder,
  findOrCreateEgdeskSubfolder,
  createDriveFolder,
} from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { checkTokenBalance, deductTokens } from "@/lib/token-wallet";
import { recordAiUsageLog } from "@/lib/ai-usage";
import { getKoreanTimeString } from "@/lib/date-utils";
import { scrapeReferenceBlogs } from "@/lib/blog-scraper";

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

function extractNaverId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/(?:blog\.naver\.com\/)([a-zA-Z0-9_\-]+)/i);
  if (match) return match[1];
  return trimmed.replace(/^@/, "").replace(/[^a-zA-Z0-9_\-]/g, "");
}

// 10대 컬럼 구글 시트 헤더 정의
const BLOG_SHEET_HEADERS = [
  "ID",
  "작성/발행 일시",
  "포스팅 주제 및 제목",
  "핵심 타깃 키워드",
  "대상 네이버 블로그",
  "블로그 원고 링크",
  "네이버 글쓰기 링크",
  "첨부 사진 드라이브 폴더",
  "포스팅 본문 요약 (3줄)",
  "발행 상태",
];

/**
 * GET /api/user/blog/post?id=xxx
 * 블로그 포스팅 원고 상세 데이터 조회 (웹 뷰어용)
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(req.url);
    const blogId = searchParams.get("id") || "";

    if (!blogId) {
      return NextResponse.json({ success: false, error: "blogId (id) is required" }, { status: 400 });
    }

    const rowsRes = await queryTable("sheetbot_blog_posts", {
      filters: { uuid: blogId },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    const row = rowsRes.rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "블로그 포스팅을 찾을 수 없습니다." }, { status: 404 });
    }

    let refUrls: string[] = [];
    let imageDriveUrls: Array<{ name: string; url: string }> = [];
    try {
      if (row.ref_urls_json) refUrls = JSON.parse(row.ref_urls_json);
    } catch {}
    try {
      if (row.image_drive_urls_json) imageDriveUrls = JSON.parse(row.image_drive_urls_json);
    } catch {}

    const naverBlogId = row.naver_blog_id || "";
    const naverBlogUrl = row.naver_blog_url || (naverBlogId ? `https://blog.naver.com/${naverBlogId}` : "");
    const naverWriteUrl = naverBlogId
      ? `https://blog.naver.com/${naverBlogId}?Redirect=Write`
      : "https://blog.naver.com/GoBlogWrite.naver";

    return NextResponse.json({
      success: true,
      post: {
        id: row.uuid || row.id,
        title: row.title,
        topic: row.topic,
        keywords: row.keywords,
        refUrls,
        imageDriveUrls,
        contentHtml: row.content_html,
        summary: row.summary,
        naverPostUrl: row.naver_post_url || naverWriteUrl,
        naverBlogId,
        naverBlogUrl,
        naverWriteUrl,
        charCount: row.char_count,
        imageCount: row.image_count,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  } catch (error: any) {
    console.error("[BlogPost GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "블로그 포스팅 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/blog/post
 * 
 * 사진 멀티 업로드 + 주제/키워드 + 참고 블로그 URL 3개 수신
 * 1. 구글 드라이브 전용 보관함 사진 업로드
 * 2. 참고 블로그 3개 본문/소제목 병렬 스크래핑
 * 3. AI 멀티모달 네이버 SEO 최적화 블로그 원고 집필
 * 4. SQLite DB 및 구글 시트 [SheetBot] 블로그 마케팅 관리 대장 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let userEmailInput = "";
    let topic = "";
    let keywords = "";
    let naverBlogIdInput = "";
    let refUrls: string[] = [];
    const uploadedFiles: Array<{ name: string; buffer: Buffer; mimeType: string }> = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      userEmailInput = String(formData.get("userEmail") || formData.get("email") || "").trim();
      topic = String(formData.get("topic") || "").trim();
      keywords = String(formData.get("keywords") || "").trim();
      naverBlogIdInput = String(formData.get("naverBlogId") || formData.get("blogId") || "").trim();

      const url1 = String(formData.get("refUrl1") || "").trim();
      const url2 = String(formData.get("refUrl2") || "").trim();
      const url3 = String(formData.get("refUrl3") || "").trim();
      refUrls = [url1, url2, url3].filter((u) => u.startsWith("http"));

      // 다중 파일 수신 (files 및 images 파트명 모두 지원)
      const allEntries = [...formData.getAll("files"), ...formData.getAll("images")];
      for (const entry of allEntries) {
        if (entry && typeof entry === "object" && "arrayBuffer" in entry) {
          const file = entry as File;
          const buf = Buffer.from(await file.arrayBuffer());
          uploadedFiles.push({
            name: file.name || `photo_${Date.now()}.jpg`,
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
      naverBlogIdInput = String(json.naverBlogId || json.blogId || "").trim();
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
    const blogId = `blog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. 구글 드라이브 [SheetBot] 블로그 사진 보관함 격리 업로드
    const imageDriveList: Array<{ name: string; url: string; base64: string }> = [];
    let driveFolderUrl = "";

    try {
      const parentFolder = await findOrCreateEgdeskFolder("[SheetBot] 연동 데이터");
      const blogFolder = await createDriveFolder("[SheetBot] 블로그 사진 보관함", parentFolder?.id);
      driveFolderUrl = blogFolder?.id ? `https://drive.google.com/drive/folders/${blogFolder.id}` : "";

      // 사진들을 병렬로 드라이브에 업로드
      await Promise.allSettled(
        uploadedFiles.slice(0, 10).map(async (file, idx) => {
          const b64 = file.buffer.toString("base64");
          const safeName = `img_${idx + 1}_${file.name}`;
          const uploadRes = await uploadDriveFile({
            name: safeName,
            content: b64,
            mimeType: file.mimeType,
            folderId: blogFolder.id,
            encoding: "base64",
          }).catch(() => null);

          const fileUrl = uploadRes?.webViewLink || uploadRes?.url || (uploadRes?.id ? `https://drive.google.com/file/d/${uploadRes.id}/view` : "");
          imageDriveList.push({ name: safeName, url: fileUrl, base64: b64 });
        })
      );
    } catch (driveErr: any) {
      console.warn("[BlogPost] Drive upload warning:", driveErr.message);
    }

    // 2. 참고 블로그 3개 병렬 스크래핑 (최대 3.5초)
    const scrapedRefs = await withTimeout(scrapeReferenceBlogs(refUrls), 3500, []);
    const refSummaryForAi = scrapedRefs.map((r, i) => {
      return `[참고글 ${i + 1}] 제목: "${r.title}"\n- 소제목 목차: ${r.subheadings.join(" > ") || "없음"}\n- 본문 도입/핵심 요약: ${r.sampleText.slice(0, 300)}...`;
    }).join("\n\n");

    // 3. 사진 시각 맥락 추출 (이미지가 있는 경우 상위 3장 Gemini Vision 태깅)
    let imageContextSummary = "";
    if (imageDriveList.length > 0) {
      imageContextSummary = `첨부된 실제 사진 총 ${imageDriveList.length}장이 준비되어 있습니다. 본문 내용 흐름에 맞춰 적절한 소제목 바로 아래에 [IMAGE:0], [IMAGE:1]... 마커를 꼭 삽입하세요.`;
    }

    // 4. AI 네이버 블로그 전문 카피라이터 원고 집필 (Gemini 2.5 Flash / Pro)
    const prompt = `당신은 네이버 블로그 검색 상위 1% 노출을 전문으로 하는 대한민국 최고의 상위 노출 전문 카피라이터입니다.
다음 의뢰인의 주제, 타깃 키워드, 첨부 사진, 그리고 상위 노출 벤치마킹 참고 글 분석 내용을 바탕으로
방문자 체류 시간이 높고 가독성이 뛰어난 네이버 스마트에디터 ONE 스타일의 고품질 블로그 원고를 작성하세요.

[포스팅 기본 정보]:
- 메인 주제: ${topic}
- 타깃 키워드: ${keywords || "주제 관련 핵심 키워드"}
- 첨부된 사진 수: ${imageDriveList.length}장 (${imageContextSummary})

[상위 노출 벤치마킹 분석 (장점만 흡수하고 문장은 100% 독창적으로 재작성)]:
${refSummaryForAi || "참고 URL 없음 (주제 및 키워드 기반으로 최상의 네이버 블로그 구조를 스스로 설계할 것)"}

[작성 가이드라인 - 엄격 준수]:
1. **제목**: 검색 유입률과 클릭률(CTR)을 극대화하는 매력적인 메인 타이틀 (예: "[지역/업종] 주제 + 핵심 팁 3가지 솔직 후기")
2. **구조**:
   - **도입부**: 독자의 현실적인 고민/궁금증에 깊이 공감하며 시선을 사로잡는 오프닝
   - **본문 (소제목 3~4개)**: <h2>소제목</h2>으로 명확히 구분하고, 각 단락마다 유용한 실전 정보, 팁, 주의사항 제시
   - **이미지 배치**: 본문의 각 핵심 단계마다 업로드된 사진 수만큼 [IMAGE:0], [IMAGE:1]... 마커를 반드시 적절히 분산 배치할 것! (총 ${imageDriveList.length}개 마커)
   - **결론/요약**: 핵심 포인트 3줄 정리 및 친절한 마무리 인사
3. **스타일**: 네이버 블로그 특유의 친근하면서도 신뢰감 넘치는 구어체 (~해요, ~입니다, ~더라고요), 적절한 이모지 활용, 줄바꿈과 여백을 살린 편안한 가독성.
4. **글자 수**: 공백 포함 약 2,000자 내외.

반드시 아래 JSON 포맷으로만 응답하세요:
{
  "title": "완성된 블로그 포스팅 제목",
  "contentHtml": "<h2>소제목</h2><p>본문 내용...</p>[IMAGE:0]<p>이어지는 내용...</p>",
  "summary": "1. [핵심 요점 1] ...\\n2. [핵심 요점 2] ...\\n3. [권고 조치 3] ...",
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`;

    let postTitle = `${topic} - 솔직 후기 및 핵심 꿀팁 가이드`;
    let contentHtml = `<p>${topic}에 대한 상세 포스팅입니다.</p>`;
    let summary = `1. [주제] ${topic}\n2. [키워드] ${keywords}\n3. [안내] 실전 후기 및 상세 가이드입니다.`;
    let tags = [topic, ...(keywords ? keywords.replace(/#/g, " ").split(/\s+/).filter(Boolean) : [])];

    try {
      const aiRes = await withTimeout(
        callAiCaller(prompt, { model: "gemini-2.5-flash", temperature: 0.3 }),
        12000,
        null
      );

      if (aiRes?.text) {
        const cleanJson = aiRes.text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed.title) postTitle = parsed.title;
        if (parsed.contentHtml) contentHtml = parsed.contentHtml;
        if (parsed.summary) summary = parsed.summary;
        if (Array.isArray(parsed.tags)) tags = parsed.tags;
      }
    } catch (e: any) {
      console.warn("[BlogPost] AI writing warning:", e.message);
    }

    const charCount = contentHtml.replace(/<[^>]+>/g, "").length;
    const reportUrl = `https://sheetbot.cloud/blog-post?id=${blogId}`;

    // 네이버 블로그 ID 처리 및 직통 글쓰기 링크 계산
    let cleanNaverId = extractNaverId(naverBlogIdInput);
    if (!cleanNaverId && userEmail) {
      try {
        const userRes = await queryTable<any>("sheetbot_users", {
          filters: { email: userEmail },
          limit: 1,
        });
        if (userRes.rows?.[0]?.naver_blog_id) {
          cleanNaverId = extractNaverId(userRes.rows[0].naver_blog_id);
        }
      } catch {}
    }

    const naverBlogUrl = cleanNaverId ? `https://blog.naver.com/${cleanNaverId}` : "";
    const naverWriteUrl = cleanNaverId
      ? `https://blog.naver.com/${cleanNaverId}?Redirect=Write`
      : "https://blog.naver.com/GoBlogWrite.naver";

    // 사용자가 새로운 naverBlogId를 전달했다면 sheetbot_users에 동기화
    if (cleanNaverId && userEmail) {
      try {
        const { executeSQL } = await import("@/lib/egdesk-helpers");
        await executeSQL(
          `UPDATE sheetbot_users SET naver_blog_id = '${cleanNaverId}' WHERE email = '${userEmail}';`
        ).catch(() => {});
      } catch {}
    }

    // 5. SQLite DB sheetbot_blog_posts 테이블 적재
    try {
      await insertRows("sheetbot_blog_posts", [
        {
          uuid: blogId,
          user_email: userEmail,
          title: postTitle,
          topic,
          keywords,
          ref_urls_json: JSON.stringify(refUrls),
          image_drive_urls_json: JSON.stringify(imageDriveList.map((img) => ({ name: img.name, url: img.url }))),
          content_html: contentHtml,
          summary,
          naver_post_url: naverWriteUrl,
          naver_blog_id: cleanNaverId,
          naver_blog_url: naverBlogUrl,
          char_count: charCount,
          image_count: imageDriveList.length,
          status: "COMPLETED",
          created_at: nowStr,
        },
      ]);
    } catch (dbErr: any) {
      console.warn("[BlogPost] DB insert warning:", dbErr.message);
    }

    // 6. 구글 스프레드시트 [SheetBot] 블로그 마케팅 관리 대장 적재
    let sheetUrl = "";
    try {
      const binding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "NAVER_BLOG",
        defaultTitle: "[SheetBot] 블로그 마케팅 관리 대장",
      });

      sheetUrl = binding.spreadsheetUrl;

      if (binding.isNew) {
        await callSheetsTool("sheets_append_values", {
          spreadsheetId: binding.spreadsheetId,
          range: "A1:J1",
          values: [BLOG_SHEET_HEADERS],
        }).catch(() => {});
      }

      const rowValues = [
        blogId,
        nowStr,
        postTitle,
        keywords || "-",
        naverBlogUrl || "스마트폰 기본 계정",
        reportUrl,
        naverWriteUrl,
        driveFolderUrl || "-",
        summary,
        "원고 작성 완료 (발행 대기)",
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId: binding.spreadsheetId,
        range: "A:J",
        values: [rowValues],
      });
    } catch (sheetErr: any) {
      console.warn("[BlogPost] Sheets append warning:", sheetErr.message);
    }

    // 토큰 정산 (15토큰 차감)
    void deductTokens(userEmail, 15, "NAVER_BLOG", blogId).catch(() => {});
    void recordAiUsageLog({
      userEmail,
      taskType: "NAVER_BLOG",
      model: "gemini-2.5-flash",
      promptTokens: 1500,
      completionTokens: 1200,
      costKrw: 8,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      blogId,
      title: postTitle,
      summary,
      charCount,
      imageCount: imageDriveList.length,
      reportUrl,
      sheetUrl,
      naverPostUrl: naverWriteUrl,
      naverBlogId: cleanNaverId,
      naverBlogUrl,
      naverWriteUrl,
      driveFolderUrl,
      tags,
    });
  } catch (error: any) {
    console.error("[BlogPost] API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "블로그 포스팅 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
