import { TOKEN_RECHARGE_GAS_DATA } from './token-recharge-preamble-data';
import { TOKEN_RECHARGE_GAS_UI } from './token-recharge-preamble-ui';
import { getTokenRechargeModalHtml } from './token-recharge-modal';
import { TOKEN_RECHARGE_WEBHOOK_TAIL } from './webhook-tail';

/**
 * 💳 SheetBot 인-시트(In-Sheet) 토큰 충전 및 실시간 입금 감지 표준 모듈 (TokenRecharge.gs) 생성기
 */
export function generateStandardTokenRecharge(): string {
  return `${TOKEN_RECHARGE_GAS_UI}\n${TOKEN_RECHARGE_GAS_DATA}\n${getTokenRechargeModalHtml()}\n${TOKEN_RECHARGE_WEBHOOK_TAIL}`;
}
