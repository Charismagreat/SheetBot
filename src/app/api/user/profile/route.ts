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

    if (userRes.rows && userRes.rows.length > 0) {
      const u = userRes.rows[0];
      return NextResponse.json({
        success: true,
        email: targetEmail,
        businessName: u.business_name || u.name || "",
        phone: u.phone || "",
        name: u.name || "",
      });
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      businessName: "",
      phone: "",
      name: "",
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
    const now = new Date().toISOString();

    // 1. sheetbot_settings 키-값 저장소에 영구 보존
    try {
      const settingKey = `quote_profile_${targetEmail}`;
      const payload = JSON.stringify({ businessName, phone, updatedAt: now });
      const settingRes = await queryTable("sheetbot_settings", {
        filters: { key: settingKey },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (settingRes.rows && settingRes.rows.length > 0) {
        await updateRows("sheetbot_settings", { value: payload, updated_at: now }, { filters: { key: settingKey } });
      } else {
        await insertRows("sheetbot_settings", [
          {
            id: `set_${Date.now()}`,
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
            updated_at: now,
          },
          { filters: { email: targetEmail } }
        );
      } else {
        await insertRows("sheetbot_users", [
          {
            id: `usr_${Date.now()}`,
            email: targetEmail,
            name: session?.user?.name || targetEmail.split("@")[0],
            business_name: businessName,
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
