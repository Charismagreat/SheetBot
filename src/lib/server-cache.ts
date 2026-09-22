/**
 * SheetBot 서버 사이드 인메모리 TTL 캐시 & In-flight Request Deduplication 모듈
 * 
 * - 동일한 쿼리/요청이 동시에 들어올 때 1개의 Promise만 실행하고 결과를 공유(Deduplication)하여 터널 병목 방지
 * - 지정된 TTL(기본 20초) 동안 캐시된 데이터를 즉각 반환(0ms)하여 관리자 대시보드 로딩 속도 극대화
 * - 데이터 변경(PUT/POST/DELETE) 발생 시 즉시 무효화(invalidateServerCache) 지원
 */

import { queryTable } from "./egdesk-helpers";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cacheStore = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * 인메모리 TTL 캐시 및 중복 요청 병합(In-flight deduplication) 헬퍼
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 20,
  forceRefresh = false
): Promise<T> {
  const now = Date.now();

  // 1. 유효한 캐시가 있으면 즉시 반환
  if (!forceRefresh) {
    const cached = cacheStore.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

  // 2. 이미 동일한 키의 요청이 비동기 실행 중이면 기존 Promise를 함께 대기(네트워크 중복 호출 차단)
  if (!forceRefresh && inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  // 3. 신규 요청 생성 및 실행
  const promise = (async () => {
    try {
      const data = await fetcher();
      cacheStore.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * 중복 방지 및 캐싱이 적용된 queryTable 헬퍼
 */
export async function cachedQueryTable(
  tableName: string,
  options: {
    filters?: Record<string, string>;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: "ASC" | "DESC";
  } = {},
  ttlSeconds = 20,
  force = false
) {
  const cacheKey = `query_${tableName}_${JSON.stringify(options)}`;
  return fetchWithCache(
    cacheKey,
    () => queryTable(tableName, options).catch(() => ({ rows: [] })),
    ttlSeconds,
    force
  );
}

/**
 * 서버 캐시 무효화 헬퍼 (특정 prefix로 시작하는 키 또는 전체 삭제)
 */
export function invalidateServerCache(prefix?: string) {
  if (!prefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix) || key.includes(prefix)) {
      cacheStore.delete(key);
    }
  }
}
