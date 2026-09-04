export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

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

    // 1. sheetbot_ai_usage_logs에서 데이터 조회 (최대 5,000건)
    const logsRes = await queryTable("sheetbot_ai_usage_logs", {
      orderBy: "id",
      orderDirection: "DESC",
      limit: 5000,
    }).catch(() => ({ rows: [] }));

    const rawRows = logsRes.rows || [];
    const validRows = rawRows.filter((r: any) => !r.deleted_at);

    // 2. 날짜 기준선 계산 (KST 기준)
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayDateOnly = nowKST.toISOString().split("T")[0];

    const weekAgoDate = new Date(nowKST.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekDateOnly = weekAgoDate.toISOString().split("T")[0];

    const monthAgoDate = new Date(nowKST.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthDateOnly = monthAgoDate.toISOString().split("T")[0];

    // 3. 기간 필터링
    const periodFilteredRows = validRows.filter((row: any) => {
      if (range === "all") return true;
      const createdStr = String(row.created_at || "");
      if (!createdStr) return false;
      const datePart = createdStr.split("T")[0].split(" ")[0];

      if (range === "today") return datePart === todayDateOnly;
      if (range === "week") return datePart >= weekDateOnly;
      if (range === "month") return datePart >= monthDateOnly;
      return true;
    });

    // 4. 회원별 필터링 (선택 시)
    const finalFilteredRows = targetUser === "all"
      ? periodFilteredRows
      : periodFilteredRows.filter((r: any) =>
          String(r.user_email || "").toLowerCase() === targetUser.toLowerCase().trim()
        );

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
      const t = Number(row.total_tokens || p + c);
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

    periodFilteredRows.forEach((row: any) => {
      const email = String(row.user_email || "guest").toLowerCase().trim();
      const name = String(row.user_name || "사용자");
      const p = Number(row.prompt_tokens || 0);
      const c = Number(row.completion_tokens || 0);
      const t = Number(row.total_tokens || p + c);
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

    return NextResponse.json({
      success: true,
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
    });
  } catch (error: any) {
    console.error("AI Usage Monitor API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
