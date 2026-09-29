export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows, insertRows, callSheetsTool } from "@/lib/egdesk-helpers";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { setupDatabase } from "@/lib/setup-db";

const DEFAULT_CATALOG = [
  {
    code: "AC-001",
    category: "에어컨 세척",
    name: "스탠드 에어컨 분해세척",
    spec: "1대",
    unitPrice: 150000,
    discountPrice: 140000,
    photoUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "필터 및 열교환기 고압 살균"
  },
  {
    code: "AC-002",
    category: "에어컨 세척",
    name: "벽걸이 에어컨 분해세척",
    spec: "1대",
    unitPrice: 80000,
    discountPrice: 80000,
    photoUrl: "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "가정용/원룸 기준"
  },
  {
    code: "AC-003",
    category: "에어컨 세척",
    name: "천장형 시스템 에어컨 (4WAY)",
    spec: "1대",
    unitPrice: 130000,
    discountPrice: 120000,
    photoUrl: "https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=500",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "메인",
    note: "사무실/상가 천장형"
  },
  {
    code: "OPT-001",
    category: "추가 옵션",
    name: "실외기 고압 세척",
    spec: "1대",
    unitPrice: 30000,
    discountPrice: 30000,
    photoUrl: "",
    detailPhotoUrl: "",
    isSoldOut: false,
    optionType: "옵션",
    note: "실외기 오염물 제거"
  },
  {
    code: "OPT-002",
    category: "이벤트/서비스",
    name: "피톤치드 연무 살균 소독",
    spec: "1식",
    unitPrice: 10000,
    discountPrice: 0,
    photoUrl: "",
    detailPhotoUrl: "",
    isSoldOut: true,
    optionType: "옵션",
    note: "현재 피톤치드 용액 소진 (품절 예시)"
  },
];

import { resolveUserEmailFromKey } from "@/lib/user-key-helper";

/**
 * GET /api/user/quote/catalog?quoteId=xxxx 또는 ?userKey=xxxx
 * 셀프 견적기(선택 폼)에서 해당 사장님의 구글 시트 단가표 목록 및 상호 정보 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const url = new URL(req.url);
    const quoteId = url.searchParams.get("quoteId");
    const userKey = url.searchParams.get("userKey") || url.searchParams.get("u");
    const directEmail = url.searchParams.get("email");

    let targetEmail = "chachogreat@gmail.com";
    let customerName = "";
    let customerPhone = "";
    let inquiryText = "";

    if (userKey) {
      const resolvedEmail = await resolveUserEmailFromKey(userKey);
      if (resolvedEmail) {
        targetEmail = resolvedEmail;
      }
    } else if (directEmail) {
      targetEmail = directEmail.toLowerCase().trim();
    }

    if (quoteId) {
      const qRes = await queryTable("sheetbot_quotes", {
        filters: { id: quoteId },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (qRes.rows && qRes.rows.length > 0) {
        const q = qRes.rows[0];
        targetEmail = q.user_email || targetEmail;
        customerName = q.customer_name || customerName;
        customerPhone = q.customer_phone || customerPhone;
        inquiryText = q.inquiry_text || inquiryText;
      }
    }

    // 사장님 프로필/상호 정보 조회 (멀티 레이어 조회)
    let businessName = "";
    let merchantPhone = "";
    let merchantImage = "";

    // 1. sheetbot_settings 키-값 저장소 우선 확인
    try {
      const settingRes = await queryTable("sheetbot_settings", {
        filters: { key: `quote_profile_${targetEmail}` },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      if (settingRes.rows && settingRes.rows.length > 0) {
        const val = JSON.parse(settingRes.rows[0].value || "{}");
        if (val.businessName && val.businessName.trim()) {
          businessName = val.businessName.trim();
        }
        if (val.phone) merchantPhone = val.phone;
        if (val.ogImageUrl) merchantImage = val.ogImageUrl;
        else if (val.imageUrl) merchantImage = val.imageUrl;
      }
    } catch (_) {}

    // 2. sheetbot_users 테이블 확인
    if (!businessName || !merchantImage) {
      try {
        const userRes = await queryTable("sheetbot_users", {
          filters: { email: targetEmail },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        if (userRes.rows && userRes.rows.length > 0) {
          const u = userRes.rows[0];
          if (!businessName && u.business_name && u.business_name.trim()) {
            businessName = u.business_name.trim();
          }
          if (!merchantPhone && u.phone) merchantPhone = u.phone;
          if (!merchantImage && u.quote_image_url) merchantImage = u.quote_image_url;
        }
      } catch (_) {}
    }

    if (!merchantImage) {
      merchantImage = "https://sheetbot.cloud/favicon.svg";
    }

    // 3. 아직 상호명이 없으면 기본 품격 있는 상호명 채택 (개인 이메일 아이디 노출 100% 방지)
    if (!businessName) {
      businessName = "스마트 견적 & 주문 센터";
    }

    let catalogItems = [];

    try {
      const resolved = await resolveUserSpreadsheet({
        userEmail: targetEmail,
        sheetType: "QUOTE",
        defaultTitle: "[SheetBot] 스마트 간편 주문 및 품목 대장",
      });

      if (resolved.spreadsheetId) {
        // 1순위: 개편된 '품목' 탭 조회 (10개 열)
        let rangeRes = await callSheetsTool(
          "sheets_get_range",
          {
            spreadsheetId: resolved.spreadsheetId,
            range: "품목!A2:J200",
            preferOAuth: true,
          },
          { preferOAuth: true }
        ).catch(() => null);

        // 2순위: 기존 '단가표' 탭 폴백 조회
        if (!rangeRes?.values || rangeRes.values.length === 0) {
          rangeRes = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "단가표!A2:J200",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch(() => null);
        }

        // 3순위: 기본 '시트1' 폴백 조회
        if (!rangeRes?.values || rangeRes.values.length === 0) {
          rangeRes = await callSheetsTool(
            "sheets_get_range",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "시트1!A2:J200",
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch(() => null);
        }

        if (rangeRes?.values && rangeRes.values.length > 0) {
          catalogItems = rangeRes.values
            .filter((row: any[]) => row && row[2])
            .map((row: any[], idx: number) => {
              const rawSoldOut = String(row[8] || "").trim().toUpperCase();
              const isSoldOut = ["Y", "YES", "품절", "TRUE", "1", "매진", "SOLDOUT"].includes(rawSoldOut);

              // 6번째 열이 이미지 URL인지 옵션구분인지 자동 판별
              const col6 = String(row[6] || "").trim();
              const isCol6Image = col6.startsWith("http://") || col6.startsWith("https://") || col6.startsWith("data:image");
              const photoUrl = isCol6Image ? col6 : "";
              const optionType = !isCol6Image && col6 ? col6 : "메인";

              const col7 = String(row[7] || "").trim();
              const detailPhotoUrl = (col7.startsWith("http://") || col7.startsWith("https://")) ? col7 : "";

              return {
                category: String(row[0] || "기본").trim(),
                code: String(row[1] || `ITEM-${idx + 1}`).trim(),
                name: String(row[2] || "").trim(),
                spec: String(row[3] || "1개").trim(),
                unitPrice: parseInt(String(row[4] || "0").replace(/[^0-9]/g, ""), 10) || 0,
                discountPrice: parseInt(String(row[5] || "0").replace(/[^0-9]/g, ""), 10) || 0,
                photoUrl,
                detailPhotoUrl,
                isSoldOut,
                optionType,
                note: String(row[9] || (isCol6Image ? "" : row[7]) || "").trim(),
              };
            });
        }
      }
    } catch (err: any) {
      console.warn("[QuoteCatalog] Sheet fetch warning, using default:", err.message);
    }

    if (catalogItems.length === 0) {
      catalogItems = DEFAULT_CATALOG;
    }

    // 카테고리 목록 추출
    const categories = Array.from(new Set(catalogItems.map((c: any) => c.category)));

    return NextResponse.json({
      success: true,
      quoteId,
      customerName,
      customerPhone,
      inquiryText,
      merchant: {
        businessName,
        phone: merchantPhone,
        email: targetEmail,
        imageUrl: merchantImage,
      },
      categories,
      catalog: catalogItems,
    });
  } catch (error: any) {
    console.error("[QuoteCatalog] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/user/quote/catalog
 * 셀프 견적 웹앱 상호명 및 연락처 실시간 업데이트
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const body = await req.json().catch(() => ({}));
    const targetEmail = (body.email || "").toLowerCase().trim();
    const businessName = (body.businessName ?? body.business_name ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const imageUrl = (body.imageUrl ?? body.ogImageUrl ?? "").trim();

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 정보가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const settingKey = `quote_profile_${targetEmail}`;

    // 1. sheetbot_settings 영구 저장
    try {
      const settingRes = await queryTable("sheetbot_settings", {
        filters: { key: settingKey },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      let existingVal: any = {};
      if (settingRes.rows && settingRes.rows.length > 0) {
        try {
          existingVal = JSON.parse(settingRes.rows[0].value || "{}");
        } catch (_) {}
      }

      existingVal.businessName = businessName || existingVal.businessName || "";
      if (phone) existingVal.phone = phone;
      if (imageUrl) {
        existingVal.imageUrl = imageUrl;
        existingVal.ogImageUrl = imageUrl;
      }
      existingVal.updatedAt = now;

      const payload = JSON.stringify(existingVal);
      if (settingRes.rows && settingRes.rows.length > 0) {
        await updateRows("sheetbot_settings", { value: payload, updated_at: now }, { filters: { key: settingKey } });
      } else {
        await insertRows("sheetbot_settings", [
          {
            id: Math.floor(Date.now() / 1000),
            key: settingKey,
            value: payload,
            description: `견적 프로필 (${targetEmail})`,
            created_at: now,
          },
        ]);
      }
    } catch (_) {}

    // 2. sheetbot_users 동시 저장
    try {
      const updateData: any = { business_name: businessName, updated_at: now };
      if (phone) updateData.phone = phone;
      if (imageUrl) updateData.quote_image_url = imageUrl;
      await updateRows("sheetbot_users", updateData, { filters: { email: targetEmail } });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      email: targetEmail,
      businessName,
      phone,
      imageUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

