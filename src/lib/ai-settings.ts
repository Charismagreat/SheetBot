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
      { id: existing.id }
    );
  } else {
    await insertRows("sheetbot_settings", [
      {
        id: setting_,
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
