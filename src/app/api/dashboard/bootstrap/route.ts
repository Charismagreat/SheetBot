export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { queryTable } from "@/lib/egdesk-helpers";

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
    scriptCode: "", // 대시보드 경량화
    manifest: "", // 대시보드 경량화
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
 * OPTIONS /api/dashboard/bootstrap
 * 브라우저 CORS 프리플라이트 대응
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-email, x-admin-key",
    },
  });
}

/**
 * GET /api/dashboard/bootstrap
 * ⚡ 대시보드 전체 데이터를 서버 내부에서 초고속 수집하여 단 1회의 HTTP 왕복으로 반환
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const url = new URL(request.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    let userEmail: string | null = (queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : null;

    if (!userEmail) {
      userEmail = await getCurrentUserEmail(request).catch(() => null);
    }

    if (!userEmail) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const cleanEmail = userEmail.toLowerCase().trim();

    // ⚡ 각 쿼리에 4초 타임아웃 레이스를 두어 터널 락/무한 행을 물리적으로 원천 차단
    const timeoutRace = <T>(promise: Promise<T>, fallback: T, ms = 4000): Promise<T> => {
      const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
      return Promise.race([promise, timeout]);
    };

    // 대시보드 필수 쿼리 완전 병렬 실행 (최대 4초 가드)
    const [
      projectsRes,
      walletRes,
      schedulesRes,
      devicesRes,
      settingsRes,
      usageRes,
    ] = await Promise.all([
      // 1. 프로젝트 전체 (최신순 100건)
      timeoutRace(
        queryTable("sheetbot_projects", {
          filters: { user_email: cleanEmail },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 100,
        }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),

      // 2. 실제 보유 지갑 잔액 직접 쿼리 (가짜 20,000 토큰 오인식 원천 차단)
      timeoutRace(
        queryTable("sheetbot_user_wallets", {
          filters: { user_email: cleanEmail },
          limit: 10,
        }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),

      // 3. 스케줄 대장
      timeoutRace(
        queryTable("sheetbot_schedules", {
          filters: { user_email: cleanEmail },
          orderBy: "id",
          orderDirection: "DESC",
          limit: 50,
        }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),

      // 4. 연동 디바이스
      timeoutRace(
        queryTable("sheetbot_user_devices", {
          filters: { user_email: cleanEmail },
          limit: 50,
        }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),

      // 5. 시스템 설정
      timeoutRace(
        queryTable("sheetbot_settings", { limit: 1 }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),

      // 6. 당월 AI 사용량 요약 (실제 My DB 테이블명: sheetbot_ai_usage_logs)
      timeoutRace(
        queryTable("sheetbot_ai_usage_logs", {
          filters: { user_email: cleanEmail },
          limit: 100,
        }).catch(() => ({ rows: [] })),
        { rows: [] }
      ),
    ]);

    // A. 활성 프로젝트 vs 휴지통 프로젝트 분류
    const allProjectRows = projectsRes.rows || [];
    const activeProjects: any[] = [];
    const trashedProjects: any[] = [];
    let trashedCount = 0;

    for (const r of allProjectRows) {
      const isDeleted = Boolean(r.deleted_at) || r.status === "PENDING_DELETE" || r.status === "TRASHED";
      if (isDeleted) {
        trashedCount++;
        trashedProjects.push(mapLightProject(r));
      } else {
        activeProjects.push(mapLightProject(r));
      }
    }

    // B. 지갑 잔액 정확한 계산 (실제 보유 잔액 249만 토큰 우선 반환)
    const validWalletRows = (walletRes.rows || []).filter((r: any) => !r.deleted_at);
    let resolvedWallet = {
      id: `wallet_${cleanEmail}`,
      userEmail: cleanEmail,
      balanceTokens: 20000,
      totalPurchasedTokens: 0,
      totalUsedTokens: 0,
      tier: "FREE",
    };

    if (validWalletRows.length > 0) {
      // 잔액이 가장 크고 유효한 레코드 선택 (PRO 우선)
      validWalletRows.sort((a: any, b: any) => {
        const balA = Number(a.balance_tokens) || 0;
        const balB = Number(b.balance_tokens) || 0;
        if (balB !== balA) return balB - balA;
        if (a.tier === "PRO" && b.tier !== "PRO") return -1;
        if (b.tier === "PRO" && a.tier !== "PRO") return 1;
        return 0;
      });

      const mainW = validWalletRows[0];
      resolvedWallet = {
        id: mainW.id || `wallet_${cleanEmail}`,
        userEmail: cleanEmail,
        balanceTokens: Number(mainW.balance_tokens ?? 20000),
        totalPurchasedTokens: Number(mainW.total_purchased_tokens || 0),
        totalUsedTokens: Number(mainW.total_used_tokens || 0),
        tier: mainW.tier || "FREE",
      };
    }

    // C. 스케줄 분류
    const validSchedules = (schedulesRes.rows || []).filter((r: any) => !r.deleted_at);

    // D. 디바이스 분류 (이용자용 에이전트 agent2 / agent 기기만 집계)
    const validDevices = (devicesRes.rows || []).filter(
      (r: any) => !r.deleted_at && (r.pairing_mode === "agent2" || r.pairing_mode === "agent")
    );

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
        trashedProjects,
        trashedCount,
        wallet: resolvedWallet,
        schedules: validSchedules,
        devicesCount: validDevices.length,
        rulesCount: 0,
        currentModel: defaultModel,
        aiUsage: {
          totalTokens,
          totalCalls,
          totalCostKrw,
        },
      },
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
      }
    });
  } catch (err: any) {
    console.error("[Dashboard-Bootstrap] Error:", err);
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to load dashboard bootstrap data",
      data: {
        projects: [],
        trashedCount: 0,
        wallet: { balanceTokens: 20000, tier: "FREE" },
        schedules: [],
        devicesCount: 0,
        rulesCount: 0,
        currentModel: "Gemini 3.8 Flash",
        aiUsage: { totalTokens: 0, totalCalls: 0, totalCostKrw: 0 },
      },
    }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}
