export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows, insertRows, callSheetsTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { resolveUserSpreadsheet } from "@/lib/sheet-binding-helper";
import { clearEstimateCatalogCache } from "@/lib/estimate-catalog-helper";
import { clearCatalogCache } from "@/lib/order-catalog-helper";
import fs from "fs";
import path from "path";

function getUploadDirectories() {
  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\CHARISMA";
  const dirs = [
    path.join(process.cwd(), "public", "uploads", "quote-images"),
    path.join("C:\\dev\\SheetBot", "public", "uploads", "quote-images"),
    path.join(userHome, ".egdesk", "uploads", "quote-images"),
  ];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    } catch (_) {}
  }
  return dirs;
}

/**
 * GET /api/user/quote/image
 * 1. ?file=quote_xxx.png : 이미지 바이너리 직접 스트리밍 (카카오톡 및 브라우저 전용 0초 로드)
 * 2. ?userKey=xxx 또는 ?email=xxx : 프로필 및 대표 이미지 URL JSON 메타데이터 반환
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fileName = url.searchParams.get("file");

    // 1. 이미지 파일 직접 스트리밍
    if (fileName) {
      const sanitizedFile = path.basename(fileName);
      const dirs = getUploadDirectories();

      let foundPath: string | null = null;
      for (const d of dirs) {
        const p = path.join(d, sanitizedFile);
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }

      // 이전 배포 폴더들 폴백 탐색
      if (!foundPath) {
        try {
          const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\CHARISMA";
          const deployBase = path.join(userHome, ".egdesk", "deployments", "SheetBot");
          if (fs.existsSync(deployBase)) {
            const subs = fs.readdirSync(deployBase);
            for (const sub of subs) {
              const checkP = path.join(deployBase, sub, "public", "uploads", "quote-images", sanitizedFile);
              if (fs.existsSync(checkP)) {
                foundPath = checkP;
                break;
              }
            }
          }
        } catch (_) {}
      }

      if (foundPath) {
        const buffer = fs.readFileSync(foundPath);
        const ext = path.extname(sanitizedFile).toLowerCase().replace(".", "");
        let mime = "image/jpeg";
        if (ext === "png") mime = "image/png";
        else if (ext === "webp") mime = "image/webp";
        else if (ext === "gif") mime = "image/gif";

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": buffer.length.toString(),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // 🚀 파일이 유실되었거나 없는 경우에도 404로 깨지지 않고 기본 OG 이미지 자동 폴백 스트리밍
      try {
        const defaultOgPath = path.join(process.cwd(), "public", "images", "og-default.png");
        if (fs.existsSync(defaultOgPath)) {
          const buffer = fs.readFileSync(defaultOgPath);
          return new NextResponse(buffer, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "public, max-age=3600",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      } catch (_) {}

      return NextResponse.json({ success: false, error: "Image not found" }, { status: 404 });
    }

    // 2. 프로필 및 대표 이미지 정보 JSON 반환
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const userKey = url.searchParams.get("userKey") || url.searchParams.get("u");
    const emailParam = url.searchParams.get("email");
    const typeParam = (url.searchParams.get("type") || "").toLowerCase().trim();
    const isEstimate = typeParam === "estimate";

    let targetEmail = "";
    if (userKey) {
      targetEmail = (await resolveUserEmailFromKey(userKey)) || "";
    } else if (emailParam) {
      targetEmail = emailParam.toLowerCase().trim();
    } else if (sessionEmail) {
      targetEmail = sessionEmail.toLowerCase().trim();
    }

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 또는 사용자 키가 필요합니다." }, { status: 400 });
    }

    let imageUrl = "";
    let businessName = isEstimate ? "스마트 간편 견적 센터" : "스마트 견적 & 주문 센터";

    // 1. sheetbot_settings 조회
    try {
      const settingKeys = isEstimate
        ? [`estimate_profile_${targetEmail}`, `quote_profile_${targetEmail}`]
        : [`quote_profile_${targetEmail}`];

      for (const sKey of settingKeys) {
        const settingRes = await queryTable("sheetbot_settings", {
          filters: { key: sKey },
          limit: 1,
        }).catch(() => ({ rows: [] }));

        if (settingRes.rows && settingRes.rows.length > 0) {
          const val = JSON.parse(settingRes.rows[0].value || "{}");
          if (isEstimate) {
            if (val.estimateImageUrl) imageUrl = val.estimateImageUrl;
            else if (!imageUrl && val.imageUrl) imageUrl = val.imageUrl;
          } else {
            if (val.orderImageUrl) imageUrl = val.orderImageUrl;
            else if (val.ogImageUrl) imageUrl = val.ogImageUrl;
            else if (val.imageUrl) imageUrl = val.imageUrl;
          }
          if (val.businessName && val.businessName.trim()) businessName = val.businessName.trim();
          if (imageUrl) break;
        }
      }
    } catch (_) {}

    // 2. sheetbot_users 조회
    if (!imageUrl || businessName === "스마트 견적 & 주문 센터" || businessName === "스마트 간편 견적 센터") {
      try {
        const userRes = await queryTable("sheetbot_users", {
          filters: { email: targetEmail },
          limit: 1,
        }).catch(() => ({ rows: [] }));

        if (userRes.rows && userRes.rows.length > 0) {
          const u = userRes.rows[0];
          if (!imageUrl) {
            if (isEstimate && u.estimate_image_url) {
              imageUrl = u.estimate_image_url;
            } else if (!isEstimate && u.quote_image_url) {
              imageUrl = u.quote_image_url;
            } else if (u.quote_image_url) {
              imageUrl = u.quote_image_url;
            }
          }
          if (u.business_name && (businessName === "스마트 견적 & 주문 센터" || businessName === "스마트 간편 견적 센터")) {
            businessName = u.business_name.trim();
          }
        }
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      type: isEstimate ? "estimate" : "order",
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
    const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    const contentType = req.headers.get("content-type") || "";
    const url = new URL(req.url);
    const urlType = url.searchParams.get("type") || "";

    let targetEmail = "";
    let buffer: Buffer;
    let fileName = "";
    let ext = "jpg";
    let requestedType = urlType;

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      targetEmail = (body.email || body.userEmail || sessionEmail || headerEmail || "").toLowerCase().trim();
      if (body.type) requestedType = body.type;
      const imageBase64 = body.imageBase64 || body.image || "";
      if (!imageBase64) {
        return NextResponse.json({ success: false, error: "이미지 데이터(base64)가 필요합니다." }, { status: 400 });
      }

      // data:image/png;base64,... 프리픽스 제거
      let cleanBase64 = imageBase64;
      if (cleanBase64.includes(",")) {
        const parts = cleanBase64.split(",");
        cleanBase64 = parts[1];
        if (parts[0].includes("png")) ext = "png";
        else if (parts[0].includes("webp")) ext = "webp";
        else if (parts[0].includes("gif")) ext = "gif";
      }

      buffer = Buffer.from(cleanBase64, "base64");
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const directEmail = (formData.get("email") || formData.get("userEmail")) as string | null;
      const formType = formData.get("type") as string | null;
      if (formType) requestedType = formType;

      targetEmail = (
        directEmail ||
        sessionEmail ||
        headerEmail ||
        ""
      ).toLowerCase().trim();

      if (!file) {
        return NextResponse.json({ success: false, error: "업로드할 이미지 파일이 없습니다." }, { status: 400 });
      }

      const mimeType = file.type || "image/jpeg";
      if (mimeType.includes("png")) ext = "png";
      else if (mimeType.includes("webp")) ext = "webp";
      else if (mimeType.includes("gif")) ext = "gif";
      else if (file.name && file.name.includes(".")) {
        ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    if (!targetEmail) {
      return NextResponse.json({ success: false, error: "이메일 정보가 필요합니다." }, { status: 400 });
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ success: false, error: "유효한 이미지 데이터가 없습니다." }, { status: 400 });
    }

    // 파일 크기 검증 (최대 10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "이미지 파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }

    const isEstimate = requestedType.toLowerCase().trim() === "estimate";
    const prefix = isEstimate ? "estimate" : "quote";
    const safeEmail = targetEmail.replace(/[^a-zA-Z0-9]/g, "_");
    fileName = `${prefix}_${safeEmail}_${Date.now()}.${ext}`;

    // 디렉터리 다중 저장 (프로덕션 런타임 및 개발 소스 폴더 모두 저장)
    const dirs = getUploadDirectories();
    for (const d of dirs) {
      try {
        fs.writeFileSync(path.join(d, fileName), buffer);
      } catch (_) {}
    }

    // 직통 스트리밍 URL 생성 (터널 및 프록시 환경에서도 무결점 서빙)
    const imageUrl = `https://sheetbot.cloud/api/user/quote/image?file=${fileName}`;
    const now = new Date().toISOString();

    // 1. sheetbot_settings 동기화
    let businessName = "";
    try {
      const settingKey = isEstimate ? `estimate_profile_${targetEmail}` : `quote_profile_${targetEmail}`;
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

      if (isEstimate) {
        existingVal.estimateImageUrl = imageUrl;
        existingVal.imageUrl = imageUrl;
      } else {
        existingVal.orderImageUrl = imageUrl;
        existingVal.ogImageUrl = imageUrl;
        existingVal.imageUrl = imageUrl;
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
            description: isEstimate ? `간편견적 프로필 (${targetEmail})` : `주문 프로필 (${targetEmail})`,
            created_at: now,
          },
        ]);
      }

      // 견적 이미지 등록인 경우 기존 quote_profile_${targetEmail}에도 estimateImageUrl 보조 기록
      if (isEstimate) {
        try {
          const qKey = `quote_profile_${targetEmail}`;
          const qRes = await queryTable("sheetbot_settings", {
            filters: { key: qKey },
            limit: 1,
          }).catch(() => ({ rows: [] }));
          if (qRes.rows && qRes.rows.length > 0) {
            const qVal = JSON.parse(qRes.rows[0].value || "{}");
            qVal.estimateImageUrl = imageUrl;
            qVal.updatedAt = now;
            await updateRows("sheetbot_settings", { value: JSON.stringify(qVal), updated_at: now }, { filters: { key: qKey } });
          }
        } catch (_) {}
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

      const userUpdatePayload: any = { updated_at: now };
      if (isEstimate) {
        userUpdatePayload.estimate_image_url = imageUrl;
      } else {
        userUpdatePayload.quote_image_url = imageUrl;
      }

      if (userRes.rows && userRes.rows.length > 0) {
        const u = userRes.rows[0];
        if (!businessName && u.business_name) businessName = u.business_name;
        await updateRows("sheetbot_users", userUpdatePayload, { filters: { email: targetEmail } });
      } else {
        await insertRows("sheetbot_users", [
          {
            id: Math.floor(Date.now() / 1000),
            email: targetEmail,
            name: targetEmail.split("@")[0],
            business_name: businessName,
            quote_image_url: isEstimate ? "" : imageUrl,
            estimate_image_url: isEstimate ? imageUrl : "",
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

    // 3. 구글 스프레드시트 '사업자정보' 탭 독립 동기화 (견적은 ESTIMATE만, 주문은 QUOTE만)
    try {
      const sheetTypes = isEstimate ? (["ESTIMATE"] as const) : (["QUOTE"] as const);
      for (const st of sheetTypes) {
        try {
          const resolved = await resolveUserSpreadsheet({
            userEmail: targetEmail,
            sheetType: st,
            defaultTitle: st === "ESTIMATE" ? "[SheetBot] 스마트 간편 견적 및 단가 대장" : "[SheetBot] 스마트 간편 주문 및 품목 대장",
          });
          if (resolved?.spreadsheetId) {
            const spreadsheetId = resolved.spreadsheetId;
            const bizRes = await callSheetsTool(
              "sheets_get_range",
              {
                spreadsheetId,
                range: "사업자정보!A1:B25",
                preferOAuth: true,
              },
              { preferOAuth: true }
            ).catch(() => null);

            let targetRowIndex = -1;
            if (bizRes?.values && bizRes.values.length > 0) {
              bizRes.values.forEach((row: any[], idx: number) => {
                if (!row || !row[0]) return;
                const k = String(row[0]).trim();
                if (
                  k.includes("카카오톡 미리보기") ||
                  k.includes("대표 이미지") ||
                  k.includes("미리보기") ||
                  k.includes("OG") ||
                  k.includes("썸네일")
                ) {
                  targetRowIndex = idx + 1; // 1-indexed
                }
              });
            }

            if (targetRowIndex > 0) {
              await callSheetsTool(
                "sheets_update_range",
                {
                  spreadsheetId,
                  range: `사업자정보!B${targetRowIndex}`,
                  values: [[imageUrl]],
                  preferOAuth: true,
                },
                { preferOAuth: true }
              ).catch(() => null);
            } else {
              await callSheetsTool(
                "sheets_append_values",
                {
                  spreadsheetId,
                  range: "사업자정보!A:B",
                  values: [["카카오톡 미리보기 사진 URL", imageUrl]],
                  preferOAuth: true,
                },
                { preferOAuth: true }
              ).catch(() => null);
            }
          }
        } catch (_) {}
      }
    } catch (sheetSyncErr: any) {
      console.warn("[QuoteImage POST] Sheet sync warning:", sheetSyncErr?.message);
    }

    // 4. 캐시 즉시 무효화 (해당되는 카탈로그 캐시만 안전하게 초기화)
    if (isEstimate) {
      clearEstimateCatalogCache(targetEmail);
    } else {
      clearCatalogCache(targetEmail);
    }

    return NextResponse.json({
      success: true,
      email: targetEmail,
      type: isEstimate ? "estimate" : "order",
      imageUrl,
      businessName,
      message: `${isEstimate ? "간편견적" : "간편주문"} 대표 미리보기 이미지가 성공적으로 등록되었습니다!`,
    });
  } catch (err: any) {
    console.error("[QuoteImage POST] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
