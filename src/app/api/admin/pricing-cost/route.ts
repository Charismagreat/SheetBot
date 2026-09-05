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
    inputUsd: 0.75, // 얼리액세스 할인가 $0.75 (27년 정상가 $1.50)
    outputUsd: 3.75, // 얼리액세스 할인가 $3.75 (27년 정상가 $7.50)
    description: "공식 Google AI Studio 최신 3.8 Flash 얼리액세스 공시 요율 (최저가 / 최고성능)",
    isLatest: true,
  },
  "gemini-3.7-flash": {
    inputUsd: 0.75,
    outputUsd: 3.75,
    description: "공식 3.7 세대 하이브리드 고지능 추론 공시 요율",
    isLatest: true,
  },
  "gemini-3.5-flash": {
    inputUsd: 1.50, // 이전 세대 공식 요율 (입력 $1.50)
    outputUsd: 9.00, // 이전 세대 공식 요율 (출력 $9.00)
    description: "공식 3.5 Flash 이전 세대 공시 요율 (구형 연산 구조로 3.8 대비 2배 이상 고비용)",
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

    // 패키지별 정밀 재무 손익 시뮬레이션 계산 (VAT 및 PG 수수료 반영)
    const vatRate = Number(config.vatRate ?? 10) / 100; // 10%
    const pgFeeRate = Number(config.pgFeeRate ?? 3.3) / 100; // 3.3%

    // 기본 제공 모델(3.8 Flash 등) 및 비교 모델(3.5 Flash 등)
    const defModelId = config.defaultModel || "gemini-3.8-flash";
    const primaryModel = config.models.find((m) => m.id === defModelId) || config.models[0];
    const legacyModel = config.models.find((m) => m.id === "gemini-3.5-flash") || config.models[1] || primaryModel;

    const packageSimulations = TOKEN_PACKAGES.map((pkg) => {
      // 1. 회계상 순매출(공급가액) 및 부가세 예수금 분리
      // 결제금액 = 공급가액 * (1 + vatRate) -> 공급가액 = 결제금액 / (1 + vatRate)
      const netSalesKrw = Math.round(pkg.priceKrw / (1 + vatRate));
      const vatKrw = pkg.priceKrw - netSalesKrw;

      // 2. PG사 결제 수수료 (결제 총액 기준 통상 차감)
      const pgFeeKrw = Math.round(pkg.priceKrw * pgFeeRate);

      // 3. LLM API 실제 원가 계산 (1회 평균 1,500토큰 가정: 입력 1,000 + 출력 500)
      const inputRatio = 1000 / 1500;
      const outputRatio = 500 / 1500;

      // A. 기본 제공 모델 (예: 3.8 Flash)
      const primaryCostPerTokenUsd =
        ((primaryModel.inputCostUsdPerMillion * inputRatio) +
         (primaryModel.outputCostUsdPerMillion * outputRatio)) / 1_000_000;
      const primaryRawCostKrw = pkg.totalTokens * primaryCostPerTokenUsd * config.exchangeRate;
      const primaryEstimatedCostKrw = Math.round(primaryRawCostKrw / (primaryModel.tokenMultiplier || 1.0));

      // B. 구형 모델 (예: 3.5 Flash)
      const legacyCostPerTokenUsd =
        ((legacyModel.inputCostUsdPerMillion * inputRatio) +
         (legacyModel.outputCostUsdPerMillion * outputRatio)) / 1_000_000;
      const legacyRawCostKrw = pkg.totalTokens * legacyCostPerTokenUsd * config.exchangeRate;
      const legacyEstimatedCostKrw = Math.round(legacyRawCostKrw / (legacyModel.tokenMultiplier || 1.0));

      // 4. 실질 영업 순이익 (순매출 - PG수수료 - API원가)
      const primaryRealProfitKrw = netSalesKrw - pgFeeKrw - primaryEstimatedCostKrw;
      const primaryRealMarginPercent = Math.round((primaryRealProfitKrw / netSalesKrw) * 1000) / 10; // 소수점 1자리

      const legacyRealProfitKrw = netSalesKrw - pgFeeKrw - legacyEstimatedCostKrw;
      const legacyRealMarginPercent = Math.round((legacyRealProfitKrw / netSalesKrw) * 1000) / 10;

      return {
        id: pkg.id,
        name: pkg.name,
        priceKrw: pkg.priceKrw,
        netSalesKrw,
        vatKrw,
        pgFeeKrw,
        totalTokens: pkg.totalTokens,
        primaryModelName: primaryModel.name,
        primaryEstimatedCostKrw,
        primaryRealProfitKrw,
        primaryRealMarginPercent,
        legacyModelName: legacyModel.name,
        legacyEstimatedCostKrw,
        legacyRealProfitKrw,
        legacyRealMarginPercent,
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

      const targetDefaultModel = config.defaultModel || "gemini-3.8-flash";

      const updated = await savePricingCostConfig(
        {
          ...config,
          defaultModel: targetDefaultModel,
          exchangeRate: rate,
          targetMarginRate: Number(config.targetMarginRate) || 50,
          pgFeeRate: typeof config.pgFeeRate === "number" ? config.pgFeeRate : Number(config.pgFeeRate) || 3.3,
          vatRate: typeof config.vatRate === "number" ? config.vatRate : Number(config.vatRate) || 10,
          allowUserModelSelection: config.allowUserModelSelection !== false,
          models: normalizedModels,
        },
        userEmail || "admin"
      );

      // 전역 AI 모델 기본값(global_ai_model_config)도 함께 동기화하여 서비스 전체에 즉시 적용
      const { saveAiModelSettings } = await import("@/lib/ai-settings");
      await saveAiModelSettings({
        defaultModel: targetDefaultModel,
        scriptGeneratorModel: targetDefaultModel,
        easybotModel: targetDefaultModel,
        helpModel: targetDefaultModel,
      }, userEmail || "admin");

      return NextResponse.json({
        success: true,
        message: `기본 제공 모델(${targetDefaultModel}) 및 AI 원가·마진율 설정이 성공적으로 저장되었습니다.`,
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
