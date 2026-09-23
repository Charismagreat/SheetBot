export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, updateRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

/**
 * POST /api/wallet/agent/unlink
 * 스마트폰 앱에서 [연동 해제] 버튼 클릭 시 서버 기기 상태를 'DISCONNECTED'로 즉시 전환
 */
export async function POST(req: NextRequest) {
  try {
    setupDatabase().catch(() => {});
    const body = await req.json().catch(() => ({}));
    const { userEmail, deviceModel } = body;

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "userEmail이 필요합니다." }, { status: 400 });
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);

    // 해당 유저의 기기 중 일치하는 모델명 또는 최신 android_agent 기기 탐색
    const allDevs = await queryTable("sheetbot_user_devices", {
      filters: { user_email: cleanEmail, pairing_mode: "android_agent" },
      orderBy: "id",
      orderDirection: "DESC",
      limit: 10,
    }).catch(() => ({ rows: [] }));

    const matchingDev = (allDevs.rows || []).find(
      (r: any) => !r.deleted_at && deviceModel && r.label && r.label.includes(deviceModel)
    ) || (allDevs.rows || []).find((r: any) => !r.deleted_at);

    if (matchingDev) {
      await updateRows(
        "sheetbot_user_devices",
        {
          status: "DISCONNECTED",
          updated_at: nowStr,
        },
        { filters: { id: matchingDev.id } }
      );

      return NextResponse.json({
        success: true,
        message: "에이전트 연동이 즉시 해제되었습니다.",
        deviceId: matchingDev.id,
        status: "DISCONNECTED",
      });
    }

    return NextResponse.json({
      success: true,
      message: "연동 해제 처리 완료 (기기 정보 없음)",
    });
  } catch (err: any) {
    console.error("[Agent-Unlink] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
