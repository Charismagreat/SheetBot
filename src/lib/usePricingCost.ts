// src/lib/usePricingCost.ts
/**
 * ⚡ AI 모델 가격 및 원가 설정(/api/admin/pricing-cost) 공유 훅
 * - NewProjectModal 및 EditProjectPromptModal 등 복수 모달 동시 마운트 시 중복 네트워크 호출 100% 방지
 * - 인메모리 싱글톤 캐시를 통해 0초 만에 모델 목록 및 기본 선택 모델 즉시 제공
 */

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface PricingModelItem {
  id: string;
  name: string;
  provider: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  multiplier: number;
  tokenMultiplier?: number;
  badge?: string;
  description?: string;
  isDefault?: boolean;
  [key: string]: any;
}

export interface PricingCostConfig {
  models: PricingModelItem[];
  defaultModel: string;
  allowUserModelSelection: boolean;
}

let memoryPricingConfig: PricingCostConfig | null = null;
let inFlightPricingPromise: Promise<PricingCostConfig | null> | null = null;

export async function fetchPricingCostOnce(force = false): Promise<PricingCostConfig | null> {
  if (!force && memoryPricingConfig) {
    return memoryPricingConfig;
  }

  if (inFlightPricingPromise) {
    return inFlightPricingPromise;
  }

  inFlightPricingPromise = (async () => {
    try {
      const res = await apiFetch("/api/admin/pricing-cost");
      const data = await res.json();
      if (data.success && data.config) {
        memoryPricingConfig = {
          models: data.config.models || [],
          defaultModel: data.config.defaultModel || "gemini-3.8-flash",
          allowUserModelSelection: data.config.allowUserModelSelection !== false,
        };
        return memoryPricingConfig;
      }
    } catch (e) {
      console.warn("[usePricingCost] Failed to fetch pricing cost config", e);
    } finally {
      inFlightPricingPromise = null;
    }
    return memoryPricingConfig;
  })();

  return inFlightPricingPromise;
}

export function usePricingCost(enabled = true) {
  const [pricingModels, setPricingModels] = useState<PricingModelItem[]>(() => memoryPricingConfig?.models || []);
  const [allowUserSelection, setAllowUserSelection] = useState<boolean>(() => memoryPricingConfig?.allowUserModelSelection !== false);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const targetDefault = memoryPricingConfig?.defaultModel || "gemini-3.8-flash";
    const def = memoryPricingConfig?.models?.find((m) => m.id === targetDefault) || memoryPricingConfig?.models?.[0];
    return def?.id || targetDefault;
  });
  const [loading, setLoading] = useState<boolean>(!memoryPricingConfig && enabled);

  useEffect(() => {
    if (!enabled) return;

    if (memoryPricingConfig) {
      setPricingModels(memoryPricingConfig.models);
      setAllowUserSelection(memoryPricingConfig.allowUserModelSelection);
      const targetDefault = memoryPricingConfig.defaultModel || "gemini-3.8-flash";
      const def = memoryPricingConfig.models.find((m) => m.id === targetDefault) || memoryPricingConfig.models[0];
      if (def) setSelectedModel((prev) => prev || def.id);
      setLoading(false);
      return;
    }

    setLoading(true);
    void fetchPricingCostOnce().then((config) => {
      if (config) {
        setPricingModels(config.models);
        setAllowUserSelection(config.allowUserModelSelection);
        const targetDefault = config.defaultModel || "gemini-3.8-flash";
        const def = config.models.find((m) => m.id === targetDefault) || config.models[0];
        if (def) setSelectedModel((prev) => prev || def.id);
      }
      setLoading(false);
    });
  }, [enabled]);

  return {
    pricingModels,
    allowUserSelection,
    selectedModel,
    setSelectedModel,
    loading,
    setPricingModels,
    setAllowUserSelection,
  };
}
