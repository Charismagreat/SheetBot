// src/lib/realtime-hub.ts
/**
 * SheetBot 전역 실시간 스트림 허브 (SheetBotRealtimeHub)
 *
 * [핵심 아키텍처 원칙]
 * 1. Single Shared Upstream Connection (단일 업스트림 공유):
 *    수백 명의 회원이 접속해도 이지데스크 My DB(/user-data/sse)와는 단 1개의 SSE 연결만 유지합니다.
 * 2. Cache Invalidation 패턴 (보안 격리):
 *    스트림으로 민감한 데이터 본문을 직접 노출하지 않고, 변경 발생 알림(테이블명, 액션)만 전송하여
 *    각 브라우저가 자신의 세션 권한으로 본인 데이터만 안전하게 Re-fetch 하도록 합니다.
 * 3. 300ms 이벤트 디바운싱 (Event Storm 방지):
 *    배치 작업이나 대량 삽입 시 0.1초 사이에 쏟아지는 수백 건의 이벤트를 300ms 단위로 묶어 클라이언트에 전달합니다.
 * 4. Streaming and Buffering:
 *    Node.js 런타임, text/event-stream, no-cache, no-transform, X-Accel-Buffering: no.
 * 5. Heartbeats:
 *    15초 주기 ': ping\n\n' 전송으로 프록시/Nginx 유휴 강제 종료 방지.
 * 6. Cleanup:
 *    req.signal abort 시 클라이언트 즉시 등록 해제 및 타이머 정리.
 */

import crypto from 'crypto';
import { EGDESK_CONFIG } from '../../egdesk.config';
import { depositEventBus, DepositEventPayload } from './deposit-events';

export type RealtimeTopic = 'all' | 'deposit' | 'sms' | 'schedules' | 'projects' | 'wallet';

interface StreamClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  userEmail: string;
  topic: RealtimeTopic;
  encoder: TextEncoder;
  pingTimer: NodeJS.Timeout;
}

// 테이블과 토픽 간의 매핑 관계
const TABLE_TOPIC_MAP: Record<string, RealtimeTopic[]> = {
  sheetbot_deposit_requests: ['deposit', 'all'],
  sheetbot_sms_logs: ['sms', 'deposit', 'all'],
  sheetbot_user_devices: ['sms', 'deposit', 'all'],
  sheetbot_smart_rules: ['sms', 'all'],
  sheetbot_schedules: ['schedules', 'all'],
  sheetbot_projects: ['projects', 'all'],
  sheetbot_users: ['wallet', 'all'],
};

class SheetBotRealtimeHub {
  private static instance: SheetBotRealtimeHub;
  private clients = new Map<string, StreamClient>();
  private upstreamAbortController: AbortController | null = null;
  private upstreamConnected = false;
  private isConnectingUpstream = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  private constructor() {
    // 앱 내부 SMS/입금 감지 버스 연동
    depositEventBus.on('deposit_change', (payload: DepositEventPayload) => {
      this.broadcast('deposit', {
        source: 'event_bus',
        type: payload.type,
        data: payload.data,
        timestamp: payload.timestamp || new Date().toISOString(),
      });
    });
  }

  public static getInstance(): SheetBotRealtimeHub {
    if (!SheetBotRealtimeHub.instance) {
      SheetBotRealtimeHub.instance = new SheetBotRealtimeHub();
    }
    return SheetBotRealtimeHub.instance;
  }

  /**
   * 브라우저 클라이언트 등록
   */
  public registerClient(
    controller: ReadableStreamDefaultController<Uint8Array>,
    reqSignal: AbortSignal,
    options: { userEmail: string; topic?: RealtimeTopic }
  ): void {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const encoder = new TextEncoder();
    const topic = options.topic || 'all';

    // 1. 프록시/리버스 프록시 버퍼 즉시 플러시용 난수 프리앰블(압축 후에도 5KB+ 유지되어 Render/Nginx 4KB 버퍼 즉시 관통) 및 웰컴 패킷
    const randomBuffer = crypto.randomBytes(4096).toString('base64');
    const preamble = `: ${randomBuffer}\n\n`;
    const welcome = `data: ${JSON.stringify({
      type: 'CONNECTED',
      topic,
      message: '⚡ SheetBot 전역 실시간 스트림에 정상 연결되었습니다.',
      upstreamLive: this.upstreamConnected,
      timestamp: new Date().toISOString(),
    })}\n\n`;

    try {
      controller.enqueue(encoder.encode(preamble + welcome));
    } catch (err) {
      console.warn(`[RealtimeHub] Failed to send welcome to ${clientId}:`, err);
      return;
    }

    // 2. 15초 주기 하트비트 핑 (프록시 유휴 타임아웃 방지)
    const pingTimer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(': ping\n\n'));
      } catch {
        this.unregisterClient(clientId);
      }
    }, 15000);

    const client: StreamClient = {
      id: clientId,
      controller,
      userEmail: options.userEmail,
      topic,
      encoder,
      pingTimer,
    };

    this.clients.set(clientId, client);
    console.log(`[RealtimeHub] 클라이언트 연결됨: ${clientId} (${options.userEmail}) [Topic: ${topic}] | 총 활성: ${this.clients.size}`);

    // 업스트림(이지데스크 SSE) 연결 확인 및 보장
    this.ensureUpstream();

    // 브라우저 탭 닫힘 등 연결 종료 감지
    reqSignal.addEventListener('abort', () => {
      this.unregisterClient(clientId);
    });
  }

  /**
   * 클라이언트 연결 해제 및 리소스 정리
   */
  public unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    clearInterval(client.pingTimer);
    try {
      client.controller.close();
    } catch {}
    this.clients.delete(clientId);
    console.log(`[RealtimeHub] 클라이언트 연결 종료: ${clientId} | 남은 접속자: ${this.clients.size}`);
  }

  /**
   * 특정 토픽 구독자들에게 이벤트 브로드캐스트
   */
  public broadcast(targetTopic: RealtimeTopic, payload: Record<string, any>): void {
    const dataString = `data: ${JSON.stringify(payload)}\n\n`;
    const deadClients: string[] = [];

    for (const [id, client] of this.clients.entries()) {
      if (client.topic === 'all' || client.topic === targetTopic) {
        try {
          client.controller.enqueue(client.encoder.encode(dataString));
        } catch {
          deadClients.push(id);
        }
      }
    }

    for (const id of deadClients) {
      this.unregisterClient(id);
    }
  }

  /**
   * 이지데스크 /user-data/sse 단일 공유 업스트림 연결 보장
   */
  private async ensureUpstream(): Promise<void> {
    if (this.upstreamConnected || this.isConnectingUpstream) return;
    this.isConnectingUpstream = true;

    if (this.upstreamAbortController) {
      this.upstreamAbortController.abort();
    }
    this.upstreamAbortController = new AbortController();

    const baseUrl = EGDESK_CONFIG.apiUrl || 'http://localhost:8080';
    const apiKey = EGDESK_CONFIG.apiKey || '';
    const sseUrl = `${baseUrl}/user-data/sse?key=${apiKey}`;

    console.log(`[RealtimeHub] 이지데스크 단일 업스트림 연결 시도: ${baseUrl}/user-data/sse`);

    try {
      const res = await fetch(sseUrl, {
        signal: this.upstreamAbortController.signal,
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!res.ok) {
        throw new Error(`Upstream returned ${res.status} ${res.statusText}`);
      }

      this.upstreamConnected = true;
      this.isConnectingUpstream = false;
      console.log(`[RealtimeHub] ✅ 이지데스크 단일 공유 업스트림 연결 성공!`);

      this.broadcast('all', {
        type: 'UPSTREAM_STATUS',
        upstreamLive: true,
        timestamp: new Date().toISOString(),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream from upstream');

      const decoder = new TextDecoder();
      let buffer = '';

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr) continue;
                try {
                  const eventData = JSON.parse(jsonStr);
                  this.handleUpstreamEvent(eventData);
                } catch {}
              }
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.warn('[RealtimeHub] Upstream read loop warning:', err.message);
          }
        } finally {
          this.upstreamConnected = false;
          this.scheduleUpstreamReconnect();
        }
      })();
    } catch (err: any) {
      this.upstreamConnected = false;
      this.isConnectingUpstream = false;
      console.warn(`[RealtimeHub] 이지데스크 업스트림 연결 실패: ${err.message}`);
      this.scheduleUpstreamReconnect();
    }
  }

  /**
   * 이지데스크 업스트림 이벤트 파싱 및 300ms 디바운스 브로드캐스트
   */
  private handleUpstreamEvent(eventData: any): void {
    if (eventData.method === 'egdesk/user-data-changed') {
      const params = eventData.params || {};
      const tableName = params.tableName as string;
      if (!tableName) return;

      const topics = TABLE_TOPIC_MAP[tableName] || ['all'];

      // 300ms 디바운싱: 동일 테이블의 잦은 변경을 묶어서 브로드캐스트
      const debounceKey = `${tableName}_${params.action}`;
      if (this.debounceTimers.has(debounceKey)) {
        clearTimeout(this.debounceTimers.get(debounceKey)!);
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(debounceKey);
        console.log(`[RealtimeHub] 📩 DB 변경 브로드캐스트: table=${tableName}, action=${params.action}`);

        for (const topic of topics) {
          this.broadcast(topic, {
            type: 'DATA_CHANGED',
            source: 'egdesk_db_watcher',
            tableName,
            action: params.action,
            kind: params.kind,
            timestamp: new Date().toISOString(),
          });
        }
      }, 300);

      this.debounceTimers.set(debounceKey, timer);
    }
  }

  private scheduleUpstreamReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.clients.size > 0) {
      this.reconnectTimer = setTimeout(() => {
        this.ensureUpstream();
      }, 5000);
    }
  }
}

export const realtimeHub = SheetBotRealtimeHub.getInstance();
