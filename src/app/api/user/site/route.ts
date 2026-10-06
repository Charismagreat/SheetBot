export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  
  callSheetsTool,
  callAiCaller,
  findOrCreateEgdeskFolder,
  insertRows,
  updateRows,
  queryTable,
  callDriveTool,
  createDriveFolder, // Added for creating subfolders
} from "@/lib/egdesk-helpers";

// Local utility to get Korean time string
function getKoreanTimeString(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  };
  return new Intl.DateTimeFormat('ko-KR', options)
    .format(now)
    .replace(/\./g, '-')
    .replace(/ /g, '')
    .slice(0, -1); // Remove trailing hyphen
}
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { setupDatabase } from "@/lib/setup-db";

const SITE_SHEET_HEADERS = [
  "ID",
  "최종수정일시",
  "상호명",
  "업종/카테고리",
  "모바일 웹 링크",
  "대표 전화",
  "주소/위치",
  "영업시간",
  "슬로건/한줄소개",
  "운영 상태",
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
      .replace(/^```json\s*/i)
      .replace(/^```\s*/i)
      .replace(/```$/i)
      .trim();
    return JSON.parse(cleanJson);
  } catch {
    return fallback;
  }
}

/**
 * GET /api/user/site?id=xxx
 * 
 * 모바일 홈페이지 단건 조회 (웹 뷰어 및 모바일 수정 지원)
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "id 파라미터가 필요합니다." }, { status: 400 });
    }

    const rowsRes = await queryTable<any>("sheetbot_sites", {
      filters: { uuid: id },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let row = rowsRes.rows?.[0];

    if (!row) {
      // 최근 등록건 중 일치하는 레코드 탐색 (폴백)
      const allRowsRes = await queryTable<any>("sheetbot_sites", {
        limit: 10,
        orderBy: "id",
        orderDirection: "DESC",
      }).catch(() => ({ rows: [] }));
      const matched = allRowsRes.rows?.find((r: any) => r.uuid === id || String(r.id) === id);
      if (matched) row = matched;
    }

    if (!row) {
      return NextResponse.json({ success: false, error: "해당 모바일 홈페이지를 찾을 수 없습니다." }, { status: 404 });
    }

    let bannerImages: Array<{ name: string; url: string }> = [];
    let menuItems: Array<{ name: string; price: string; description: string; badge?: string }> = [];
    let socialLinks: Record<string, string> = {};

    try {
      if (row.banner_images_json) bannerImages = JSON.parse(row.banner_images_json);
    } catch {}
    try {
      if (row.menu_items_json) menuItems = JSON.parse(row.menu_items_json);
    } catch {}
    try {
      if (row.social_links_json) socialLinks = JSON.parse(row.social_links_json);
    } catch {}

    return NextResponse.json({
      success: true,
      site: {
        id: row.uuid || String(row.id),
        title: row.title,
        category: row.category,
        slogan: row.slogan,
        description: row.description,
        phone: row.phone,
        address: row.address,
        businessHours: row.business_hours,
        bannerImages,
        menuItems,
        notice: row.notice,
        socialLinks,
        themeColor: row.theme_color || "emerald",
        siteUrl: row.site_url,
        sheetUrl: row.sheet_url,
        driveFolderUrl: row.drive_folder_url,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    console.error("[Site GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "모바일 홈페이지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/site
 * 
 * 사진 멀티 업로드 + 매장/기업 기본 정보 수신
 * 1. 구글 드라이브 홈페이지 사진 보관함 격리 업로드
 * 2. 이지데스크 AI Caller(Gemini 2.5 Flash) 브랜드 스토리, 추천 메뉴, 슬로건 자동 빌드
 * 3. 구글 시트 [SheetBot] 모바일 홈페이지 관리 대장 적재
 * 4. SQLite DB sheetbot_sites 영구 적재
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();

    const headerEmail = req.headers.get("x-sheetbot-user-email");

    let userEmailInput = "";
    let title = "";
    let category = "카페 / 베이커리";
    let inputDescription = "";
    let phone = "";
    let address = "";
    let businessHours = "매일 10:00 ~ 22:00";
    let notice = "";
    let themeColor = "emerald";
    const uploadedFiles: Array<{ name: string; buffer: Buffer; mimeType: string }> = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      userEmailInput = String(formData.get("userEmail") || formData.get("email") || "").trim();
      title = String(formData.get("title") || "").trim();
      category = String(formData.get("category") || "카페 / 베이커리").trim();
      inputDescription = String(formData.get("description") || "").trim();
      phone = String(formData.get("phone") || "").trim();
      address = String(formData.get("address") || "").trim();
      businessHours = String(formData.get("businessHours") || "매일 10:00 ~ 22:00").trim();
      notice = String(formData.get("notice") || "").trim();
      themeColor = String(formData.get("themeColor") || "emerald").trim();

      const allEntries = [...formData.getAll("files"), ...formData.getAll("images")];
      for (const entry of allEntries) {
        if (entry && typeof entry === "object" && "arrayBuffer" in entry) {
          const file = entry as File;
          const buf = Buffer.from(await file.arrayBuffer());
          uploadedFiles.push({
            name: file.name || `site_photo_${Date.now()}.jpg`,
            buffer: buf,
            mimeType: file.type || "image/jpeg",
          });
        }
      }
    } else {
      const json = await req.json().catch(() => ({}));
      userEmailInput = String(json.userEmail || json.email || "").trim();
      title = String(json.title || "").trim();
      category = String(json.category || "카페 / 베이커리").trim();
      inputDescription = String(json.description || "").trim();
      phone = String(json.phone || "").trim();
      address = String(json.address || "").trim();
      businessHours = String(json.businessHours || "매일 10:00 ~ 22:00").trim();
      notice = String(json.notice || "").trim();
      themeColor = String(json.themeColor || "emerald").trim();
    }

    const userEmail = (userEmailInput && userEmailInput.includes("@"))
      ? userEmailInput.toLowerCase().trim()
      : (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "");

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!title) {
      return NextResponse.json({ success: false, error: "상호명(홈페이지 이름)을 입력해 주세요." }, { status: 400 });
    }

    const nowStr = getKoreanTimeString();
    const siteId = `site_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const siteUrl = `https://sheetbot.cloud/site/${siteId}`;

    // 1. 구글 드라이브 [SheetBot] 홈페이지 사진 보관함 격리 업로드
    const imageDriveList: Array<{ name: string; url: string; base64: string }> = [];
    let driveFolderUrl = "";

    try {
      const parentFolder = await findOrCreateEgdeskFolder("[SheetBot] 연동 데이터");
      const siteFolder = await createDriveFolder("[SheetBot] 홈페이지 사진 보관함", parentFolder.id);
      driveFolderUrl = siteFolder.id ? `https://drive.google.com/drive/folders/${siteFolder.id}` : "";

      await Promise.allSettled(
        uploadedFiles.map(async (file, idx) => {
          const b64 = file.buffer.toString("base64");
          const safeName = `${siteId}_banner_${idx + 1}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

          const uploadRes = await callDriveTool("drive_upload", {
            name: safeName,
            content: b64,
            mimeType: file.mimeType,
            folderId: siteFolder.id,
            encoding: "base64",
          }).catch(() => null);

          const fileUrl = uploadRes?.webViewLink || uploadRes?.url || (uploadRes?.id ? `https://drive.google.com/file/d/${uploadRes.id}/view` : "");
          imageDriveList.push({ name: safeName, url: fileUrl, base64: b64 });
        })
      );
    } catch (driveErr: any) {
      console.warn("[SitePost] Drive upload warning:", driveErr.message);
    }

    // 2. AI Caller(callAiCaller) 경유 모바일 웹 콘텐츠 자동 설계
    const prompt = `당신은 대한민국 최고의 모바일 웹사이트 기획자이자 브랜드 스토리텔러입니다.
다음 의뢰인의 상호명, 업종, 기본 정보를 바탕으로
스마트폰 화면에서 방문자의 시선을 사로잡고 신뢰와 방문/문의를 이끌어내는 고품질 모바일 홈페이지 콘텐츠를 기획하세요.

[매장 / 기업 기본 정보]:
- 상호명: ${title}
- 업종/카테고리: ${category}
- 주요 설명 / 특징: ${inputDescription || "정성을 다해 최고의 경험을 선사하는 전문 공간"}
- 대표 전화: ${phone || "02-1234-5678"}
- 주소/위치: ${address || "서울 특별시"}
- 영업시간: ${businessHours}
- 등록 사진 수: ${imageDriveList.length}장

[작성 가이드라인]:
1. **슬로건 (Slogan)**: 매장의 매력을 한눈에 전달하는 감각적인 한 줄 슬로건 (15~25자)
2. **브랜드 스토리 (Description)**: 신뢰와 감성을 전달하는 상세 소개글 (2~3개 단락, 300자 내외)
3. **대표 메뉴 / 서비스 카드 (Menu Items)**:
   - 업종에 어울리는 대표 메뉴/서비스/상품 4~6개를 생성하세요.
   - 각 항목마다 'name'(상품명), 'price'(가격 표기, 예: '6,500원'), 'description'(매력적인 맛/특징 설명), 'badge'('BEST', 'NEW', '시그니처' 중 하나)를 포함하세요.
4. **추천 공지사항 (Notice)**: 입력된 공지가 없을 경우 시즌/이벤트 공지 추천 문구
5. **추천 테마 컬러**: 'emerald', 'rose', 'indigo', 'amber' 중 업종에 가장 어울리는 컬러

반드시 아래 JSON 포맷으로만 응답하세요:
{
  "slogan": "감각적인 한 줄 슬로건",
  "description": "상세한 브랜드 스토리 및 소개글...",
  "notice": "방문객을 위한 추천 공지/이벤트 문구",
  "themeColor": "emerald",
  "menuItems": [
    { "name": "시그니처 메뉴명", "price": "12,000원", "description": "특징 설명...", "badge": "BEST" },
    { "name": "추천 메뉴명 2", "price": "8,500원", "description": "특징 설명...", "badge": "시그니처" }
  ]
}`;

    let slogan = `${title}에 오신 것을 환영합니다`;
    let description = inputDescription || `${title}은 고객 한 분 한 분께 정성을 다해 최고의 서비스를 제공합니다.`;
    let finalNotice = notice || "🎉 모바일 홈페이지 오픈 기념 리뷰 이벤트를 진행 중입니다!";
    let finalThemeColor = themeColor;
    let menuItems = [
      { name: "시그니처 메뉴", price: "변동", description: "매장의 대표 인기 메뉴입니다.", badge: "BEST" },
      { name: "스페셜 메뉴", price: "변동", description: "정성을 다해 준비한 특별 메뉴입니다.", badge: "시그니처" },
    ];

    try {
      const aiRes = await withTimeout(
        callAiCaller(prompt, { model: "gemini-2.5-flash", temperature: 0.3 }),
        12000,
        null
      );

      if (aiRes?.text) {
        const parsed = unwrapAiCallerJson<any>(aiRes.text, null);
        if (parsed) {
          if (parsed.slogan) slogan = String(parsed.slogan).trim();
          if (parsed.description) description = String(parsed.description).trim();
          if (parsed.notice && !notice) finalNotice = String(parsed.notice).trim();
          if (parsed.themeColor && !themeColor) finalThemeColor = String(parsed.themeColor).trim();
          if (Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0) {
            menuItems = parsed.menuItems;
          }
        }
      }
    } catch (aiErr: any) {
      console.warn("[SitePost] AI Caller warning:", aiErr.message);
    }

    // 3. 구글 스프레드시트 [SheetBot] 모바일 홈페이지 관리 대장 적재
    let sheetUrl = "";
    try {
      const binding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "MOBILE_SITE",
        defaultTitle: "[SheetBot] 모바일 홈페이지 관리 대장",
      });

      sheetUrl = binding.spreadsheetUrl;

      if (binding.isNew) {
        await callSheetsTool("sheets_append_values", {
          spreadsheetId: binding.spreadsheetId,
          range: "A1:J1",
          values: [SITE_SHEET_HEADERS],
        }).catch(() => {});
      }

      const rowValues = [
        siteId,
        nowStr,
        title,
        category,
        siteUrl,
        phone || "-",
        address || "-",
        businessHours,
        slogan,
        "운영중 (ACTIVE)",
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId: binding.spreadsheetId,
        range: "A:J",
        values: [rowValues],
      });
    } catch (sheetErr: any) {
      console.warn("[SitePost] Sheets append warning:", sheetErr.message);
    }

    // 4. SQLite DB sheetbot_sites 영구 적재
    try {
      await insertRows("sheetbot_sites", [
        {
          uuid: siteId,
          user_email: userEmail,
          site_slug: siteId,
          title,
          category,
          slogan,
          description,
          phone,
          address,
          business_hours: businessHours,
          banner_images_json: JSON.stringify(imageDriveList),
          menu_items_json: JSON.stringify(menuItems),
          notice: finalNotice,
          social_links_json: JSON.stringify({
            phone,
            instagram: "https://www.instagram.com/",
            naverMap: address ? `https://map.naver.com/v5/search/${encodeURIComponent(address)}` : "",
          }),
          theme_color: finalThemeColor,
          site_url: siteUrl,
          sheet_url: sheetUrl,
          drive_folder_url: driveFolderUrl,
          status: "ACTIVE",
          created_at: nowStr,
        },
      ]);
    } catch (dbErr: any) {
      console.warn("[SitePost] DB insert warning:", dbErr.message);
    }



    return NextResponse.json({
      success: true,
      siteId,
      title,
      slogan,
      description,
      category,
      siteUrl,
      sheetUrl,
      menuItems,
      notice: finalNotice,
      bannerCount: imageDriveList.length,
      driveFolderUrl,
    });
  } catch (error: any) {
    console.error("[Site POST] Fatal Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "모바일 홈페이지 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/site
 * 
 * 모바일 홈페이지 정보 실시간 수정 (공지사항 변경, 영업시간 수정, 메뉴 변경 등)
 */
export async function PUT(req: NextRequest) {
  try {
    await setupDatabase();
    const json = await req.json().catch(() => ({}));
    const { siteId, notice, businessHours, phone, address, slogan, description } = json;

    if (!siteId) {
      return NextResponse.json({ success: false, error: "siteId가 필요합니다." }, { status: 400 });
    }

    const nowStr = getKoreanTimeString();
    const updatePayload: Record<string, any> = {
      updated_at: nowStr,
    };

    if (notice !== undefined) updatePayload.notice = notice;
    if (businessHours !== undefined) updatePayload.business_hours = businessHours;
    if (phone !== undefined) updatePayload.phone = phone;
    if (address !== undefined) updatePayload.address = address;
    if (slogan !== undefined) updatePayload.slogan = slogan;
    if (description !== undefined) updatePayload.description = description;

    await updateRows("sheetbot_sites", { uuid: siteId }, updatePayload);

    return NextResponse.json({
      success: true,
      message: "모바일 홈페이지 정보가 성공적으로 수정되었습니다.",
      updatedAt: nowStr,
    });
  } catch (error: any) {
    console.error("[Site PUT] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "홈페이지 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
