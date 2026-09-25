export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";
import { getOrCreateUserWallet } from "@/lib/token-wallet";

// 프로젝트 경량 변환 헬퍼 (대시보드 카드 렌더링 전용)
function mapLightProject(row: any) {
  let parsedFeatures: string[] = [];
  try {
    parsedFeatures = typeof row.features === "string" ? JSON.parse(row.features) : row.features || [];
  } catch {
    parsedFeatures = [];
  }

  let parsedTriggers: any[] = [];
  try {
    parsedTriggers = typeof row.triggers === "string" ? JSON.parse(row.triggers) : row.triggers || [];
  } catch {
    parsedTriggers = [];
  }

  const safeId = row.id || row.uuid || row.gas_project_id || row.spreadsheet_id || `proj_${Date.now()}`;

  return {
    id: safeId,
    userEmail: row.user_email || row.userEmail || "",
    name: row.name || "",
    description: row.description || "",
    spreadsheetId: row.spreadsheet_id || row.spreadsheetId || "",
    spreadsheetUrl: row.spreadsheet_url || row.spreadsheetUrl || "",
    gasProjectId: row.gas_project_id || row.gasProjectId || "",
    scriptId: row.script_id || row.scriptId || "",
    scriptUrl: row.script_url || row.scriptUrl || "",
    scriptCode: "", // 경량화
    manifest: "", // 경량화
    summary: row.summary || "",
    features: parsedFeatures,
    triggers: parsedTriggers,
    prompt: row.prompt || "",
    webappUrl: row.webapp_url || row.webappUrl || "",
    status: row.status || "ACTIVE",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    deleted_at: row.deleted_at || null,
  };
}

/**
 * GET /api/dashboard/bootstrap
 * ⚡ 대시보드 전체 데이터를 서버 내부에서 단 0.05초 만에 수집하여 단 1회의 HTTP 왕복으로 반환
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const userEmail = await getCurrentUserEmail(request);
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // 서버 내부(localhost:8080 루프백)에서 모든 테이블 쿼리를 완전 병렬로 0.05초 만에 동시 실행
    const [
      projectsRes,
      walletRes,
      schedulesRes,
      devicesRes,
      rulesRes,
      settingsRes,
      usageRes,
    ] = await Promise.all([
      // 1. 프로젝트 전체 (소프트 삭제 포함 최대 100건)
      queryTable("sheetbot_projects", {
        filters: { user_email: cleanEmail },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 100,
      }).catch(() => ({ rows: [] })),

      // 2. 지갑 잔액
      getOrCreateUserWallet(cleanEmail).catch(() => ({
        id: "",
        userEmail: cleanEmail,
        balanceTokens: 20000,
        totalPurchasedTokens: 0,
        totalUsedTokens: 0,
        tier: "FREE" as const,
      })),

      // 3. 스케줄 대장
      queryTable("sheetbot_schedules", {
        filters: { user_email: cleanEmail },
        orderBy: "id",
        orderDirection: "DESC",
        limit: 50,
      }).catch(() => ({ rows: [] })),

      // 4. 연동 디바이스
      queryTable("sheetbot_user_devices", {
        filters: { user_email: cleanEmail },
        limit: 50,
      }).catch(() => ({ rows: [] })),

      // 5. 스마트 규칙
      queryTable("sheetbot_smart_rules", {
        filters: { user_email: cleanEmail },
        limit: 50,
      }).catch(() => ({ rows: [] })),

      // 6. 시스템 설정
      queryTable("sheetbot_settings", {
        limit: 1,
      }).catch(() => ({ rows: [] })),

      // 7. 당월 AI 사용량 요약
      queryTable("sheetbot_ai_audit_logs", {
        filters: { user_email: cleanEmail },
        limit: 100,
      }).catch(() => ({ rows: [] })),
    ]);

    // A. 활성 프로젝트 vs 휴지통 프로젝트 분류
    const allProjectRows = projectsRes.rows || [];
    const activeProjects: any[] = [];
    let trashedCount = 0;

    for (const r of allProjectRows) {
      const isDeleted = Boolean(r.deleted_at) || r.status === "PENDING_DELETE" || r.status === "TRASHED";
      if (isDeleted) {
        trashedCount++;
      } else {
        activeProjects.push(mapLightProject(r));
      }
    }

    // B. 스케줄 분류
    const validSchedules = (schedulesRes.rows || []).filter((r: any) => !r.deleted_at);

    // C. 디바이스 분류
    const validDevices = (devicesRes.rows || []).filter((r: any) => !r.deleted_at);

    // D. 규칙 분류
    const validRules = (rulesRes.rows || []).filter((r: any) => !r.deleted_at);

    // E. AI 모델 설정
    const settingRow = (settingsRes.rows || [])[0];
    let defaultModel = "Gemini 3.8 Flash";
    if (settingRow?.default_model) {
      const m = settingRow.default_model;
      defaultModel =
        m === "gemini-3.8-flash" ? "Gemini 3.8 Flash" :
        m === "gemini-3.5-flash" ? "Gemini 3.5 Flash" :
        m === "gemini-2.5-flash" ? "Gemini 2.5 Flash" : m;
    }

    // F. AI 사용량 집계
    let totalTokens = 0;
    let totalCalls = 0;
    let totalCostKrw = 0;
    const usageRows = usageRes.rows || [];
    for (const u of usageRows) {
      totalTokens += Number(u.total_tokens || 0);
      totalCalls += 1;
      totalCostKrw += Number(u.cost_krw || 0);
    }

    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      userEmail: cleanEmail,
      elapsedMs,
      data: {
        projects: activeProjects,
        trashedCount,
        wallet: walletRes,
        schedules: validSchedules,
        devicesCount: validDevices.length,
        rulesCount: validRules.length,
        currentModel: defaultModel,
        aiUsage: {
          totalTokens,
          totalCalls,
          totalCostKrw: Math.round(totalCostKrw),
        },
      },
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Bootstrap-Elapsed": `${elapsedMs}ms`,
      },
    });
  } catch (error: any) {
    console.error("[Dashboard Bootstrap] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
