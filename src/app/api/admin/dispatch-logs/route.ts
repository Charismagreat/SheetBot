export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getDispatchLogs, softDeleteDispatchLog } from "@/lib/dispatch-logger";
import { setupDatabase } from "@/lib/setup-db";

/**
 * 발송 이력 목록 및 집계 통계 조회
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel") || "ALL";
    const status = searchParams.get("status") || "ALL";
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const allLogs = await getDispatchLogs({ channel, status, limit: 300 });

    // 검색어 필터링
    let filteredLogs = allLogs;
    if (search) {
      filteredLogs = allLogs.filter((log) => {
        const textToSearch = `${log.recipient} ${log.title || ""} ${log.rule_name || ""} ${log.content || ""} ${log.event_type}`.toLowerCase();
        return textToSearch.includes(search);
      });
    }

    // 통계 계산
    const stats = {
      total: allLogs.length,
      smsTotal: allLogs.filter((l) => l.channel === "SMS").length,
      smsSuccess: allLogs.filter((l) => l.channel === "SMS" && l.status === "SUCCESS").length,
      smsFailed: allLogs.filter((l) => l.channel === "SMS" && l.status === "FAILED").length,
      emailTotal: allLogs.filter((l) => l.channel === "EMAIL").length,
      emailSuccess: allLogs.filter((l) => l.channel === "EMAIL" && l.status === "SUCCESS").length,
      emailFailed: allLogs.filter((l) => l.channel === "EMAIL" && l.status === "FAILED").length,
    };

    return NextResponse.json({
      success: true,
      logs: filteredLogs,
      stats,
    });
  } catch (err: any) {
    console.error("[DispatchLogs API GET] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * 특정 발송 이력 소프트 삭제
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const adminEmail = await getCurrentUserEmail();
    if (!adminEmail) {
      return NextResponse.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "삭제할 로그 ID가 지정되지 않았습니다." }, { status: 400 });
    }

    const success = await softDeleteDispatchLog(id, adminEmail);
    if (!success) {
      return NextResponse.json({ success: false, error: "로그 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "발송 이력이 안전하게 삭제되었습니다." });
  } catch (err: any) {
    console.error("[DispatchLogs API DELETE] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
