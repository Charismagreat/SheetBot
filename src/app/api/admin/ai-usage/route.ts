export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable, aggregateTable } from "@/lib/egdesk-helpers";
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
    const currentUserEmail = await getCurrentUserEmail().catch(() => null);
    const isAdmin = await isCurrentUserAdmin(currentUserEmail);

    const baseFilters: Record<string, any> = { ...queryFilters, deleted_at: null };
    if (!isAdmin && targetUser !== 'all') {
      const lowerTarget = targetUser.toLowerCase().trim();
      // Non-admin users can only see their own or guest data
      baseFilters.user_email = lowerTarget;
    }
    // Date range filter is already in queryFilters.created_at

    const offset = (page - 1) * limit;

    // Fetch total count for pagination
        const totalRes = await queryTable('sheetbot_ai_usage_logs', {
      filters: baseFilters,
      limit: 1, // Just need the total count, not the rows
    }).catch(() => ({ total: 0 }));
    const totalLogs = totalRes.total || 0;

    // Fetch paginated recent logs
    const recentLogsRes = await queryTable('sheetbot_ai_usage_logs', {
      filters: baseFilters,
      orderBy: 'id',
      orderDirection: 'DESC',
      offset,
      limit,
    }).catch(() => ({ rows: [] }));
    const paginatedLogs = recentLogsRes.rows || [];

    // Fetch summary data
    const [
      totalCallsRes,
      totalPromptTokensRes,
      totalCompletionTokensRes,
      totalTokensRes,
      totalCostUsdRes,
      totalCostKrwRes,
      uniqueUsersRes,
    ] = await Promise.all([
      aggregateTable('sheetbot_ai_usage_logs', 'id', 'COUNT', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      aggregateTable('sheetbot_ai_usage_logs', 'prompt_tokens', 'SUM', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      aggregateTable('sheetbot_ai_usage_logs', 'completion_tokens', 'SUM', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      aggregateTable('sheetbot_ai_usage_logs', 'total_tokens', 'SUM', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      aggregateTable('sheetbot_ai_usage_logs', 'estimated_cost_usd', 'SUM', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      aggregateTable('sheetbot_ai_usage_logs', 'estimated_cost_krw', 'SUM', { filters: baseFilters }).catch(() => ({ aggregate: 0 })),
      queryTable('sheetbot_ai_usage_logs', { select: ['user_email'], filters: baseFilters, groupBy: 'user_email', limit: 1000 }).catch(() => ({ rows: [] })), // Max 1000 unique users
    ]);

    const totalCalls = totalCallsRes.aggregate || 0;
    const totalPromptTokens = totalPromptTokensRes.aggregate || 0;
    const totalCompletionTokens = totalCompletionTokensRes.aggregate || 0;
    const totalTokens = totalTokensRes.aggregate || 0;
    const totalCostUsd = totalCostUsdRes.aggregate || 0;
    const totalCostKrw = totalCostKrwRes.aggregate || 0;
    const activeUsersCount = (uniqueUsersRes.rows || []).length;

    // Fetch user-by-user stats
    const [
      userCallsRes,
      userTokensRes,
      userCostKrwRes,
      userLastCalledAtRes,
      userNamesRes, // To get user_name for each user_email
    ] = await Promise.all([
      aggregateTable('sheetbot_ai_usage_logs', 'id', 'COUNT', { filters: baseFilters, groupBy: 'user_email' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'total_tokens', 'SUM', { filters: baseFilters, groupBy: 'user_email' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'estimated_cost_krw', 'SUM', { filters: baseFilters, groupBy: 'user_email' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'created_at', 'MAX', { filters: baseFilters, groupBy: 'user_email' }).catch(() => ({ rows: [] })),
      queryTable('sheetbot_ai_usage_logs', { select: ['user_email', 'user_name'], filters: baseFilters, groupBy: 'user_email', limit: 1000 }).catch(() => ({ rows: [] })),
    ]);

    const userMap = new Map<string, UserAiStat>();
    const userNamesMap = new Map<string, string>();
    (userNamesRes.rows || []).forEach((row: any) => {
      if (row.user_email && row.user_name) {
        userNamesMap.set(String(row.user_email).toLowerCase().trim(), String(row.user_name));
      }
    });

    (userCallsRes.rows || []).forEach((row: any) => {
      const email = String(row.group_by).toLowerCase().trim();
      const userName = userNamesMap.get(email) || '사용자';
      userMap.set(email, {
        userEmail: email,
        userName,
        calls: Number(row.aggregate),
        promptTokens: 0, // Will be filled by other aggregations
        completionTokens: 0, // Will be filled by other aggregations
        totalTokens: 0,
        costUsd: 0,
        costKrw: 0,
        percentage: 0,
        lastCalledAt: '',
      });
    });

    (userTokensRes.rows || []).forEach((row: any) => {
      const email = String(row.group_by).toLowerCase().trim();
      const userStat = userMap.get(email);
      if (userStat) {
        userStat.totalTokens = Number(row.aggregate);
      }
    });

    (userCostKrwRes.rows || []).forEach((row: any) => {
      const email = String(row.group_by).toLowerCase().trim();
      const userStat = userMap.get(email);
      if (userStat) {
        userStat.costKrw = Number(row.aggregate);
      }
    });

    (userLastCalledAtRes.rows || []).forEach((row: any) => {
      const email = String(row.group_by).toLowerCase().trim();
      const userStat = userMap.get(email);
      if (userStat) {
        userStat.lastCalledAt = String(row.aggregate);
      }
    });

    const periodTotalKrw = Array.from(userMap.values()).reduce((sum, u) => sum + u.costKrw, 0);

    const userStats: UserAiStat[] = Array.from(userMap.values())
      .map((u) => ({
        ...u,
        costUsd: Math.round((u.costUsd || 0) * 1000) / 1000, // No direct USD aggregate, so just keep existing calculation
        costKrw: Math.round(u.costKrw),
        percentage: periodTotalKrw > 0 ? Math.round((u.costKrw / periodTotalKrw) * 100) : 0,
      }))
      .sort((a, b) => b.costKrw - a.costKrw);

    // Fetch purpose-by-purpose stats
    const [
      purposeCallsRes,
      purposeTokensRes,
      purposeCostKrwRes,
    ] = await Promise.all([
      aggregateTable('sheetbot_ai_usage_logs', 'id', 'COUNT', { filters: baseFilters, groupBy: 'purpose' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'total_tokens', 'SUM', { filters: baseFilters, groupBy: 'purpose' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'estimated_cost_krw', 'SUM', { filters: baseFilters, groupBy: 'purpose' }).catch(() => ({ rows: [] })),
    ]);

    const purposeMap = new Map<string, { calls: number; tokens: number; costKrw: number; caller: string }>();
    (purposeCallsRes.rows || []).forEach((row: any) => {
      const purpose = String(row.group_by || '기타 호출');
      purposeMap.set(purpose, {
        calls: Number(row.aggregate),
        tokens: 0,
        costKrw: 0,
        caller: 'unknown', // Caller cannot be aggregated, will remain unknown
      });
    });
    (purposeTokensRes.rows || []).forEach((row: any) => {
      const purpose = String(row.group_by || '기타 호출');
      const stat = purposeMap.get(purpose);
      if (stat) stat.tokens = Number(row.aggregate);
    });
    (purposeCostKrwRes.rows || []).forEach((row: any) => {
      const purpose = String(row.group_by || '기타 호출');
      const stat = purposeMap.get(purpose);
      if (stat) stat.costKrw = Number(row.aggregate);
    });
    // For caller, we'd need another query or assume a default, keeping "unknown" for now
    const purposeStats: PurposeStat[] = Array.from(purposeMap.entries()).map(([purpose, val]) => ({
      purpose,
      caller: val.caller,
      calls: val.calls,
      totalTokens: val.tokens,
      costKrw: Math.round(val.costKrw),
      percentage: totalCostKrw > 0 ? Math.round((val.costKrw / totalCostKrw) * 100) : 0,
    })).sort((a, b) => b.costKrw - a.costKrw);

    // Fetch model-by-model stats
    const [
      modelCallsRes,
      modelTokensRes,
    ] = await Promise.all([
      aggregateTable('sheetbot_ai_usage_logs', 'id', 'COUNT', { filters: baseFilters, groupBy: 'model' }).catch(() => ({ rows: [] })),
      aggregateTable('sheetbot_ai_usage_logs', 'total_tokens', 'SUM', { filters: baseFilters, groupBy: 'model' }).catch(() => ({ rows: [] })),
    ]);

    const modelMap = new Map<string, { calls: number; tokens: number }>();
    (modelCallsRes.rows || []).forEach((row: any) => {
      const model = String(row.group_by || 'gemini-2.0-flash');
      modelMap.set(model, { calls: Number(row.aggregate), tokens: 0 });
    });
    (modelTokensRes.rows || []).forEach((row: any) => {
      const model = String(row.group_by || 'gemini-2.0-flash');
      const stat = modelMap.get(model);
      if (stat) stat.tokens = Number(row.aggregate);
    });

    const modelStats = Array.from(modelMap.entries()).map(([model, val]) => ({
      model,
      calls: val.calls,
      tokens: val.tokens,
    })).sort((a, b) => b.calls - a.calls);

    return NextResponse.json(
      {
        success: true,
        isAdmin,
        range,
        targetUser,
        summary: {
          totalCalls,
          totalPromptTokens: Math.round(totalPromptTokens),
          totalCompletionTokens: Math.round(totalCompletionTokens),
          totalTokens: Math.round(totalTokens),
          totalCostUsd: Math.round(totalCostUsd * 1000) / 1000,
          totalCostKrw: Math.round(totalCostKrw),
          activeUsersCount,
        },
        userStats,
        purposeStats,
        modelStats,
        recentLogs: paginatedLogs,
        pagination: {
          page,
          limit,
          total: totalLogs,
          totalPages: Math.ceil(totalLogs / limit),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error: any) {
    console.error("AI Usage Monitor API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
