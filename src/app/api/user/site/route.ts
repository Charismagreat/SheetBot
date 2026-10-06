export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  callSheetsTool,
  callAiCaller,
  findOrCreateEgdeskFolder,
  callDriveTool,
  createDriveFolder,
} from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";

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
    .slice(0, -1);
}

/**
 * 100% 구글 스프레드시트 단독 관리(Google Sheets as a Database) 18대 표준 컬럼 규격
 * A: 사이트ID
 * B: 최종수정일시
 * C: 상호명
 * D: 업종/카테고리
 * E: 대표슬로건
 * F: 브랜드스토리/소개
 * G: 실시간공지 (사장님이 시트에서 수정 시 웹에 실시간 즉시 반영)
 * H: 영업시간 (사장님이 시트에서 수정 시 웹에 실시간 즉시 반영)
 * I: 대표전화
 * J: 주소/위치
 * K: 테마컬러
 * L: 대표메뉴목록(JSON)
 * M: 사진목록(JSON)
 * N: SNS링크(JSON)
 * O: 모바일웹링크
 * P: 사진보관함링크
 * Q: 운영상태
 * R: 스프레드시트URL
 */
export const SITE_SHEET_HEADERS = [
  "사이트ID",
  "최종수정일시",
  "상호명",
  "업종/카테고리",
  "대표슬로건",
  "브랜드스토리/소개",
  "실시간공지",
  "영업시간",
  "대표전화",
  "주소/위치",
  "테마컬러",
  "대표메뉴목록(JSON)",
  "사진목록(JSON)",
  "SNS링크(JSON)",
  "모바일웹링크",
  "사진보관함링크",
  "운영상태",
  "스프레드시트URL",
];

// 초고속 웹 뷰어 서빙을 위한 단기 인메모리 캐시 (TTL: 10초)
interface CachedSite {
  data: any;
  timestamp: number;
}
const siteCache = new Map<string, CachedSite>();
const CACHE_TTL_MS = 10 * 1000;

// 사이트ID -> 스프레드시트ID 매핑 캐시
const siteSpreadsheetMap = new Map<string, { spreadsheetId: string; rowIndex: number }>();

// 타임아웃 가드 헬퍼
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * AI Caller 응답 2중 언래핑 안전 파서
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
 * 구글 스프레드시트에서 직접 사이트 데이터를 조회하는 핵심 함수
 */
async function fetchSiteFromSheet(siteId: string, forceFresh = false) {
  if (!forceFresh) {
    const cached = siteCache.get(siteId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 1. 스프레드시트 바인딩 확인 (기본 바인딩 또는 매핑 조회)
  let spreadsheetId = siteSpreadsheetMap.get(siteId)?.spreadsheetId;

  if (!spreadsheetId) {
    const binding = await resolveUserSpreadsheet({
      userEmail: "charismagreat@gmail.com",
      sheetType: "MOBILE_SITE",
      defaultTitle: "[SheetBot] 모바일 홈페이지 관리 대장",
    }).catch(() => null);
    if (binding?.spreadsheetId) {
      spreadsheetId = binding.spreadsheetId;
    }
  }

  if (!spreadsheetId) {
    return null;
  }

  // 2. 구글 스프레드시트 A2:R 전체 행 읽기
  const res = await callSheetsTool("sheets_get_range", {
    spreadsheetId,
    range: "A2:R100",
  }).catch(() => null);

  const values: string[][] = res?.values || [];
  let foundRow: string[] | null = null;
  let targetRowIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row && row[0] === siteId) {
      foundRow = row;
      targetRowIndex = i + 2; // 1-indexed, A1이 헤더이므로 A2는 index 0
      break;
    }
  }

  if (!foundRow) {
    return null;
  }

  // 매핑 캐시 갱신
  siteSpreadsheetMap.set(siteId, { spreadsheetId, rowIndex: targetRowIndex });

  let bannerImages: any[] = [];
  let menuItems: any[] = [];
  let socialLinks: any = {};

  try {
    if (foundRow[11]) menuItems = JSON.parse(foundRow[11]);
  } catch {}
  try {
    if (foundRow[12]) bannerImages = JSON.parse(foundRow[12]);
  } catch {}
  try {
    if (foundRow[13]) socialLinks = JSON.parse(foundRow[13]);
  } catch {}

  const siteData = {
    id: foundRow[0] || siteId,
    updatedAt: foundRow[1] || "",
    title: foundRow[2] || "",
    category: foundRow[3] || "",
    slogan: foundRow[4] || "",
    description: foundRow[5] || "",
    notice: foundRow[6] || "",
    businessHours: foundRow[7] || "",
    phone: foundRow[8] || "",
    address: foundRow[9] || "",
    themeColor: foundRow[10] || "emerald",
    menuItems,
    bannerImages,
    socialLinks,
    siteUrl: foundRow[14] || `https://sheetbot.cloud/site/${siteId}`,
    driveFolderUrl: foundRow[15] || "",
    status: foundRow[16] || "ACTIVE",
    sheetUrl: foundRow[17] || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    spreadsheetId,
    rowIndex: targetRowIndex,
  };

  siteCache.set(siteId, { data: siteData, timestamp: Date.now() });
  return siteData;
}

/**
 * GET /api/user/site?id=xxx
 * 
 * 구글 스프레드시트에서 직접 읽어와 모바일 웹 뷰어로 렌더링
 * (사장님이 시트에서 실시간공지나 영업시간 등을 수정하면 즉시 최신 데이터 반영)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const fresh = searchParams.get("fresh") === "true";

    if (!id) {
      return NextResponse.json({ success: false, error: "id 파라미터가 필요합니다." }, { status: 400 });
    }

    const site = await fetchSiteFromSheet(id, fresh);

    if (!site) {
      return NextResponse.json({ success: false, error: "구글 시트에서 해당 모바일 홈페이지를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      site,
      managedBy: "Google Sheets as a Database",
    });
  } catch (error: any) {
    console.error("[Site GET from Sheets] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "모바일 홈페이지 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/site
 * 
 * 신규 모바일 홈페이지 생성:
 * 1. 구글 드라이브 홈페이지 사진 보관함 격리 업로드
 * 2. 이지데스크 AI Caller(Gemini 2.5 Flash) 브랜드 스토리, 추천 메뉴, 슬로건 자동 빌드
 * 3. 100% 구글 스프레드시트 [SheetBot] 모바일 홈페이지 관리 대장에만 직접 행 추가!
 *    (My DB를 전혀 거치지 않는 순수 구글 시트 No-Code CMS 아키텍처)
 */
export async function POST(req: NextRequest) {
  try {
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
      : (headerEmail && headerEmail.includes("@") ? headerEmail.toLowerCase().trim() : "charismagreat@gmail.com");

    if (!title) {
      return NextResponse.json({ success: false, error: "상호명(홈페이지 이름)을 입력해 주세요." }, { status: 400 });
    }

    const nowStr = getKoreanTimeString();
    const siteId = `site_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const siteUrl = `https://sheetbot.cloud/site/${siteId}`;

    // 1. 구글 드라이브 [SheetBot] 홈페이지 사진 보관함 격리 업로드
    const imageDriveList: Array<{ name: string; url: string }> = [];
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
          imageDriveList.push({ name: safeName, url: fileUrl });
        })
      );
    } catch (driveErr: any) {
      console.warn("[SitePost] Drive upload warning:", driveErr.message);
    }

    // 2. 이지데스크 AI Caller(Gemini 2.5 Flash) 브랜드 스토리 & 메뉴 자동 설계
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

    // 3. 100% 구글 스프레드시트 [SheetBot] 모바일 홈페이지 관리 대장에만 직접 행 추가!
    let sheetUrl = "";
    let spreadsheetId = "";

    try {
      const binding = await resolveUserSpreadsheet({
        userEmail,
        sheetType: "MOBILE_SITE",
        defaultTitle: "[SheetBot] 모바일 홈페이지 관리 대장",
      });

      spreadsheetId = binding.spreadsheetId;
      sheetUrl = binding.spreadsheetUrl;

      // 신규 시트이거나 헤더가 없을 경우 18대 표준 헤더 자동 주입
      if (binding.isNew) {
        await callSheetsTool("sheets_update_range", {
          spreadsheetId,
          range: "A1:R1",
          values: [SITE_SHEET_HEADERS],
        }).catch(() => {});
      }

      const socialLinksJson = JSON.stringify({
        phone: phone || "",
        instagram: "https://www.instagram.com/",
        naverMap: address ? `https://map.naver.com/v5/search/${encodeURIComponent(address)}` : "",
      });

      // 18대 표준 컬럼 순서로 행 추가
      const rowValues = [
        siteId,                                      // A: 사이트ID
        nowStr,                                      // B: 최종수정일시
        title,                                       // C: 상호명
        category,                                    // D: 업종/카테고리
        slogan,                                      // E: 대표슬로건
        description,                                 // F: 브랜드스토리/소개
        finalNotice,                                 // G: 실시간공지 (사장님이 시트에서 수정 시 즉시 반영)
        businessHours,                               // H: 영업시간 (사장님이 시트에서 수정 시 즉시 반영)
        phone || "-",                                // I: 대표전화
        address || "-",                              // J: 주소/위치
        finalThemeColor,                             // K: 테마컬러
        JSON.stringify(menuItems),                   // L: 대표메뉴목록(JSON)
        JSON.stringify(imageDriveList),              // M: 사진목록(JSON)
        socialLinksJson,                             // N: SNS링크(JSON)
        siteUrl,                                     // O: 모바일웹링크
        driveFolderUrl,                              // P: 사진보관함링크
        "운영중 (ACTIVE)",                            // Q: 운영상태
        sheetUrl,                                    // R: 스프레드시트URL
      ];

      await callSheetsTool("sheets_append_values", {
        spreadsheetId,
        range: "A:R",
        values: [rowValues],
      });

      // 매핑 캐시 및 사이트 캐시 사전 등록
      siteSpreadsheetMap.set(siteId, { spreadsheetId, rowIndex: 2 });
      siteCache.set(siteId, {
        data: {
          id: siteId,
          updatedAt: nowStr,
          title,
          category,
          slogan,
          description,
          notice: finalNotice,
          businessHours,
          phone,
          address,
          themeColor: finalThemeColor,
          menuItems,
          bannerImages: imageDriveList,
          socialLinks: JSON.parse(socialLinksJson),
          siteUrl,
          driveFolderUrl,
          status: "운영중 (ACTIVE)",
          sheetUrl,
          spreadsheetId,
        },
        timestamp: Date.now(),
      });
    } catch (sheetErr: any) {
      console.error("[SitePost] Sheets direct append fatal error:", sheetErr);
      throw new Error(`구글 스프레드시트 저장 중 오류: ${sheetErr.message}`);
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
      managedBy: "Google Sheets as a Database",
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
 * 구글 스프레드시트의 해당 행을 직접 실시간 수정
 * (사장님이 스마트폰 앱이나 웹에서 수정한 내용도 구글 시트에 즉시 반영!)
 */
export async function PUT(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const { siteId, notice, businessHours, phone, address, slogan, description } = json;

    if (!siteId) {
      return NextResponse.json({ success: false, error: "siteId가 필요합니다." }, { status: 400 });
    }

    // 현재 사이트의 시트 행 위치 탐색
    const currentSite = await fetchSiteFromSheet(siteId, true);
    if (!currentSite || !currentSite.spreadsheetId || !currentSite.rowIndex) {
      return NextResponse.json({ success: false, error: "해당 사이트의 스프레드시트 위치를 찾을 수 없습니다." }, { status: 404 });
    }

    const { spreadsheetId, rowIndex } = currentSite;
    const nowStr = getKoreanTimeString();

    // 18대 컬럼 중 변경된 항목 반영
    const updatedSlogan = slogan !== undefined ? slogan : currentSite.slogan;
    const updatedDescription = description !== undefined ? description : currentSite.description;
    const updatedNotice = notice !== undefined ? notice : currentSite.notice;
    const updatedBusinessHours = businessHours !== undefined ? businessHours : currentSite.businessHours;
    const updatedPhone = phone !== undefined ? phone : currentSite.phone;
    const updatedAddress = address !== undefined ? address : currentSite.address;

    // B열(최종수정일시), E열(슬로건), F열(설명), G열(실시간공지), H열(영업시간), I열(전화), J열(주소) 업데이트
    // B열 수정
    await callSheetsTool("sheets_update_range", {
      spreadsheetId,
      range: `B${rowIndex}`,
      values: [[nowStr]],
    }).catch(() => {});

    // E열부터 J열까지 일괄 업데이트
    await callSheetsTool("sheets_update_range", {
      spreadsheetId,
      range: `E${rowIndex}:J${rowIndex}`,
      values: [[
        updatedSlogan,
        updatedDescription,
        updatedNotice,
        updatedBusinessHours,
        updatedPhone,
        updatedAddress,
      ]],
    });

    // 캐시 무효화
    siteCache.delete(siteId);

    return NextResponse.json({
      success: true,
      message: "구글 스프레드시트에 성공적으로 직접 수정·반영되었습니다.",
      updatedAt: nowStr,
      managedBy: "Google Sheets as a Database",
    });
  } catch (error: any) {
    console.error("[Site PUT to Sheets] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "구글 시트 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
