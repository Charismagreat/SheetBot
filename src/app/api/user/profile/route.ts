export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * GET /api/user/profile?email=xxx
 * 사장님 프로필 (상호명, 연락처 등) 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions).catch(() => null);
    const url = new URL(req.url);
    const emailParam = url.searchParams.get("email");

    const targetEmail = (session?.user?.email || emailParam || "").toLowerCase().trim();
    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 정보가 필요합니다." }, { status: 400 });
    }

    const userRes = await queryTable("sheetbot_users", {
      filters: { email: targetEmail },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    let customImageUrl = "";
    try {
      const settingRes = await queryTable("sheetbot_settings", {
        filters: { key: `quote_profile_${targetEmail}` },
        limit: 1,
      }).catch(() => ({ rows: [] }));
      if (settingRes.rows && settingRes.rows.length > 0) {
        const val = JSON.parse(settingRes.rows[0].value || "{}");
        if (val.ogImageUrl) customImageUrl = val.ogImageUrl;
        else if (val.imageUrl) customImageUrl = val.imageUrl;
      }
    } catch (_) {}

    if (userRes.rows && userRes.rows.length > 0) {
      const u = userRes.rows[0];
      if (!customImageUrl && u.quote_image_url) customImageUrl = u.quote_image_url;

      if (customImageUrl) {
        const match = customImageUrl.match(/quote_[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif)/i);
        if (match) {
          customImageUrl = `https://cdn.jsdelivr.net/gh/Charismagreat/SheetBot@main/public/uploads/quote-images/${match[0]}`;
        }
      }

      return NextResponse.json({
        success: true,
        email: targetEmail,
        businessName: u.business_name || u.name || "",
        phone: u.phone || "",
        name: u.name || "",
        imageUrl: customImageUrl || "https://sheetbot.cloud/favicon.svg",
        quoteImageUrl: customImageUrl || "https://sheetbot.cloud/favicon.svg",
      });
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      businessName: "",
      phone: "",
      name: "",
      imageUrl: customImageUrl || "https://sheetbot.cloud/favicon.svg",
      quoteImageUrl: customImageUrl || "https://sheetbot.cloud/favicon.svg",
    });
  } catch (error: any) {
    console.error("[Profile GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/user/profile
 * 사장님 상호명(businessName) 및 연락처(phone) 수정/저장
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions).catch(() => null);
    const body = await req.json().catch(() => ({}));

    const targetEmail = (body.email || session?.user?.email || "").toLowerCase().trim();
    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 정보가 필요합니다." }, { status: 400 });
    }

    const businessName = (body.businessName ?? body.business_name ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const imageUrl = (body.imageUrl ?? body.ogImageUrl ?? body.quoteImageUrl ?? "").trim();
    const now = new Date().toISOString();

    // 1. sheetbot_settings 키-값 저장소에 영구 보존
    try {
      const settingKey = `quote_profile_${targetEmail}`;
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
    } catch (sErr: any) {
      console.warn("[Profile POST] sheetbot_settings save warning:", sErr?.message);
    }

    // 2. sheetbot_users 테이블 동시 업데이트
    try {
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: targetEmail },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (userRes.rows && userRes.rows.length > 0) {
        await updateRows(
          "sheetbot_users",
          {
            business_name: businessName,
            ...(phone ? { phone } : {}),
            ...(imageUrl ? { quote_image_url: imageUrl } : {}),
            updated_at: now,
          },
          { filters: { email: targetEmail } }
        );
      } else {
        await insertRows("sheetbot_users", [
          {
            id: Math.floor(Date.now() / 1000),
            email: targetEmail,
            name: session?.user?.name || targetEmail.split("@")[0],
            business_name: businessName,
            quote_image_url: imageUrl || "",
            phone: phone,
            role: "USER",
            status: "ACTIVE",
            tier: "FREE",
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    } catch (uErr: any) {
      console.warn("[Profile POST] sheetbot_users save warning:", uErr?.message);
    }

    // 3. 연동된 구글 스프레드시트 '사업자정보' 탭 회사명(B2) 실시간 자동 동기화
    if (businessName) {
      try {
        const { resolveUserSpreadsheet } = await import("@/lib/sheet-binding-helper");
        const { callSheetsTool } = await import("@/lib/egdesk-helpers");
        const resolved = await resolveUserSpreadsheet({
          userEmail: targetEmail,
          sheetType: "QUOTE",
        });
        if (resolved.spreadsheetId) {
          await callSheetsTool(
            "sheets_update_range",
            {
              spreadsheetId: resolved.spreadsheetId,
              range: "사업자정보!B2",
              values: [[businessName]],
              preferOAuth: true,
            },
            { preferOAuth: true }
          ).catch((e: any) => console.warn("[Profile POST] sheets_update_range error:", e?.message));
        }
      } catch (sheetErr: any) {
        console.warn("[Profile POST] Sheet sync warning:", sheetErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      businessName,
      phone,
      message: "상호명 및 프로필 정보가 성공적으로 저장되었습니다.",
    });
  } catch (error: any) {
    console.error("[Profile POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
