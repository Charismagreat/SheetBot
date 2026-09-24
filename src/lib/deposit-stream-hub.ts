// src/lib/deposit-stream-hub.ts
/**
 * 이지데스크 DB 왓처 & 실시간 입금 이벤트 통합 스트림 허브
 * (하위 호환성 래퍼: 내부적으로 전역 realtimeHub를 경유합니다)
 */

import { realtimeHub } from './realtime-hub';

class DepositStreamHubAdapter {
  private static instance: DepositStreamHubAdapter;

  public static getInstance(): DepositStreamHubAdapter {
    if (!DepositStreamHubAdapter.instance) {
      DepositStreamHubAdapter.instance = new DepositStreamHubAdapter();
    }
    return DepositStreamHubAdapter.instance;
  }

  public registerClient(
    controller: ReadableStreamDefaultController<Uint8Array>,
    reqSignal: AbortSignal,
    userEmail: string
  ): void {
    realtimeHub.registerClient(controller, reqSignal, {
      userEmail,
      topic: 'deposit',
    });
  }

  public broadcast(payload: Record<string, any>): void {
    realtimeHub.broadcast('deposit', payload);
  }
}

export const depositStreamHub = DepositStreamHubAdapter.getInstance();
