export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows } from "@/lib/egdesk-helpers";
import crypto from "crypto";

/**
 * 🛍️ 관리자: 시트봇 카드 마켓플레이스 CMS API
 * GET /api/admin/cards (전체 카드 목록 조회)
 * POST /api/admin/cards (신규 카드 등록)
 * PUT /api/admin/cards (기존 카드 수정)
 * DELETE /api/admin/cards (소프트 삭제)
 */

export async function GET(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const categoryFilter = searchParams.get("category");
    const statusFilter = searchParams.get("status");

    const res = await queryTable("sheetbot_marketplace_cards", {
      orderBy: "display_order",
      orderDirection: "ASC",
      limit: 200,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    if (categoryFilter && categoryFilter !== "all") {
      validRows = validRows.filter((r: any) => r.category === categoryFilter);
    }

    if (statusFilter && statusFilter !== "ALL") {
      validRows = validRows.filter((r: any) => r.status === statusFilter);
    }

    const allValid = (res.rows || []).filter((r: any) => !r.deleted_at);
    const stats = {
      total: allValid.length,
      active: allValid.filter((r: any) => r.status === "ACTIVE").length,
      upcoming: allValid.filter((r: any) => r.status === "UPCOMING").length,
      inactive: allValid.filter((r: any) => r.status === "INACTIVE").length,
      exclusive: allValid.filter((r: any) => Boolean(r.is_exclusive)).length,
    };

    return NextResponse.json({
      success: true,
      cards: validRows,
      stats,
    });
  } catch (err: any) {
    console.error("[Admin-Cards-CMS] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const {
      key,
      title,
      icon,
      category,
      category_name,
      description,
      badge,
      author,
      is_exclusive,
      allowed_emails,
      is_installed_by_default,
      status,
      display_order,
      version,
    } = body;

    if (!key || !title) {
      return NextResponse.json({ success: false, error: "카드 고유키(key)와 제목(title)은 필수입니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newCard = {
      key: key.trim(),
      title: title.trim(),
      icon: (icon || "⚡").trim(),
      category: category || "ai",
      category_name: category_name || (category === "store" ? "매장 · 정산" : category === "crm" ? "고객 · 영업" : category === "exclusive" ? "나만의 맞춤 카드" : "AI 자동화"),
      description: (description || "").trim(),
      badge: badge ? badge.trim() : null,
      author: author ? author.trim() : "시트봇 공식",
      is_exclusive: is_exclusive ? 1 : 0,
      allowed_emails: allowed_emails ? (Array.isArray(allowed_emails) ? allowed_emails.join(",") : allowed_emails.trim()) : null,
      is_installed_by_default: is_installed_by_default ? 1 : 0,
      status: status || "ACTIVE",
      display_order: Number(display_order) || 10,
      version: version ? version.trim() : "1.0.0",
      uuid: crypto.randomUUID(),
      updated_at: now,
      updated_by: userEmail,
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    };

    await insertRows("sheetbot_marketplace_cards", [newCard]);

    return NextResponse.json({
      success: true,
      message: "새 마켓플레이스 카드가 성공적으로 등록되었습니다.",
      card: newCard,
    });
  } catch (err: any) {
    console.error("[Admin-Cards-CMS] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "수정할 카드 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const patchData: Record<string, any> = {
      updated_at: now,
      updated_by: userEmail,
    };

    if (updateFields.key !== undefined) patchData.key = updateFields.key.trim();
    if (updateFields.title !== undefined) patchData.title = updateFields.title.trim();
    if (updateFields.icon !== undefined) patchData.icon = updateFields.icon.trim();
    if (updateFields.category !== undefined) patchData.category = updateFields.category;
    if (updateFields.category_name !== undefined) patchData.category_name = updateFields.category_name;
    if (updateFields.description !== undefined) patchData.description = updateFields.description;
    if (updateFields.badge !== undefined) patchData.badge = updateFields.badge;
    if (updateFields.author !== undefined) patchData.author = updateFields.author;
    if (updateFields.is_exclusive !== undefined) patchData.is_exclusive = updateFields.is_exclusive ? 1 : 0;
    if (updateFields.allowed_emails !== undefined) {
      patchData.allowed_emails = Array.isArray(updateFields.allowed_emails)
        ? updateFields.allowed_emails.join(",")
        : updateFields.allowed_emails;
    }
    if (updateFields.is_installed_by_default !== undefined) {
      patchData.is_installed_by_default = updateFields.is_installed_by_default ? 1 : 0;
    }
    if (updateFields.status !== undefined) patchData.status = updateFields.status;
    if (updateFields.display_order !== undefined) patchData.display_order = Number(updateFields.display_order) || 0;
    if (updateFields.version !== undefined) patchData.version = updateFields.version;

    await updateRows("sheetbot_marketplace_cards", {
      filters: { id: String(id) },
      updates: patchData,
    });

    return NextResponse.json({
      success: true,
      message: "카드 정보가 성공적으로 수정되었습니다.",
    });
  } catch (err: any) {
    console.error("[Admin-Cards-CMS] PUT error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 카드 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 소프트 삭제 처리
    await updateRows("sheetbot_marketplace_cards", {
      filters: { id: String(id) },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "카드가 안전하게 삭제(소프트 삭제)되었습니다.",
    });
  } catch (err: any) {
    console.error("[Admin-Cards-CMS] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
