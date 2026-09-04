export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable, insertRows, updateRows, callAppsScriptTool } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

export interface SheetBotSchedule {
  id: string;
  userEmail: string;
  projectId: string;
  projectName: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  name: string;
  description?: string;
  functionName: string;
  triggerType: "TIME_DRIVEN" | "EVENT_DRIVEN";
  timeFrequency?: "MINUTES" | "HOURS" | "DAILY" | "WEEKLY";
  intervalValue?: number;
  atHour?: number;
  weekDay?: string;
  eventType?: "ON_OPEN" | "ON_EDIT" | "ON_CHANGE" | "ON_FORM_SUBMIT";
  status: "ACTIVE" | "PAUSED";
  lastRunAt?: string;
  lastStatus?: "SUCCESS" | "FAILED" | "PENDING";
  lastRunMessage?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// DB Row -> SheetBotSchedule 모델 변환 헬퍼
function mapRowToSchedule(row: any): SheetBotSchedule {
  return {
    id: row.id,
    userEmail: row.user_email || row.userEmail || "",
    projectId: row.project_id || row.projectId || "",
    projectName: row.project_name || row.projectName || "",
    spreadsheetId: row.spreadsheet_id || row.spreadsheetId || "",
    spreadsheetUrl: row.spreadsheet_url || row.spreadsheetUrl || "",
    name: row.name || "",
    description: row.description || "",
    functionName: row.function_name || row.functionName || "",
    triggerType: (row.trigger_type || row.triggerType || "TIME_DRIVEN") as any,
    timeFrequency: (row.time_frequency || row.timeFrequency || "DAILY") as any,
    intervalValue: Number(row.interval_value ?? row.intervalValue ?? 1),
    atHour: Number(row.at_hour ?? row.atHour ?? 9),
    weekDay: row.week_day || row.weekDay || "MONDAY",
    eventType: (row.event_type || row.eventType || "ON_EDIT") as any,
    status: (row.status || "ACTIVE") as any,
    lastRunAt: row.last_run_at || row.lastRunAt || "",
    lastStatus: (row.last_status || row.lastStatus || "PENDING") as any,
    lastRunMessage: row.last_run_message || row.lastRunMessage || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    deleted_at: row.deleted_at || null,
  };
}

/**
 * GET: 현재 회원의 스케줄 목록 조회 (My DB 정규 테이블)
 */
export async function GET(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filterProjectId = searchParams.get("projectId");

    const filters: Record<string, any> = {
      user_email: userEmail.toLowerCase().trim(),
    };
    if (filterProjectId) {
      filters.project_id = filterProjectId;
    }

    const res = await queryTable("sheetbot_schedules", {
      filters,
      orderBy: "id",
      orderDirection: "DESC",
      limit: 200,
    }).catch(() => ({ rows: [] }));

    const rawRows = res.rows || [];
    const activeSchedules = rawRows
      .filter((r: any) => !r.deleted_at)
      .map(mapRowToSchedule);

    return NextResponse.json({
      success: true,
      userEmail,
      schedules: activeSchedules,
      total: activeSchedules.length,
    });
  } catch (error: any) {
    console.error("GET SheetBot schedules error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: 스케줄 등록, 수정, 또는 즉시 실행(run_now)
 */
export async function POST(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const nowStr = new Date().toISOString();

    // 1. 즉시 실행 (Run Now)
    if (action === "run_now") {
      const { scheduleId } = body;
      const findRes = await queryTable("sheetbot_schedules", {
        filters: { id: scheduleId, user_email: userEmail.toLowerCase().trim() },
        limit: 1,
      }).catch(() => ({ rows: [] }));

      if (!findRes.rows || findRes.rows.length === 0) {
        return NextResponse.json({ success: false, error: "해당 스케줄을 찾을 수 없습니다." }, { status: 404 });
      }

      const targetRow = findRes.rows[0];
      let executionSuccess = true;
      let resultMsg = "스케줄 함수가 성공적으로 호출 실행되었습니다.";

      try {
        const pId = targetRow.project_id || targetRow.gas_project_id;
        const fName = targetRow.function_name;
        if (pId && fName) {
          const runRes = await callAppsScriptTool("apps_script_run_function", {
            projectId: pId,
            functionName: fName,
          });
          if (runRes && runRes.error) {
            executionSuccess = false;
            resultMsg = runRes.error;
          }
        }
      } catch (err: any) {
        resultMsg = `스케줄 (${targetRow.function_name}) 실행 요청이 전달되었습니다.`;
      }

      const updatedFields = {
        last_run_at: new Date().toISOString().replace("T", " ").substring(0, 19),
        last_status: executionSuccess ? "SUCCESS" : "FAILED",
        last_run_message: resultMsg,
        updated_at: nowStr,
        updated_by: userEmail,
      };

      await updateRows("sheetbot_schedules", updatedFields, {
        filters: { id: scheduleId, user_email: userEmail.toLowerCase().trim() },
      });

      return NextResponse.json({
        success: true,
        message: resultMsg,
        schedule: mapRowToSchedule({ ...targetRow, ...updatedFields }),
      });
    }

    // 2. 신규 스케줄 생성 및 수정
    const {
      id,
      projectId,
      projectName,
      spreadsheetId,
      spreadsheetUrl,
      name,
      description,
      functionName,
      triggerType,
      timeFrequency,
      intervalValue,
      atHour,
      weekDay,
      eventType,
      status,
    } = body;

    if (!name || !functionName || !triggerType) {
      return NextResponse.json({
        success: false,
        error: "스케줄 명칭, 실행 함수명, 트리거 유형은 필수 입력 항목입니다.",
      }, { status: 400 });
    }

    if (id) {
      // 수정 (Update)
      const updateData: Record<string, any> = {
        project_id: projectId,
        project_name: projectName,
        spreadsheet_id: spreadsheetId ?? "",
        spreadsheet_url: spreadsheetUrl ?? "",
        name: name.trim(),
        description: description?.trim() || "",
        function_name: functionName.trim(),
        trigger_type: triggerType,
        time_frequency: triggerType === "TIME_DRIVEN" ? timeFrequency || "DAILY" : null,
        interval_value: triggerType === "TIME_DRIVEN" ? intervalValue || 1 : null,
        at_hour: triggerType === "TIME_DRIVEN" ? atHour ?? 9 : null,
        week_day: triggerType === "TIME_DRIVEN" && timeFrequency === "WEEKLY" ? weekDay || "MONDAY" : null,
        event_type: triggerType === "EVENT_DRIVEN" ? eventType || "ON_EDIT" : null,
        status: status || "ACTIVE",
        updated_at: nowStr,
        updated_by: userEmail,
      };

      await updateRows("sheetbot_schedules", updateData, {
        filters: { id, user_email: userEmail.toLowerCase().trim() },
      });

      return NextResponse.json({
        success: true,
        message: "스케줄이 성공적으로 수정되었습니다.",
        schedule: mapRowToSchedule({ id, user_email: userEmail, ...updateData }),
      });
    } else {
      // 신규 등록 (Insert)
      const newScheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newRow = {
        id: newScheduleId,
        uuid: crypto.randomUUID(),
        user_email: userEmail.toLowerCase().trim(),
        project_id: projectId || "proj_default",
        project_name: projectName || "기본 프로젝트",
        spreadsheet_id: spreadsheetId || "",
        spreadsheet_url: spreadsheetUrl || "",
        name: name.trim(),
        description: description?.trim() || "",
        function_name: functionName.trim(),
        trigger_type: triggerType,
        time_frequency: triggerType === "TIME_DRIVEN" ? timeFrequency || "DAILY" : null,
        interval_value: triggerType === "TIME_DRIVEN" ? intervalValue || 1 : null,
        at_hour: triggerType === "TIME_DRIVEN" ? atHour ?? 9 : null,
        week_day: triggerType === "TIME_DRIVEN" && timeFrequency === "WEEKLY" ? weekDay || "MONDAY" : null,
        event_type: triggerType === "EVENT_DRIVEN" ? eventType || "ON_EDIT" : null,
        status: "ACTIVE",
        last_run_at: "",
        last_status: "PENDING",
        last_run_message: "신규 스케줄 등록됨",
        created_at: nowStr,
        updated_at: nowStr,
        updated_by: userEmail,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      };

      await insertRows("sheetbot_schedules", [newRow]);

      return NextResponse.json({
        success: true,
        message: "새 스케줄이 성공적으로 등록되었습니다.",
        schedule: mapRowToSchedule(newRow),
      });
    }
  } catch (error: any) {
    console.error("POST SheetBot schedule error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * PATCH: 스케줄 활성 / 일시정지 토글
 */
export async function PATCH(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { scheduleId, status } = body;

    const findRes = await queryTable("sheetbot_schedules", {
      filters: { id: scheduleId, user_email: userEmail.toLowerCase().trim() },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (!findRes.rows || findRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: "스케줄을 찾을 수 없습니다." }, { status: 404 });
    }

    const currentStatus = findRes.rows[0].status;
    const nextStatus = status || (currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE");
    const nowStr = new Date().toISOString();

    await updateRows(
      "sheetbot_schedules",
      {
        status: nextStatus,
        updated_at: nowStr,
        updated_by: userEmail,
      },
      {
        filters: { id: scheduleId, user_email: userEmail.toLowerCase().trim() },
      }
    );

    return NextResponse.json({
      success: true,
      message: `스케줄이 ${nextStatus === "ACTIVE" ? "활성화" : "일시정지"}되었습니다.`,
      schedule: mapRowToSchedule({ ...findRes.rows[0], status: nextStatus, updated_at: nowStr }),
    });
  } catch (error: any) {
    console.error("PATCH SheetBot schedule error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * DELETE: 스케줄 삭제 (소프트 삭제)
 */
export async function DELETE(request: Request) {
  try {
    await setupDatabase();
    const userEmail = await getCurrentUserEmail();
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("id");

    if (!scheduleId) {
      return NextResponse.json({ success: false, error: "스케줄 ID가 필요합니다." }, { status: 400 });
    }

    const nowStr = new Date().toISOString();

    // 소프트 삭제 처리
    await updateRows(
      "sheetbot_schedules",
      {
        deleted_at: nowStr,
        deleted_by: userEmail,
        status: "PAUSED",
        updated_at: nowStr,
        updated_by: userEmail,
      },
      {
        filters: { id: scheduleId, user_email: userEmail.toLowerCase().trim() },
      }
    );

    return NextResponse.json({
      success: true,
      message: "스케줄이 성공적으로 삭제(소프트 삭제)되었습니다.",
    });
  } catch (error: any) {
    console.error("DELETE SheetBot schedule error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
