export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";

export interface UserAiStat {
  userEmail: string;
  userName: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  costKrw: number;
  percentage: number;
  lastCalledAt: string;
}

export interface PurposeStat {
  purpose: string;
  caller: string;
  calls: number;
  totalTokens: number;
  costKrw: number;
  percentage: number;
}

export async function GET(request: Request) {
  try {
    await setupDatabase();

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "all"; // 'today', 'week', 'month', 'all'
    const targetUser = searchParams.get("userEmail") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20", 10));

    const queryFilters: Record<string, any> = {};

    if (targetUser !== "all") {
      queryFilters.user_email = targetUser.toLowerCase().trim();
    }

    let startDateLimit: string | null = null;
    if (range === "today") {
      const todayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      startDateLimit = todayStart;
      queryFilters.created_at = `>=${todayStart}`;
    } else if (range === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      startDateLimit = weekAgo;
      queryFilters.created_at = `>=${weekAgo}`;
    } else if (range === "month") {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      startDateLimit = monthAgo;
      queryFilters.created_at = `>=${monthAgo}`;
    }

    // 1. sheetbot_ai_usage_logs에서 데이터 조회 (최대 5,000건)
    let rawRows: any[] = [];
    try {
      const logsRes = await queryTable("sheetbot_ai_usage_logs", {
        filters: queryFilters,
        orderBy: "id",
        orderDirection: "DESC",
        limit: 5000,
      });
      rawRows = logsRes?.rows || [];
    } catch {
      // filters 조건 에러 시 필터 없이 조회하여 메모리에서 필터링
      const fallbackRes = await queryTable("sheetbot_ai_usage_logs", {
        orderBy: "id",
        orderDirection: "DESC",
        limit: 5000,
      }).catch(() => ({ rows: [] }));
      rawRows = fallbackRes?.rows || [];
    }

    const currentUserEmail = await getCurrentUserEmail().catch(() => null);
    const isAdmin = await isCurrentUserAdmin(currentUserEmail);

    let validRows = rawRows.filter((r: any) => !r.deleted_at);

    // 관리자 본인의 조회이거나 'all'인 경우 전체 워크스페이스 통계 표시, 일반 사용자는 본인 및 게스트 내역 매핑
    const isSelfAdminQuery = isAdmin && (targetUser === "all" || (currentUserEmail && targetUser.toLowerCase() === currentUserEmail.toLowerCase()));

    if (!isSelfAdminQuery && targetUser !== "all") {
      const lowerTarget = targetUser.toLowerCase().trim();
      validRows = validRows.filter((r: any) => {
        const email = String(r.user_email || "").toLowerCase().trim();
        return email === lowerTarget || email === "guest";
      });
    }

    if (startDateLimit) {
      validRows = validRows.filter((r: any) => {
        const d = String(r.created_at || "");
        return d >= startDateLimit!;
      });
    }

    const finalFilteredRows = validRows;

    // 5. 전체 요약 지표 계산
    let totalCalls = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalCostKrw = 0;
    const uniqueUsersSet = new Set<string>();

    finalFilteredRows.forEach((row: any) => {
      totalCalls++;
      const p = Number(row.prompt_tokens || 0);
      const c = Number(row.completion_tokens || 0);
      const t = Number(row.total_tokens != null && row.total_tokens !== "" ? row.total_tokens : (p + c));
      const usd = Number(row.estimated_cost_usd || 0);
      const krw = Number(row.estimated_cost_krw || 0);

      totalPromptTokens += p;
      totalCompletionTokens += c;
      totalTokens += t;
      totalCostUsd += usd;
      totalCostKrw += krw;

      if (row.user_email) uniqueUsersSet.add(row.user_email);
    });

    // 6. 회원별(User-by-User) 사용량 집계
    const userMap = new Map<string, {
      userEmail: string;
      userName: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      costKrw: number;
      lastCalledAt: string;
    }>();

    finalFilteredRows.forEach((row: any) => {
      const email = String(row.user_email || "guest").toLowerCase().trim();
      const name = String(row.user_name || "사용자");
      const p = Number(row.prompt_tokens || 0);
      const c = Number(row.completion_tokens || 0);
      const t = Number(row.total_tokens != null && row.total_tokens !== "" ? row.total_tokens : (p + c));
      const usd = Number(row.estimated_cost_usd || 0);
      const krw = Number(row.estimated_cost_krw || 0);
      const date = String(row.created_at || "");

      const prev = userMap.get(email) || {
        userEmail: email,
        userName: name,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costKrw: 0,
        lastCalledAt: "",
      };

      userMap.set(email, {
        userEmail: email,
        userName: name !== "사용자" ? name : prev.userName,
        calls: prev.calls + 1,
        promptTokens: prev.promptTokens + p,
        completionTokens: prev.completionTokens + c,
        totalTokens: prev.totalTokens + t,
        costUsd: prev.costUsd + usd,
        costKrw: prev.costKrw + krw,
        lastCalledAt: !prev.lastCalledAt || date > prev.lastCalledAt ? date : prev.lastCalledAt,
      });
    });

    const periodTotalKrw = Array.from(userMap.values()).reduce((sum, u) => sum + u.costKrw, 0);

    const userStats: UserAiStat[] = Array.from(userMap.values())
      .map((u) => ({
        ...u,
        costUsd: Math.round(u.costUsd * 1000) / 1000,
        costKrw: Math.round(u.costKrw),
        percentage: periodTotalKrw > 0 ? Math.round((u.costKrw / periodTotalKrw) * 100) : 0,
      }))
      .sort((a, b) => b.costKrw - a.costKrw);

    // 7. 목적별(Purpose) 집계
    const purposeMap = new Map<string, { calls: number; tokens: number; costKrw: number; caller: string }>();
    finalFilteredRows.forEach((row: any) => {
      const pName = String(row.purpose || "기타 호출");
      const caller = String(row.caller || "unknown");
      const t = Number(row.total_tokens || 0);
      const krw = Number(row.estimated_cost_krw || 0);

      const prev = purposeMap.get(pName) || { calls: 0, tokens: 0, costKrw: 0, caller };
      purposeMap.set(pName, {
        calls: prev.calls + 1,
        tokens: prev.tokens + t,
        costKrw: prev.costKrw + krw,
        caller: caller,
      });
    });

    const purposeStats: PurposeStat[] = Array.from(purposeMap.entries()).map(([purpose, val]) => ({
      purpose,
      caller: val.caller,
      calls: val.calls,
      totalTokens: val.tokens,
      costKrw: Math.round(val.costKrw),
      percentage: totalCostKrw > 0 ? Math.round((val.costKrw / totalCostKrw) * 100) : 0,
    })).sort((a, b) => b.costKrw - a.costKrw);

    // 8. 모델별(Model) 집계
    const modelMap = new Map<string, { calls: number; tokens: number }>();
    finalFilteredRows.forEach((row: any) => {
      const m = String(row.model || "gemini-2.0-flash");
      const t = Number(row.total_tokens || 0);
      const prev = modelMap.get(m) || { calls: 0, tokens: 0 };
      modelMap.set(m, { calls: prev.calls + 1, tokens: prev.tokens + t });
    });

    const modelStats = Array.from(modelMap.entries()).map(([model, val]) => ({
      model,
      calls: val.calls,
      tokens: val.tokens,
    })).sort((a, b) => b.calls - a.calls);

    // 9. 페이징된 상세 로그 목록
    const offset = (page - 1) * limit;
    const paginatedLogs = finalFilteredRows.slice(offset, offset + limit);

    return NextResponse.json(
      {
        success: true,
        isAdmin,
        range,
        targetUser,
        summary: {
          totalCalls,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          totalCostUsd: Math.round(totalCostUsd * 1000) / 1000,
          totalCostKrw: Math.round(totalCostKrw),
          activeUsersCount: uniqueUsersSet.size,
        },
        userStats,
        purposeStats,
        modelStats,
        recentLogs: paginatedLogs,
        pagination: {
          page,
          limit,
          total: finalFilteredRows.length,
          totalPages: Math.ceil(finalFilteredRows.length / limit),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (error: any) {
    console.error("AI Usage Monitor API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
