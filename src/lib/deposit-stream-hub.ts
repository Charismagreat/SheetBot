// src/lib/deposit-stream-hub.ts
/**
 * 이지데스크 DB 왓처 & 실시간 입금 이벤트 통합 스트림 허브
 *
 * [핵심 아키텍처 원칙 준수]
 * 1. Single Shared Upstream Connection (연결 팬아웃 최적화):
 *    모든 브라우저 클라이언트가 개별로 이지데스크에 연결하지 않고,
 *    서버 프로세스에서 단 1개의 공유 업스트림 SSE 연결을 유지하여 자원 고갈을 방지합니다.
 * 2. Streaming and Buffering:
 *    Node.js 런타임, text/event-stream, no-cache, no-transform, X-Accel-Buffering: no 준수.
 * 3. Heartbeats:
 *    15초 주기 ': ping\n\n' 주석을 전송하여 프록시/로드밸런서의 유휴 연결 강제 종료 방지.
 * 4. Cleanup & Resource Management:
 *    클라이언트 연결 해제(req.signal abort) 감지 시 컨트롤러 및 리소스 즉시 정리.
 * 5. 지능형 다중 이벤트 통합:
 *    이지데스크 My DB의 sheetbot_deposit_requests 변경 이벤트 + 앱 내부 depositEventBus 통합 브로드캐스트.
 */

import { EGDESK_CONFIG } from '../../egdesk.config';
import { depositEventBus, DepositEventPayload } from './deposit-events';

interface StreamClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  userEmail: string;
  encoder: TextEncoder;
  pingTimer: NodeJS.Timeout;
}

class DepositStreamHub {
  private static instance: DepositStreamHub;
  private clients = new Map<string, StreamClient>();
  private upstreamAbortController: AbortController | null = null;
  private upstreamConnected = false;
  private isConnectingUpstream = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // 앱 내부 SMS/입금 감지 버스 구독
    depositEventBus.on('deposit_change', (payload: DepositEventPayload) => {
      this.broadcast({
        source: 'event_bus',
        type: payload.type,
        data: payload.data,
        timestamp: payload.timestamp || new Date().toISOString(),
      });
    });
  }

  public static getInstance(): DepositStreamHub {
    if (!DepositStreamHub.instance) {
      DepositStreamHub.instance = new DepositStreamHub();
    }
    return DepositStreamHub.instance;
  }

  /**
   * 브라우저 클라이언트 등록 및 스트림 제어
   */
  public registerClient(
    controller: ReadableStreamDefaultController<Uint8Array>,
    reqSignal: AbortSignal,
    userEmail: string
  ): void {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const encoder = new TextEncoder();

    // 1. 프록시/리버스 프록시 버퍼 즉시 플러시용 2KB 프리앰블 및 연결 확인 패킷
    const preamble = `: ${' '.repeat(2048)}\n\n`;
    const welcome = `data: ${JSON.stringify({
      type: 'CONNECTED',
      message: '⚡ 실시간 입금 감지 및 DB 왓처 스트림에 정상 연결되었습니다.',
      upstreamLive: this.upstreamConnected,
      timestamp: new Date().toISOString(),
    })}\n\n`;

    try {
      controller.enqueue(encoder.encode(preamble + welcome));
    } catch (err) {
      console.warn(`[StreamHub] Failed to send welcome to ${clientId}:`, err);
      return;
    }

    // 2. 15초 주기 하트비트 핑 (프록시/Nginx 유휴 타임아웃 방지)
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
      userEmail,
      encoder,
      pingTimer,
    };

    this.clients.set(clientId, client);
    console.log(`[StreamHub] 클라이언트 연결됨: ${clientId} (${userEmail}) | 총 활성 접속자: ${this.clients.size}`);

    // 업스트림(이지데스크 SSE) 연결 확인 및 보장
    this.ensureUpstream();

    // 연결 종료(req.signal abort) 처리
    reqSignal.addEventListener('abort', () => {
      this.unregisterClient(clientId);
    });
  }

  /**
   * 클라이언트 등록 해제 및 타이머 정리
   */
  public unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    clearInterval(client.pingTimer);
    try {
      client.controller.close();
    } catch {}
    this.clients.delete(clientId);
    console.log(`[StreamHub] 클라이언트 연결 종료: ${clientId} | 남은 접속자: ${this.clients.size}`);
  }

  /**
   * 모든 활성 클라이언트에게 이벤트 브로드캐스트
   */
  public broadcast(payload: Record<string, any>): void {
    const dataString = `data: ${JSON.stringify(payload)}\n\n`;
    const deadClients: string[] = [];

    for (const [id, client] of this.clients.entries()) {
      try {
        client.controller.enqueue(client.encoder.encode(dataString));
      } catch (err) {
        deadClients.push(id);
      }
    }

    // 전송 실패한 죽은 연결 정리
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

    console.log(`[StreamHub] 이지데스크 단일 업스트림 SSE 연결 시도: ${baseUrl}/user-data/sse`);

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
      console.log(`[StreamHub] ✅ 이지데스크 단일 공유 업스트림 연결 성공!`);

      // 연결 상태 클라이언트들에게 통보
      this.broadcast({
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
            buffer = lines.pop() || ''; // 완전하지 않은 마지막 줄 보존

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr) continue;
                try {
                  const eventData = JSON.parse(jsonStr);
                  this.handleUpstreamEvent(eventData);
                } catch {
                  // JSON 파싱 무시
                }
              }
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.warn('[StreamHub] Upstream read loop warning:', err.message);
          }
        } finally {
          this.upstreamConnected = false;
          this.scheduleUpstreamReconnect();
        }
      })();
    } catch (err: any) {
      this.upstreamConnected = false;
      this.isConnectingUpstream = false;
      console.warn(`[StreamHub] 이지데스크 업스트림 연결 실패: ${err.message}`);
      this.scheduleUpstreamReconnect();
    }
  }

  /**
   * 이지데스크 업스트림 이벤트 파싱 및 필터링 후 브로드캐스트
   */
  private handleUpstreamEvent(eventData: any): void {
    if (eventData.method === 'egdesk/user-data-changed') {
      const params = eventData.params || {};
      const tableName = params.tableName;

      console.log(`[StreamHub] 📩 이지데스크 DB 변경 감지: table=${tableName}, action=${params.action}`);

      // sheetbot_deposit_requests 테이블 변경 시 실시간 브로드캐스트
      if (tableName === 'sheetbot_deposit_requests') {
        this.broadcast({
          type: 'deposit_received',
          source: 'egdesk_db_watcher',
          tableName,
          action: params.action,
          kind: params.kind,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * 업스트림 연결 끊김 시 5초 후 자동 재연결
   */
  private scheduleUpstreamReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    // 활성 클라이언트가 있을 때만 재연결 시도
    if (this.clients.size > 0) {
      this.reconnectTimer = setTimeout(() => {
        this.ensureUpstream();
      }, 5000);
    }
  }
}

export const depositStreamHub = DepositStreamHub.getInstance();
