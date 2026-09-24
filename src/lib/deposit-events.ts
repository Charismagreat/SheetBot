import { EventEmitter } from "events";

// Next.js 개발 모드 등에서 싱글톤 유지를 위한 글로벌 객체 참조
declare global {
  // eslint-disable-next-line no-var
  var __depositEventBus: EventEmitter | undefined;
}

export interface DepositEventPayload {
  type: "deposit_received" | "deposit_hold" | "deposit_delayed" | "deposit_action" | "device_heartbeat";
  timestamp: string;
  data?: any;
}

export const depositEventBus: EventEmitter =
  global.__depositEventBus || (global.__depositEventBus = new EventEmitter());

// 메모리 누수 방지 리스너 한도 상향
depositEventBus.setMaxListeners(100);

/**
 * 실시간 입금 및 기기 상태 변경 이벤트 브로드캐스트
 */
export function emitDepositEvent(
  type: DepositEventPayload["type"],
  data?: any
) {
  const payload: DepositEventPayload = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };
  depositEventBus.emit("deposit_change", payload);
}
