export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import {
  DynamicCardManifest,
  buildDefaultManifestForCard,
  generateCardSpecWithAi,
  saveDynamicCardManifestBackup,
} from "@/lib/dynamic-card-helper";
import crypto from "crypto";

/**
 * 🛠️ 사용자 & 안티그라비티 전용: '나만의 맞춤 카드(Custom Dynamic Card)' 생성·조회·삭제 API
 *
 * - POST /api/user/cards/custom
 *   1) AI 자연어 설계 모드: { userEmail, prompt, previewOnly? }
 *      -> AI가 카드 제목, 아이콘, 입력폼, 시트 헤더, AI 추출 프롬프트(Manifest)를 자동 설계 후 등록
 *   2) 직접 설계도 등록 모드: { userEmail, key, title, icon, description, manifest }
 *      -> 안티그라비티가 생성한 카드 설계도(JSON)를 해당 사용자 계정에 즉시 배포
 * - GET /api/user/cards/custom?email=...
 *   -> 해당 사용자의 맞춤 카드 목록 조회
 * - DELETE /api/user/cards/custom?key=...&email=...
 *   -> 본인 맞춤 카드 소프트 삭제 (소유자 이메일 검증 필수)
 */

async function resolveRequestEmail(req: NextRequest, bodyEmail?: string | null): Promise<string> {
  const headerEmail = req.headers.get("x-sheetbot-user-email");
  const { searchParams } = new URL(req.url);
  const queryEmail = searchParams.get("email") || searchParams.get("userEmail");

  const candidate = (bodyEmail || headerEmail || queryEmail || "").trim().toLowerCase();
  if (candidate && candidate.includes("@")) {
    return candidate;
  }

  const sessionEmail = await getCurrentUserEmail(req).catch(() => null);
  return (sessionEmail || "").trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const userEmail = await resolveRequestEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "사용자 이메일 인증이 필요합니다." }, { status: 401 });
    }

    const res = await queryTable("sheetbot_marketplace_cards", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    const myCards = (res.rows || []).filter((r: any) => {
      if (r.deleted_at) return false;
      const allowed = String(r.allowed_emails || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isCreator = String(r.updated_by || "").toLowerCase() === userEmail;
      return allowed.includes(userEmail) || isCreator;
    });

    return NextResponse.json({
      success: true,
      cards: myCards,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userEmail = await resolveRequestEmail(req, body.userEmail || body.email);

    // 1. 미리보기 전용 모드 (관리자 CMS 또는 앱 내 AI 설계 미리보기)
    if (body.previewOnly && body.prompt) {
      const designed = await generateCardSpecWithAi({
        prompt: String(body.prompt).trim(),
        userEmail: userEmail || "admin@sheetbot.cloud",
        preferredKey: body.key,
        preferredTitle: body.title,
      });
      return NextResponse.json({
        success: true,
        preview: true,
        card: {
          ...designed,
          manifestJson: JSON.stringify(designed.manifest, null, 2),
        },
      });
    }

    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "나만의 카드를 등록할 사용자 이메일(userEmail)이 필요합니다." },
        { status: 401 }
      );
    }

    let finalKey = (body.key || "").trim();
    let finalTitle = (body.title || "").trim();
    let finalIcon = (body.icon || "⚡").trim();
    let finalCategory = body.category || "exclusive";
    let finalCategoryName = body.category_name || body.categoryName || "나만의 맞춤 카드";
    let finalDescription = (body.description || "").trim();
    let finalBadge = (body.badge || "맞춤").trim();
    let finalManifest: DynamicCardManifest | null = null;

    // 2. 자연어 프롬프트(prompt) 기반 AI 자동 설계
    if (body.prompt && (!finalTitle || !body.manifest)) {
      const designed = await generateCardSpecWithAi({
        prompt: String(body.prompt).trim(),
        userEmail,
        preferredKey: finalKey || undefined,
        preferredTitle: finalTitle || undefined,
      });
      finalKey = finalKey || designed.key;
      finalTitle = finalTitle || designed.title;
      finalIcon = body.icon || designed.icon || "⚡";
      finalDescription = finalDescription || designed.description;
      finalBadge = body.badge || designed.badge || "맞춤";
      finalManifest = designed.manifest;
    }

    if (!finalKey) {
      finalKey = `cardCustom${Date.now().toString().slice(-5)}`;
    }
    if (!finalTitle) {
      return NextResponse.json(
        { success: false, error: "카드 제목(title) 또는 생성 프롬프트(prompt)를 입력해 주세요." },
        { status: 400 }
      );
    }

    // 3. 직접 전달된 manifest 또는 manifest_json 파싱
    if (!finalManifest) {
      if (body.manifest && typeof body.manifest === "object") {
        finalManifest = body.manifest as DynamicCardManifest;
      } else if (body.manifest_json && typeof body.manifest_json === "string") {
        try {
          finalManifest = JSON.parse(body.manifest_json) as DynamicCardManifest;
        } catch {
          finalManifest = null;
        }
      } else if (body.manifestJson && typeof body.manifestJson === "string") {
        try {
          finalManifest = JSON.parse(body.manifestJson) as DynamicCardManifest;
        } catch {
          finalManifest = null;
        }
      }
    }

    if (!finalManifest) {
      finalManifest = buildDefaultManifestForCard(finalKey, finalTitle, finalDescription || finalTitle);
    }

    const manifestJsonStr = JSON.stringify(finalManifest);
    const now = new Date().toISOString();
    const isExclusive = body.isPublic === true ? 0 : 1;
    const allowedEmails = isExclusive ? userEmail : (body.allowed_emails || null);

    // 4. 동일 key가 이미 존재하는 경우 업데이트, 없으면 신규 INSERT
    const existingRes = await queryTable("sheetbot_marketplace_cards", {
      filters: { key: finalKey },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const existingRow = (existingRes.rows || []).find((r: any) => !r.deleted_at);

    const cardRow = {
      key: finalKey,
      title: finalTitle,
      icon: finalIcon,
      category: finalCategory,
      category_name: finalCategoryName,
      description: finalDescription || `${finalTitle} 맞춤 자동화 카드`,
      badge: finalBadge,
      author: body.author || `${userEmail.split("@")[0]} 맞춤`,
      is_exclusive: isExclusive,
      allowed_emails: allowedEmails,
      is_installed_by_default: 0,
      status: "ACTIVE",
      display_order: Number(body.display_order) || 1,
      version: body.version || "1.0.0",
      manifest_json: manifestJsonStr,
      uuid: existingRow?.uuid || crypto.randomUUID(),
      updated_at: now,
      updated_by: userEmail,
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    };

    if (existingRow?.id) {
      await updateRows("sheetbot_marketplace_cards", {
        filters: { id: String(existingRow.id) },
        updates: cardRow,
      });
    } else {
      await insertRows("sheetbot_marketplace_cards", [cardRow]);
    }

    await saveDynamicCardManifestBackup(finalKey, finalManifest, userEmail);

    return NextResponse.json({
      success: true,
      message: `🎉 '${finalTitle}' 카드가 생성되어 회원님의 시트봇 스토어에 즉시 등록되었습니다!`,
      card: {
        key: finalKey,
        title: finalTitle,
        icon: finalIcon,
        category: finalCategory,
        categoryName: finalCategoryName,
        description: cardRow.description,
        badge: finalBadge,
        author: cardRow.author,
        isExclusive: Boolean(isExclusive),
        allowedEmails: allowedEmails ? [userEmail] : undefined,
        isInstalledByDefault: false,
        version: cardRow.version,
        updatedAt: now.split("T")[0],
        manifest: finalManifest,
        manifestJson: manifestJsonStr,
      },
    });
  } catch (err: any) {
    console.error("[User-Custom-Card] POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "맞춤 카드 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userEmail = await resolveRequestEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "사용자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cardKey = searchParams.get("key");
    if (!cardKey) {
      return NextResponse.json({ success: false, error: "삭제할 카드 key가 필요합니다." }, { status: 400 });
    }

    const res = await queryTable("sheetbot_marketplace_cards", {
      filters: { key: cardKey },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    const target = (res.rows || []).find((r: any) => !r.deleted_at);
    if (!target) {
      return NextResponse.json({ success: false, error: "해당 카드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 멀티유저 격리 원칙: 본인 이메일이 허용 목록에 있거나 본인이 생성한 카드만 삭제 허용
    const allowed = String(target.allowed_emails || "")
      .split(",")
      .map((e) => e.trim().toLowerCase());
    const isOwner =
      allowed.includes(userEmail) || String(target.updated_by || "").toLowerCase() === userEmail;

    if (!isOwner) {
      return NextResponse.json({ success: false, error: "본인이 생성한 맞춤 카드만 삭제할 수 있습니다." }, { status: 403 });
    }

    const now = new Date().toISOString();
    await updateRows("sheetbot_marketplace_cards", {
      filters: { id: String(target.id) },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "맞춤 카드가 안전하게 삭제되었습니다.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
