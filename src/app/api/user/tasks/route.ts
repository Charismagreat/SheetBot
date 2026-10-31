export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, callUserDataTool, callSheetsTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { realtimeHub } from "@/lib/realtime-hub";
import { getKoreanTimeString } from "@/lib/date-utils";
import {
  createTaskItem,
  checkOrderDelayTasks,
  resolveUserTaskSpreadsheet,
} from "@/lib/task-hub-helper";

/**
 * GET /api/user/tasks
 * 로그인 사용자의 스마트 통합 할 일 목록 조회 + 간편 주문 지연 자동 감지 동기화
 */
export async function GET(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req).catch(() => null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 1. 간편 주문 지연(24h 미입금 / 48h 미출고) 자동 동기화 (Zero-Block 백그라운드)
    void checkOrderDelayTasks(cleanEmail).catch((e: any) =>
      console.warn("[TaskHub API] checkOrderDelayTasks warning:", e.message)
    );

    // 2. 쿼리 파라미터 파싱
    const { searchParams } = new URL(req.url);
    const statusFilter = (searchParams.get("status") || "ALL").toUpperCase(); // PENDING, DONE, URGENT, ALL
    const sourceFilter = (searchParams.get("source") || "ALL").toUpperCase(); // CALL_RECORDING, MISSED_CALL, ORDER_DELAY 등

    const baseFilters: Record<string, any> = {
      user_email: cleanEmail,
    };
    if (sourceFilter && sourceFilter !== "ALL") {
      baseFilters.source_type = sourceFilter;
    }

    const res = await queryTable("sheetbot_tasks", {
      filters: baseFilters,
      limit: 500,
      orderBy: "id",
      orderDirection: "DESC",
    }).catch(() => ({ rows: [] }));

    // 3. 소프트 삭제 필터링, 더미 항목 제거 및 (source_type + source_id + title) 기준 중복 제거
    const activeRows = (res.rows || []).filter((r: any) => {
      if (r.deleted_at) return false;
      const t = String(r.title || "").trim();
      if (!t || /^\[후속\s*조치\s*\d*\]$/i.test(t) || t.startsWith("(없음")) return false;
      return true;
    });

    const dedupMap = new Map<string, any>();
    for (const row of activeRows) {
      const key = `${row.source_type || ""}::${row.source_id || row.id}::${String(row.title || "").trim()}`;
      const existing = dedupMap.get(key);
      if (!existing) {
        dedupMap.set(key, row);
      } else if (row.status === "DONE" && existing.status !== "DONE") {
        // 동일 과업 중복 레코드 중 하나라도 완료 처리되었다면 DONE 상태를 우선 보존
        dedupMap.set(key, row);
      }
    }

    const allDedupedTasks = Array.from(dedupMap.values());
    const pendingCount = allDedupedTasks.filter((t: any) => t.status === "PENDING").length;
    const doneCount = allDedupedTasks.filter((t: any) => t.status === "DONE").length;
    const urgentCount = allDedupedTasks.filter(
      (t: any) =>
        t.status === "PENDING" &&
        (String(t.priority || "").includes("URGENT") ||
          String(t.priority || "").includes("HIGH") ||
          String(t.priority || "").includes("긴급") ||
          String(t.priority || "").includes("높음"))
    ).length;

    const tasks = allDedupedTasks.filter((t: any) => {
      if (statusFilter === "PENDING") return t.status === "PENDING";
      if (statusFilter === "DONE") return t.status === "DONE";
      if (statusFilter === "URGENT") {
        return (
          t.status === "PENDING" &&
          (String(t.priority || "").includes("URGENT") ||
            String(t.priority || "").includes("HIGH") ||
            String(t.priority || "").includes("긴급") ||
            String(t.priority || "").includes("높음"))
        );
      }
      return true;
    });

    // 마스터 스프레드시트 ID 확인
    const spreadsheetId = await resolveUserTaskSpreadsheet(cleanEmail).catch(() => null);

    return NextResponse.json({
      success: true,
      tasks,
      totalCount: allDedupedTasks.length,
      pendingCount,
      doneCount,
      urgentCount,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
        : null,
    });
  } catch (err: any) {
    console.error("[TaskHub API] GET error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/user/tasks
 * 웹 대시보드에서 수동으로 신규 할 일 등록
 */
export async function POST(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req).catch(() => null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const { title, description, contactName, contactPhone, dueDate, priority, badgeText } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: "할 일 제목을 입력해주세요." }, { status: 400 });
    }

    const result = await createTaskItem({
      userEmail: cleanEmail,
      title: title.trim(),
      description: description?.trim() || undefined,
      sourceType: "SMS", // 수동 등록은 일반 업무
      contactName: contactName?.trim() || undefined,
      contactPhone: contactPhone?.trim() || undefined,
      dueDate: dueDate || undefined,
      priority: priority || "NORMAL ⚪",
      badgeText: badgeText || "수동 등록",
    });

    return NextResponse.json({
      success: result.success,
      taskId: result.taskId,
      message: "할 일이 성공적으로 등록되었습니다.",
    });
  } catch (err: any) {
    console.error("[TaskHub API] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/user/tasks
 * 할 일 완료 여부(DONE / PENDING) 상태 토글
 */
export async function PATCH(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req).catch(() => null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const body = await req.json().catch(() => ({}));
    const { taskId, status } = body;

    if (!taskId) {
      return NextResponse.json({ success: false, error: "taskId가 필요합니다." }, { status: 400 });
    }

    const nextStatus = status === "DONE" ? "DONE" : "PENDING";
    const nowStr = getKoreanTimeString();
    const updatesPayload = {
      status: nextStatus,
      completed_at: nextStatus === "DONE" ? nowStr : null,
      completed_by: nextStatus === "DONE" ? cleanEmail : null,
      updated_at: nowStr,
      updated_by: cleanEmail,
    };

    // 대상 할 일 조회 후 id(문자열/숫자 호환) 및 동일 (source_id, title) 중복 건 일괄 동기화
    const targetRes = await queryTable("sheetbot_tasks", {
      filters: { id: String(taskId), user_email: cleanEmail },
      limit: 5,
    }).catch(() => ({ rows: [] }));

    await callUserDataTool("user_data_update_rows", {
      tableName: "sheetbot_tasks",
      filters: { id: String(taskId), user_email: cleanEmail },
      updates: updatesPayload,
    });

    const targetRow = targetRes.rows?.[0];
    if (targetRow?.source_id && targetRow?.title) {
      await callUserDataTool("user_data_update_rows", {
        tableName: "sheetbot_tasks",
        filters: {
          user_email: cleanEmail,
          source_id: String(targetRow.source_id),
          title: String(targetRow.title),
        },
        updates: updatesPayload,
      }).catch(() => {});
    }

    realtimeHub.notifyTableChanged("sheetbot_tasks");

    return NextResponse.json({
      success: true,
      taskId,
      status: nextStatus,
      completedAt: nextStatus === "DONE" ? nowStr : null,
    });
  } catch (err: any) {
    console.error("[TaskHub API] PATCH error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/user/tasks
 * 할 일 소프트 삭제 (deleted_at 및 deleted_by 기록)
 */
export async function DELETE(req: NextRequest) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail(req).catch(() => null);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();
    const { searchParams } = new URL(req.url);
    const taskIdStr = searchParams.get("taskId");

    if (!taskIdStr) {
      return NextResponse.json({ success: false, error: "taskId가 필요합니다." }, { status: 400 });
    }

    const taskId = Number(taskIdStr);
    const nowStr = getKoreanTimeString();

    await callUserDataTool("user_data_update_rows", {
      tableName: "sheetbot_tasks",
      filters: { id: taskId, user_email: cleanEmail },
      updates: {
        deleted_at: nowStr,
        deleted_by: cleanEmail,
      },
    });

    realtimeHub.notifyTableChanged("sheetbot_tasks");

    return NextResponse.json({
      success: true,
      message: "할 일이 안전하게 삭제되었습니다.",
    });
  } catch (err: any) {
    console.error("[TaskHub API] DELETE error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
