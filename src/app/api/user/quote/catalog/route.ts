export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getOrderCatalogData, clearCatalogCache } from "@/lib/order-catalog-helper";

/**
 * GET /api/user/quote/catalog?quoteId=xxxx 또는 ?userKey=xxxx
 * 셀프 견적기(선택 폼)에서 해당 사장님의 구글 시트 단가표 목록 및 상호 정보 조회
 * 🚀 공용 헬퍼(getOrderCatalogData)를 통해 SSR 및 API 모두 0.001초 인메모리 캐시 공유
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const quoteId = url.searchParams.get("quoteId");
    const userKey = url.searchParams.get("userKey") || url.searchParams.get("u");
    const directEmail = url.searchParams.get("email");
    const isRefresh = url.searchParams.get("refresh") === "true";

    const result = await getOrderCatalogData({
      userKey,
      quoteId,
      directEmail,
      isRefresh,
    });

    return NextResponse.json(result);
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

    // 3. 인메모리 캐시 즉시 무효화
    clearCatalogCache(targetEmail);

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
