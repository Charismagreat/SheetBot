export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";

/**
 * 🔔 관리자: 출시알림 예약 & 맞춤 기능 제작 의뢰 대장 API
 * GET /api/admin/feature-requests
 * PATCH /api/admin/feature-requests (상태 및 메모 수정)
 * DELETE /api/admin/feature-requests (소프트 삭제)
 */

export async function GET(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type"); // 'RELEASE_NOTIFY' | 'CUSTOM_FEATURE' | null
    const statusFilter = searchParams.get("status"); // 'PENDING' | 'IN_REVIEW' | 'DEVELOPING' | 'COMPLETED' | null

    const res = await queryTable("sheetbot_feature_requests", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 200,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    if (typeFilter && typeFilter !== "ALL") {
      validRows = validRows.filter((r: any) => r.request_type === typeFilter);
    }

    if (statusFilter && statusFilter !== "ALL") {
      validRows = validRows.filter((r: any) => r.status === statusFilter);
    }

    // 전체 통계 계산 (필터링 전 유효 전체)
    const allValid = (res.rows || []).filter((r: any) => !r.deleted_at);
    const stats = {
      total: allValid.length,
      pending: allValid.filter((r: any) => r.status === "PENDING").length,
      in_review: allValid.filter((r: any) => r.status === "IN_REVIEW").length,
      developing: allValid.filter((r: any) => r.status === "DEVELOPING").length,
      completed: allValid.filter((r: any) => r.status === "COMPLETED").length,
      release_notify: allValid.filter((r: any) => r.request_type === "RELEASE_NOTIFY").length,
      custom_feature: allValid.filter((r: any) => r.request_type === "CUSTOM_FEATURE").length,
    };

    return NextResponse.json({
      success: true,
      requests: validRows,
      stats,
    });
  } catch (err: any) {
    console.error("[Admin-Feature-Requests] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userEmail = await getCurrentUserEmail(req);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, admin_notes } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "수정할 항목 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
      updated_by: userEmail,
    };

    if (status !== undefined) updateData.status = status;
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;

    await updateRows("sheetbot_feature_requests", {
      filters: { id: String(id) },
      updates: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "항목 상태가 성공적으로 변경되었습니다.",
    });
  } catch (err: any) {
    console.error("[Admin-Feature-Requests] PATCH error:", err);
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
      return NextResponse.json({ success: false, error: "삭제할 항목 ID가 필요합니다." }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 소프트 삭제 처리
    await updateRows("sheetbot_feature_requests", {
      filters: { id: String(id) },
      updates: {
        deleted_at: now,
        deleted_by: userEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: "항목이 안전하게 삭제(소프트 삭제)되었습니다.",
    });
  } catch (err: any) {
    console.error("[Admin-Feature-Requests] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
