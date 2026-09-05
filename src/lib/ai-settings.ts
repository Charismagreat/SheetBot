import { queryTable, insertRows, updateRows } from "./egdesk-helpers";
import { setupDatabase } from "./setup-db";

export interface SheetBotAiSettings {
  defaultModel: string;
  scriptGeneratorModel: string;
  easybotModel: string;
  helpModel: string;
  temperature: number;
}

export const DEFAULT_AI_SETTINGS: SheetBotAiSettings = {
  defaultModel: "gemini-3.5-flash",
  scriptGeneratorModel: "gemini-3.5-flash",
  easybotModel: "gemini-3.5-flash",
  helpModel: "gemini-3.5-flash",
  temperature: 0.3,
};

const SETTINGS_KEY = "global_ai_model_config";

/**
 * 전역 또는 시스템에 저장된 AI 모델 설정 조회
 */
export async function getAiModelSettings(): Promise<SheetBotAiSettings> {
  try {
    await setupDatabase();
    const res = await queryTable("sheetbot_settings", {
      filters: { key: SETTINGS_KEY },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (res.rows && res.rows.length > 0 && !res.rows[0].deleted_at) {
      const parsed = JSON.parse(res.rows[0].value);
      return {
        ...DEFAULT_AI_SETTINGS,
        ...parsed,
      };
    }
  } catch (err: any) {
    console.warn("[AiSettings] Failed to fetch settings, using defaults:", err.message);
  }
  return DEFAULT_AI_SETTINGS;
}

/**
 * AI 모델 설정 저장/업데이트
 */
export async function saveAiModelSettings(
  settings: Partial<SheetBotAiSettings>,
  updatedBy: string = "system"
): Promise<SheetBotAiSettings> {
  await setupDatabase();

  const current = await getAiModelSettings();
  const merged: SheetBotAiSettings = {
    ...current,
    ...settings,
  };

  const res = await queryTable("sheetbot_settings", {
    filters: { key: SETTINGS_KEY },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  const now = new Date().toISOString();

  if (res.rows && res.rows.length > 0) {
    const existing = res.rows[0];
    await updateRows(
      "sheetbot_settings",
      {
        value: JSON.stringify(merged),
        updated_at: now,
        updated_by: updatedBy,
      },
      { filters: { id: existing.id } }
    );
  } else {
    await insertRows("sheetbot_settings", [
      {
        id: `setting_${Date.now()}`,
        uuid: crypto.randomUUID(),
        key: SETTINGS_KEY,
        value: JSON.stringify(merged),
        description: "SheetBot 전역 AI 모델 및 파라미터 구성",
        created_at: now,
        updated_at: now,
        updated_by: updatedBy,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);
  }

  return merged;
}

// -------------------------------------------------------------
// AI 모델별 원가(Cost), 사용자 차감 가중치(Multiplier) 및 운영 마진율 체계
// -------------------------------------------------------------

export interface ModelPricingDetail {
  id: string;
  name: string;
  category: "flash" | "flash_lite" | "pro";
  inputCostUsdPerMillion: number; // 1M 토큰당 입력 원가 (USD)
  outputCostUsdPerMillion: number; // 1M 토큰당 출력 원가 (USD)
  estimatedKrwPerMillion: number; // 1M 토큰당 추정 원가 (KRW, 환율 적용)
  tokenMultiplier: number; // 사용자 토큰 차감 가중치 (예: 1.0 = 표준, 2.0 = 2배 차감)
  description: string;
  isOfficialLatest?: boolean;
}

export interface PricingCostConfig {
  exchangeRate: number; // USD to KRW (기본: 1400)
  targetMarginRate: number; // 목표 운영 마진율 % (기본: 50%)
  allowUserModelSelection: boolean; // 일반 회원의 모델 선택 허용 여부 (기본: true)
  lastSyncedAt: string; // 제미나이 공식 사이트 요율 동기화 일시
  models: ModelPricingDetail[];
}

export const DEFAULT_MODEL_PRICING: ModelPricingDetail[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash (최신 플래그십)",
    category: "flash",
    inputCostUsdPerMillion: 0.75,
    outputCostUsdPerMillion: 3.75,
    estimatedKrwPerMillion: 3150, // 평균 (입력 1000 + 출력 500 토큰 기준 추정치 반영)
    tokenMultiplier: 1.8,
    description: "차세대 고속 초지능 엔진, 복잡한 업무 자동화 및 고난도 Apps Script 작성",
    isOfficialLatest: true,
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash (고지능)",
    category: "flash",
    inputCostUsdPerMillion: 0.75,
    outputCostUsdPerMillion: 3.75,
    estimatedKrwPerMillion: 3150,
    tokenMultiplier: 1.6,
    description: "다단계 비즈니스 로직 및 스프레드시트 수식 생성",
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash (표준 추천)",
    category: "flash",
    inputCostUsdPerMillion: 0.50,
    outputCostUsdPerMillion: 2.00,
    estimatedKrwPerMillion: 2100,
    tokenMultiplier: 1.0,
    description: "가장 안정적인 기본 표준 모델, 1.0배 표준 토큰 차감",
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash-Lite (초경량)",
    category: "flash_lite",
    inputCostUsdPerMillion: 0.25,
    outputCostUsdPerMillion: 1.50,
    estimatedKrwPerMillion: 1225,
    tokenMultiplier: 0.8,
    description: "초경량 저비용 모델, 토큰 20% 할인(0.8배 차감)",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    category: "flash",
    inputCostUsdPerMillion: 0.30,
    outputCostUsdPerMillion: 2.50,
    estimatedKrwPerMillion: 1960,
    tokenMultiplier: 1.0,
    description: "이전 2.5 세대 Flash 안정화 버전",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (심층 추론)",
    category: "pro",
    inputCostUsdPerMillion: 1.25,
    outputCostUsdPerMillion: 5.00,
    estimatedKrwPerMillion: 4375, // 복잡 작업 시 100만당 약 20,000원 상당 발생 가능
    tokenMultiplier: 3.5,
    description: "복잡한 대형 스프레드시트 구조 분석 및 초정밀 스크립트 생성",
  },
];

export const DEFAULT_PRICING_CONFIG: PricingCostConfig = {
  exchangeRate: 1400,
  targetMarginRate: 50, // 50% 운영 마진 목표
  allowUserModelSelection: true,
  lastSyncedAt: new Date().toISOString(),
  models: DEFAULT_MODEL_PRICING,
};

const PRICING_CONFIG_KEY = "global_ai_pricing_cost_config";

/**
 * 전역 원가 및 마진율 설정 조회
 */
export async function getPricingCostConfig(): Promise<PricingCostConfig> {
  try {
    await setupDatabase();
    const res = await queryTable("sheetbot_settings", {
      filters: { key: PRICING_CONFIG_KEY },
      limit: 1,
    }).catch(() => ({ rows: [] }));

    if (res.rows && res.rows.length > 0 && !res.rows[0].deleted_at) {
      const parsed = JSON.parse(res.rows[0].value);
      return {
        ...DEFAULT_PRICING_CONFIG,
        ...parsed,
      };
    }
  } catch (err: any) {
    console.warn("[PricingCostConfig] Fetch error, using defaults:", err.message);
  }
  return DEFAULT_PRICING_CONFIG;
}

/**
 * 전역 원가 및 마진율 설정 저장
 */
export async function savePricingCostConfig(
  config: Partial<PricingCostConfig>,
  updatedBy: string = "system"
): Promise<PricingCostConfig> {
  await setupDatabase();

  const current = await getPricingCostConfig();
  const merged: PricingCostConfig = {
    ...current,
    ...config,
  };

  const res = await queryTable("sheetbot_settings", {
    filters: { key: PRICING_CONFIG_KEY },
    limit: 1,
  }).catch(() => ({ rows: [] }));

  const now = new Date().toISOString();

  if (res.rows && res.rows.length > 0) {
    const existing = res.rows[0];
    await updateRows(
      "sheetbot_settings",
      {
        value: JSON.stringify(merged),
        updated_at: now,
        updated_by: updatedBy,
      },
      { filters: { id: existing.id } }
    );
  } else {
    await insertRows("sheetbot_settings", [
      {
        id: `setting_${Date.now()}`,
        uuid: crypto.randomUUID(),
        key: PRICING_CONFIG_KEY,
        value: JSON.stringify(merged),
        description: "SheetBot 전역 AI 실제 원가, 토큰 차감 가중치 및 목표 운영 마진율 구성",
        created_at: now,
        updated_at: now,
        updated_by: updatedBy,
        deleted_at: null,
        deleted_by: null,
        restored_at: null,
        restored_by: null,
      },
    ]);
  }

  return merged;
}

/**
 * 특정 모델의 토큰 차감 가중치 배율 조회 (기본 1.0)
 */
export async function getModelTokenMultiplier(modelId: string): Promise<number> {
  const config = await getPricingCostConfig();
  const match = config.models.find((m) => m.id === modelId);
  return match ? match.tokenMultiplier : 1.0;
}

