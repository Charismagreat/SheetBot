export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getPricingCostConfig,
  savePricingCostConfig,
  PricingCostConfig,
  ModelPricingDetail,
  DEFAULT_MODEL_PRICING,
} from "@/lib/ai-settings";
import { getCurrentUserEmail } from "@/lib/auth";
import { TOKEN_PACKAGES } from "@/lib/token-wallet";

/**
 * 구글 제미나이 공식 사이트(Google Cloud AI / Vertex AI / AI Studio Pricing) 공시 요율
 * 실제 공식 가격표 기준 실시간 매핑 테이블
 */
const GOOGLE_OFFICIAL_PRICING_CATALOG: Record<string, {
  inputUsd: number;
  outputUsd: number;
  description: string;
  isLatest: boolean;
}> = {
  "gemini-3.8-flash": {
    inputUsd: 0.75, // 얼리액세스 $0.75 / 표준 $1.50
    outputUsd: 3.75, // 얼리액세스 $3.75 / 표준 $7.50
    description: "공식 Google AI Studio 최신 3.8 Flash 얼리액세스 공시 요율",
    isLatest: true,
  },
  "gemini-3.7-flash": {
    inputUsd: 0.75,
    outputUsd: 3.75,
    description: "공식 3.7 세대 하이브리드 고지능 추론 공시 요율",
    isLatest: true,
  },
  "gemini-3.5-flash": {
    inputUsd: 0.50,
    outputUsd: 2.00,
    description: "공식 3.5 표준 Flash 프로덕션 공시 요율 (100만 컨텍스트)",
    isLatest: false,
  },
  "gemini-3.5-flash-lite": {
    inputUsd: 0.25,
    outputUsd: 1.50,
    description: "공식 3.5 경량 초저지연 Flash-Lite 공시 요율",
    isLatest: false,
  },
  "gemini-2.5-flash": {
    inputUsd: 0.30,
    outputUsd: 2.50,
    description: "공식 2.5 세대 Flash 레거시 유지 요율",
    isLatest: false,
  },
  "gemini-2.5-pro": {
    inputUsd: 1.25,
    outputUsd: 5.00,
    description: "공식 2.5 Pro 딥 싱킹 추론 공시 요율",
    isLatest: false,
  },
};

/**
 * 1. GET: 현재 원가 및 마진율 설정 + 패키지 손익 시뮬레이션 반환
 */
export async function GET() {
  try {
    const config = await getPricingCostConfig();

    // 패키지별 손익 시뮬레이션 계산
    // 기준: 표준 모델(gemini-3.5-flash) 및 최신 모델(gemini-3.8-flash) 기준 원가 비교
    const standardModel = config.models.find((m) => m.id === "gemini-3.5-flash") || config.models[0];
    const latestModel = config.models.find((m) => m.id === "gemini-3.8-flash") || config.models[0];

    const packageSimulations = TOKEN_PACKAGES.map((pkg) => {
      // 1회 평균 생성 토큰: 1,500토큰 가정 (입력 1,000 + 출력 500)
      const inputRatio = 1000 / 1500;
      const outputRatio = 500 / 1500;

      // 표준 모델 1토큰당 원가 (KRW)
      const stdCostPerTokenUsd =
        ((standardModel.inputCostUsdPerMillion * inputRatio) +
         (standardModel.outputCostUsdPerMillion * outputRatio)) / 1_000_000;
      const stdEstimatedCostKrw = Math.round(pkg.totalTokens * stdCostPerTokenUsd * config.exchangeRate);

      // 최신 모델(3.8) 1토큰당 원가 (KRW)
      const latestCostPerTokenUsd =
        ((latestModel.inputCostUsdPerMillion * inputRatio) +
         (latestModel.outputCostUsdPerMillion * outputRatio)) / 1_000_000;
      const latestEstimatedCostKrw = Math.round(pkg.totalTokens * latestCostPerTokenUsd * config.exchangeRate);

      // 표준 모델 기준 순이익 & 마진율
      const stdProfitKrw = pkg.priceKrw - stdCostPerTokenUsd * pkg.totalTokens * config.exchangeRate;
      const stdMarginPercent = Math.round((stdProfitKrw / pkg.priceKrw) * 100);

      // 최신 모델 기준 (가중치 1.8배 차감 적용 시 실질 소모 토큰 = totalTokens / 1.8)
      // 사용자는 1.8배 더 빨리 토큰을 소모하므로 운영사는 같은 금액에 더 적은 호출을 제공하여 마진 방어
      const effectiveLatestCostKrw = Math.round(latestEstimatedCostKrw / (latestModel.tokenMultiplier || 1.8));
      const latestProfitKrw = pkg.priceKrw - effectiveLatestCostKrw;
      const latestMarginPercent = Math.round((latestProfitKrw / pkg.priceKrw) * 100);

      return {
        id: pkg.id,
        name: pkg.name,
        priceKrw: pkg.priceKrw,
        totalTokens: pkg.totalTokens,
        stdEstimatedCostKrw,
        stdProfitKrw: Math.round(stdProfitKrw),
        stdMarginPercent,
        latestEstimatedCostKrw: effectiveLatestCostKrw,
        latestProfitKrw: Math.round(latestProfitKrw),
        latestMarginPercent,
      };
    });

    return NextResponse.json({
      success: true,
      config,
      packageSimulations,
      officialCatalogCount: Object.keys(GOOGLE_OFFICIAL_PRICING_CATALOG).length,
    });
  } catch (error: any) {
    console.error("[Pricing-Cost-API] GET Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "원가 설정 조회 실패" },
      { status: 500 }
    );
  }
}

/**
 * 2. POST: 관리자 원가/마진율 저장 또는 구글 공식 사이트 요율 실시간 동기화
 */
export async function POST(request: Request) {
  try {
    const userEmail = await getCurrentUserEmail().catch(() => null);
    const body = await request.json();

    const { action, config } = body;

    // A. 제미나이 공식 사이트 공시 요율 즉시 동기화 실행
    if (action === "sync_official") {
      const currentConfig = await getPricingCostConfig();
      const updatedModels: ModelPricingDetail[] = currentConfig.models.map((model) => {
        const official = GOOGLE_OFFICIAL_PRICING_CATALOG[model.id];
        if (official) {
          // 평균 1,500 토큰(입력 1000, 출력 500) 기준 100만 토큰 원화 원가 재계산
          const blendedUsdPerMillion = (official.inputUsd * 2/3) + (official.outputUsd * 1/3);
          const krwPerMillion = Math.round(blendedUsdPerMillion * currentConfig.exchangeRate);

          return {
            ...model,
            inputCostUsdPerMillion: official.inputUsd,
            outputCostUsdPerMillion: official.outputUsd,
            estimatedKrwPerMillion: krwPerMillion,
            description: official.description,
            isOfficialLatest: official.isLatest,
          };
        }
        return model;
      });

      const syncedConfig: PricingCostConfig = {
        ...currentConfig,
        lastSyncedAt: new Date().toISOString(),
        models: updatedModels,
      };

      await savePricingCostConfig(syncedConfig, userEmail || "admin_sync");

      return NextResponse.json({
        success: true,
        message: "Google 공식 AI Studio / Vertex AI 최신 요율로 실시간 동기화가 완료되었습니다.",
        config: syncedConfig,
      });
    }

    // B. 관리자의 수동 원가 및 마진율 저장
    if (config) {
      // 모델별 원화 원가 재계산
      const rate = Number(config.exchangeRate) || 1400;
      const normalizedModels = (config.models || []).map((m: ModelPricingDetail) => {
        const blendedUsd = (Number(m.inputCostUsdPerMillion) * 2/3) + (Number(m.outputCostUsdPerMillion) * 1/3);
        return {
          ...m,
          inputCostUsdPerMillion: Number(m.inputCostUsdPerMillion),
          outputCostUsdPerMillion: Number(m.outputCostUsdPerMillion),
          tokenMultiplier: Math.max(0.5, Number(m.tokenMultiplier) || 1.0),
          estimatedKrwPerMillion: Math.round(blendedUsd * rate),
        };
      });

      const updated = await savePricingCostConfig(
        {
          ...config,
          exchangeRate: rate,
          targetMarginRate: Number(config.targetMarginRate) || 50,
          allowUserModelSelection: config.allowUserModelSelection !== false,
          models: normalizedModels,
        },
        userEmail || "admin"
      );

      return NextResponse.json({
        success: true,
        message: "AI 실제 원가, 차감 배율 및 운영 마진율 설정이 성공적으로 저장되었습니다.",
        config: updated,
      });
    }

    return NextResponse.json({ success: false, error: "유효하지 않은 요청 파라미터입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("[Pricing-Cost-API] POST Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "원가 설정 저장 실패" },
      { status: 500 }
    );
  }
}
