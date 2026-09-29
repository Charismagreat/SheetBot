export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryTable, updateRows, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import fs from "fs";
import path from "path";

/**
 * GET /api/user/quote/image?userKey=xxx 또는 ?email=xxx
 * 견적 웹앱 대표 썸네일 이미지 URL 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions).catch(() => null);
    const url = new URL(req.url);
    const userKey = url.searchParams.get("userKey") || url.searchParams.get("u");
    const emailParam = url.searchParams.get("email");

    let targetEmail = "";
    if (userKey) {
      targetEmail = (await resolveUserEmailFromKey(userKey)) || "";
    } else if (emailParam) {
      targetEmail = emailParam.toLowerCase().trim();
    } else if (session?.user?.email) {
      targetEmail = session.user.email.toLowerCase().trim();
    }

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 또는 사용자 키가 필요합니다." }, { status: 400 });
    }

    let imageUrl = "";
    let businessName = "스마트 견적 & 주문 센터";

    // 1. sheetbot_settings 조회
    try {
      const settingRes = await queryTable("sheetbot_settings", {
        filters: { key: `quote_profile_${targetEmail}` },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (settingRes.rows && settingRes.rows.length > 0) {
        const val = JSON.parse(settingRes.rows[0].value || "{}");
        if (val.ogImageUrl) imageUrl = val.ogImageUrl;
        else if (val.imageUrl) imageUrl = val.imageUrl;
        if (val.businessName && val.businessName.trim()) businessName = val.businessName.trim();
      }
    } catch (_) {}

    // 2. sheetbot_users 조회
    if (!imageUrl || businessName === "스마트 견적 & 주문 센터") {
      try {
        const userRes = await queryTable("sheetbot_users", {
          filters: { email: targetEmail },
          limit: 1,
        }).catch(() => ({ rows: [] }));

        if (userRes.rows && userRes.rows.length > 0) {
          const u = userRes.rows[0];
          if (!imageUrl && u.quote_image_url) imageUrl = u.quote_image_url;
          if (businessName === "스마트 견적 & 주문 센터" && u.business_name) {
            businessName = u.business_name.trim();
          }
        }
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      imageUrl: imageUrl || "https://sheetbot.cloud/favicon.svg",
      hasCustomImage: !!imageUrl,
      businessName,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/user/quote/image
 * 견적 웹앱 및 카카오톡 미리보기용 대표 이미지 파일 업로드 & 저장
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const session = await getServerSession(authOptions).catch(() => null);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const directEmail = (formData.get("email") || formData.get("userEmail")) as string | null;
    const headerEmail = req.headers.get("x-sheetbot-user-email");

    const targetEmail = (
      directEmail ||
      session?.user?.email ||
      headerEmail ||
      ""
    ).toLowerCase().trim();

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 정보가 필요합니다." }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: "업로드할 이미지 파일이 없습니다." }, { status: 400 });
    }

    // 파일 형식 및 크기 검증 (최대 10MB)
    const mimeType = file.type || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "이미지 파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }

    // 저장 디렉터리 준비 (public/uploads/quote-images)
    const publicDir = path.join(process.cwd(), "public");
    const uploadDir = path.join(publicDir, "uploads", "quote-images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 확장자 추출
    let ext = "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = "jpg";
    else if (mimeType.includes("webp")) ext = "webp";
    else if (mimeType.includes("gif")) ext = "gif";
    else if (file.name && file.name.includes(".")) {
      ext = file.name.split(".").pop()?.toLowerCase() || "png";
    }

    const safeEmail = targetEmail.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `quote_${safeEmail}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `https://sheetbot.cloud/uploads/quote-images/${fileName}`;
    const now = new Date().toISOString();

    // 1. sheetbot_settings 동기화
    let businessName = "";
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
        if (existingVal.businessName) businessName = existingVal.businessName;
      }

      existingVal.ogImageUrl = imageUrl;
      existingVal.imageUrl = imageUrl;
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
      console.warn("[QuoteImage POST] sheetbot_settings update warning:", sErr?.message);
    }

    // 2. sheetbot_users 동기화
    try {
      const userRes = await queryTable("sheetbot_users", {
        filters: { email: targetEmail },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (userRes.rows && userRes.rows.length > 0) {
        const u = userRes.rows[0];
        if (!businessName && u.business_name) businessName = u.business_name;
        await updateRows(
          "sheetbot_users",
          { quote_image_url: imageUrl, updated_at: now },
          { filters: { email: targetEmail } }
        );
      } else {
        await insertRows("sheetbot_users", [
          {
            id: Math.floor(Date.now() / 1000),
            email: targetEmail,
            name: session?.user?.name || targetEmail.split("@")[0],
            business_name: businessName,
            quote_image_url: imageUrl,
            role: "USER",
            status: "ACTIVE",
            tier: "FREE",
            created_at: now,
            updated_at: now,
          },
        ]);
      }
    } catch (uErr: any) {
      console.warn("[QuoteImage POST] sheetbot_users update warning:", uErr?.message);
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      imageUrl,
      businessName,
      message: "대표 미리보기 이미지가 성공적으로 등록되었습니다!",
    });
  } catch (err: any) {
    console.error("[QuoteImage POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
