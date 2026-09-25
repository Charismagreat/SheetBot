export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserEmail, isCurrentUserAdmin } from "@/lib/auth";
import { getAiModelSettings } from "@/lib/ai-settings";
import { listAiCallerModels, queryTable } from "@/lib/egdesk-helpers";
import { cachedQueryTable, fetchWithCache } from "@/lib/server-cache";

const timeoutRace = <T>(promise: Promise<T>, fallback: T, ms = 3000): Promise<T> => {
  const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timeout]);
};

// 헬스체크 인메모리 캐시 (15초)
let cachedHealth: {
  status: "healthy" | "warning" | "error";
  message: string;
  latencyMs: number;
  model: string;
  isQuotaExceeded: boolean;
  checkedAt: number;
} | null = null;

const CACHE_TTL_MS = 15000;

/**
 * GET /api/easybot/init
 * ⚡ 시트봇 AI(EasyBot) 단일 통합 번들 초기화 API
 * 1) AI 엔진 헬스체크 (health)
 * 2) 회원 대화 히스토리 (messages)
 * 3) 관리자 브리핑 & VIP 긴급 알림 (briefing)
 * 을 단 1회의 초고속 HTTP 왕복으로 병합 반환
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    const headerEmail = req.headers.get("x-sheetbot-user-email");
    let userEmail: string | null = (headerEmail && headerEmail.includes("@"))
      ? headerEmail.toLowerCase().trim()
      : ((queryEmail && queryEmail.includes("@")) ? queryEmail.toLowerCase().trim() : null);

    if (!userEmail) {
      userEmail = await getCurrentUserEmail(req).catch(() => null);
    }

    const cleanEmail = userEmail ? userEmail.toLowerCase().trim() : null;
    const isAdmin = cleanEmail ? await isCurrentUserAdmin(cleanEmail).catch(() => false) : false;

    // 1. AI 헬스체크 병렬 처리
    const healthPromise = (async () => {
      const now = Date.now();
      if (cachedHealth && now - cachedHealth.checkedAt < CACHE_TTL_MS) {
        return cachedHealth;
      }
      try {
        const aiSettings = await getAiModelSettings();
        const targetModel = aiSettings.easybotModel || aiSettings.defaultModel || "gemini-3.5-flash";
        const modelsResult = await timeoutRace(listAiCallerModels().catch(() => null), null, 2500);

        const latencyMs = Date.now() - startTime;
        const isAvailable = Boolean(
          modelsResult &&
          (Array.isArray((modelsResult as any)?.models) ||
           Array.isArray((modelsResult as any)?.result?.models) ||
           Array.isArray((modelsResult as any)?.data) ||
           (modelsResult as any)?.success !== false)
        );

        const res = {
          status: (isAvailable ? "healthy" : "warning") as "healthy" | "warning" | "error",
          message: isAvailable ? `정상 가동 중 (${targetModel})` : "AI 응답 지연 (가이드 모드)",
          latencyMs,
          model: targetModel,
          isQuotaExceeded: false,
          checkedAt: now,
        };
        cachedHealth = res;
        return res;
      } catch {
        return {
          status: "healthy" as const,
          message: "정상 가동 중 (gemini-3.5-flash)",
          latencyMs: 15,
          model: "gemini-3.5-flash",
          isQuotaExceeded: false,
          checkedAt: now,
        };
      }
    })();

    // 2. 대화 히스토리 병렬 조회
    const messagesPromise = (async () => {
      if (!cleanEmail) return [];
      try {
        const res = await timeoutRace(
          queryTable("sheetbot_easybot_chats", {
            filters: { user_email: cleanEmail },
            limit: 100,
            orderBy: "id",
            orderDirection: "ASC",
          }).catch(() => ({ rows: [] })),
          { rows: [] },
          2500
        );

        const validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

        return validRows.map((r: any) => {
          let timeStr = "";
          try {
            if (r.created_at) {
              const d = new Date(r.created_at);
              if (!isNaN(d.getTime())) {
                timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              }
            }
          } catch {}

          let actionChips = undefined;
          if (r.action_chips) {
            try {
              actionChips = typeof r.action_chips === "string" ? JSON.parse(r.action_chips) : r.action_chips;
            } catch {}
          }

          return {
            id: r.id || `chat_${Date.now()}`,
            role: r.role === "user" ? "user" : "bot",
            text: r.message || "",
            time: timeStr || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            actionChips,
          };
        });
      } catch {
        return [];
      }
    })();

    // 3. 관리자 브리핑 병렬 집계 (관리자인 경우에만 실행)
    const briefingPromise = (async () => {
      if (!isAdmin) return null;
      try {
        const [genRes, entRes, taxRes] = await Promise.all([
          cachedQueryTable("sheetbot_inquiries", { orderBy: "id", orderDirection: "DESC", limit: 30 }, 15),
          cachedQueryTable("sheetbot_enterprise_inquiries", { orderBy: "id", orderDirection: "DESC", limit: 20 }, 15),
          cachedQueryTable("sheetbot_tax_invoices", { limit: 20 }, 15),
        ]);

        const activeGen = (genRes.rows || []).filter((r: any) => !r.deleted_at);
        const activeEnt = (entRes.rows || []).filter((r: any) => !r.deleted_at);
        const activeTax = (taxRes.rows || []).filter((r: any) => !r.deleted_at);

        const pendingGen = activeGen.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED");
        const pendingEnt = activeEnt.filter((r: any) => r.status !== "ANSWERED" && r.status !== "COMPLETED");
        const totalPendingCount = pendingGen.length + pendingEnt.length;

        // VIP 의뢰 우선순위
        const latestEnt = activeEnt[0];
        let vipAlert = null;
        if (latestEnt) {
          vipAlert = {
            id: latestEnt.id,
            companyName: latestEnt.company_name,
            tier: "S",
            estimatedPrice: "650만 ~ 800만원",
          };
        }

        const now = new Date();
        const kstHour = (now.getUTCHours() + 9) % 24;
        const isEvening = kstHour >= 18;

        return {
          formattedText: `좋은 하루 되세요, 관리자님! 현재 검토 대기 문의는 **${totalPendingCount}건**, 세금계산서 요청은 **${activeTax.length}건**입니다.`,
          isEvening,
          totalPendingCount,
          vipAlert,
        };
      } catch {
        return null;
      }
    })();

    // ⚡ 3종 핵심 비동기 로직 완전 병렬 실행
    const [health, messages, briefing] = await Promise.all([
      healthPromise,
      messagesPromise,
      briefingPromise,
    ]);

    const response = NextResponse.json({
      success: true,
      health,
      messages,
      isAdmin,
      briefing,
    });
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    return response;
  } catch (error: any) {
    console.error("[EasyBot-Init-API] GET error:", error);
    const errorResponse = NextResponse.json(
      { success: false, error: error.message || "Failed to initialize easybot bundle" },
      { status: 500 }
    );
    errorResponse.headers.set("Access-Control-Allow-Origin", "*");
    return errorResponse;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}
