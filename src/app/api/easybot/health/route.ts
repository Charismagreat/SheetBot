export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUserEmail } from "@/lib/auth";
import { getAiModelSettings } from "@/lib/ai-settings";
import { listAiCallerModels } from "@/lib/egdesk-helpers";
import { checkTokenBalance } from "@/lib/token-wallet";

// 메모리 캐시 (15초간 헬스체크 결과 재사용하여 불필요한 연속 호출 방지)
let cachedHealth: {
  status: "healthy" | "warning" | "error";
  message: string;
  latencyMs: number;
  model: string;
  isQuotaExceeded: boolean;
  checkedAt: number;
} | null = null;

const CACHE_TTL_MS = 15000;

export async function GET() {
  const userEmail = await getCurrentUserEmail().catch(() => null);

  const now = Date.now();
  let baseHealth = cachedHealth;

  if (!baseHealth || now - baseHealth.checkedAt > CACHE_TTL_MS) {
    const startTime = Date.now();
    try {
      const aiSettings = await getAiModelSettings();
      const targetModel = aiSettings.easybotModel || aiSettings.defaultModel || "gemini-3.5-flash";

      // EGDesk AI Caller 또는 Gemini 모델 메타데이터 실시간 진단 (토큰 소모 없음)
      const modelsResult = await listAiCallerModels().catch((err: any) => {
        throw err;
      });

      const latencyMs = Date.now() - startTime;
      const isAvailable = modelsResult && Array.isArray(modelsResult.models);

      baseHealth = {
        status: isAvailable ? "healthy" : "warning",
        message: isAvailable
          ? `정상 가동 중 (${targetModel})`
          : "AI 응답 지연 (가이드 모드)",
        latencyMs,
        model: targetModel,
        isQuotaExceeded: false,
        checkedAt: now,
      };
      cachedHealth = baseHealth;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errMsg = (err.message || "").toLowerCase();

      let status: "healthy" | "warning" | "error" = "error";
      let message = "AI API 서비스 점검 중";
      let isQuotaExceeded = false;

      if (
        errMsg.includes("429") ||
        errMsg.includes("quota") ||
        errMsg.includes("resource_exhausted") ||
        errMsg.includes("rate limit") ||
        errMsg.includes("exceeded")
      ) {
        status = "error";
        message = "AI API 일일 할당량(한도) 초과";
        isQuotaExceeded = true;
      } else if (errMsg.includes("key") || errMsg.includes("auth") || errMsg.includes("unauthorized")) {
        status = "error";
        message = "AI API 인증 키 설정 점검 필요";
      } else {
        status = "warning";
        message = "일시적 응답 지연 (가이드 모드)";
      }

      baseHealth = {
        status,
        message,
        latencyMs,
        model: "gemini-3.5-flash",
        isQuotaExceeded,
        checkedAt: now,
      };
      cachedHealth = baseHealth;
    }
  }

  // 사용자 토큰 잔액 체크 (로그인된 경우)
  let userBalance = 0;
  let userTokenDepleted = false;

  if (userEmail) {
    try {
      const tokenInfo = await checkTokenBalance(userEmail, 1);
      userBalance = tokenInfo.balance;
      if (tokenInfo.balance <= 0) {
        userTokenDepleted = true;
      }
    } catch {
      // ignore
    }
  }

  // 최종 상태 조합: API가 정상이더라도 사용자의 보유 토큰이 0이면 주의(warning)로 표기
  let finalStatus = baseHealth.status;
  let finalMessage = baseHealth.message;

  if (baseHealth.status === "healthy" && userTokenDepleted) {
    finalStatus = "warning";
    finalMessage = "보유 토큰 소진 (충전 필요)";
  }

  return NextResponse.json(
    {
      success: true,
      status: finalStatus,
      message: finalMessage,
      latencyMs: baseHealth.latencyMs,
      model: baseHealth.model,
      isQuotaExceeded: baseHealth.isQuotaExceeded,
      userBalance,
      userTokenDepleted,
      checkedAt: new Date(baseHealth.checkedAt).toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    }
  );
}
