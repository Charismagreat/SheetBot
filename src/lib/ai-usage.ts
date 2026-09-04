import { insertRows } from './egdesk-helpers';
import { setupDatabase } from './setup-db';

export interface AiUsageLogInput {
  userEmail: string;
  userName?: string;
  caller: 'sheetbot-script-generator' | 'sheetbot-easybot' | 'sheetbot-contextual-help' | string;
  purpose: string;
  model?: string;
  promptText?: string;
  responseText?: string;
  promptTokens?: number;
  completionTokens?: number;
}

// 1 USD = 1,350 KRW 기준
const KRW_EXCHANGE_RATE = 1350;

/**
 * 텍스트 길이를 바탕으로 대략적인 토큰 수 추정 (1 토큰 ≈ 한글 1.5자, 영문 4자)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const len = text.length;
  // 한글 포함 여부에 따라 유동적 가중치
  const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);
  return hasKorean ? Math.ceil(len / 1.5) : Math.ceil(len / 3.5);
}

/**
 * 모델별 단가(USD) 기준 비용 계산 (Gemini 2.0 Flash / 1.5 Flash 기준: 입력 $0.10/1M, 출력 $0.40/1M)
 */
export function calculateEstimatedCost(promptTokens: number, completionTokens: number, model: string = 'gemini-2.0-flash') {
  // 1M 토큰당 가격 (기본: Flash)
  let inputRatePerMillion = 0.10;
  let outputRatePerMillion = 0.40;

  if (model.includes('pro')) {
    inputRatePerMillion = 1.25;
    outputRatePerMillion = 5.00;
  }

  const costUsd = (promptTokens / 1_000_000) * inputRatePerMillion + (completionTokens / 1_000_000) * outputRatePerMillion;
  const costKrw = costUsd * KRW_EXCHANGE_RATE;

  return {
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // 소수점 6자리
    costKrw: Math.round(costKrw * 100) / 100, // 소수점 2자리
  };
}

/**
 * AI API 호출 로그를 My DB에 실시간 안전 적재하는 헬퍼
 */
export async function recordAiUsageLog(input: AiUsageLogInput): Promise<void> {
  try {
    await setupDatabase();

    const pTokens = input.promptTokens ?? estimateTokens(input.promptText || '');
    const cTokens = input.completionTokens ?? estimateTokens(input.responseText || '');
    const totalTokens = pTokens + cTokens;
    const model = input.model || 'gemini-2.0-flash';

    const { costUsd, costKrw } = calculateEstimatedCost(pTokens, cTokens, model);

    const nowStr = new Date().toISOString();
    const logId = `log_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const row = {
      id: logId,
      uuid: crypto.randomUUID(),
      user_email: (input.userEmail || 'guest').toLowerCase().trim(),
      user_name: input.userName || '사용자',
      caller: input.caller,
      purpose: input.purpose,
      model,
      prompt_tokens: pTokens,
      completion_tokens: cTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: costUsd,
      estimated_cost_krw: costKrw,
      prompt_preview: (input.promptText || '').substring(0, 150).replace(/\n/g, ' '),
      created_at: nowStr,
      updated_at: nowStr,
      updated_by: input.userEmail || 'system',
      deleted_at: null,
      deleted_by: null,
      restored_at: null,
      restored_by: null,
    };

    await insertRows('sheetbot_ai_usage_logs', [row]);
  } catch (err: any) {
    // 감사 로그 적재 실패가 메인 사용자 요청을 실패시키지 않도록 경고만 출력
    console.warn('[AI-Usage-Log] Record warning:', err.message);
  }
}
