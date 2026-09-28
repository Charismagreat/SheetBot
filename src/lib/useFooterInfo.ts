// src/lib/useFooterInfo.ts
/**
 * ⚡ 푸터 정보(/api/footer) 단일 캐싱 및 중복 네트워크 호출 방지 훅
 * - 인메모리 싱글톤 캐시 + 세션 스토리지 연동으로 0초 즉시 렌더링 지원
 * - 동시에 여러 컴포넌트(페이지, 푸터)가 마운트되더라도 in-flight Promise 중복 제거로 네트워크 호출 1회 보장
 */

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { DEFAULT_FOOTER, FooterInfo } from "@/lib/default-footer";

let memoryFooterCache: FooterInfo | null = null;
let inFlightFooterPromise: Promise<FooterInfo | null> | null = null;

export async function fetchFooterOnce(force = false): Promise<FooterInfo | null> {
  if (!force && memoryFooterCache) {
    return memoryFooterCache;
  }

  if (inFlightFooterPromise) {
    return inFlightFooterPromise;
  }

  inFlightFooterPromise = (async () => {
    try {
      const res = await apiFetch("/api/footer");
      const data = await res.json();
      if (data.success && data.footer) {
        memoryFooterCache = data.footer;
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("sb_footer_info", JSON.stringify(data.footer));
          } catch {}
        }
        return data.footer;
      }
    } catch (e) {
      console.warn("Failed to fetch dynamic footer, using default", e);
    } finally {
      inFlightFooterPromise = null;
    }
    return memoryFooterCache || DEFAULT_FOOTER;
  })();

  return inFlightFooterPromise;
}

export function useFooterInfo(propsInfo?: FooterInfo) {
  const [footerInfo, setFooterInfo] = useState<FooterInfo>(() => {
    if (propsInfo) return propsInfo;
    if (memoryFooterCache) return memoryFooterCache;
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("sb_footer_info");
        if (cached) {
          const parsed = JSON.parse(cached);
          memoryFooterCache = parsed;
          return parsed;
        }
      } catch {}
    }
    return DEFAULT_FOOTER;
  });

  useEffect(() => {
    if (propsInfo) {
      setFooterInfo(propsInfo);
      return;
    }

    if (!memoryFooterCache) {
      void fetchFooterOnce().then((data) => {
        if (data) setFooterInfo(data);
      });
    }

    const handleUpdate = () => {
      void fetchFooterOnce(true).then((data) => {
        if (data) setFooterInfo(data);
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("sheetbot-footer-updated", handleUpdate);
      return () => {
        window.removeEventListener("sheetbot-footer-updated", handleUpdate);
      };
    }
  }, [propsInfo]);

  return footerInfo;
}
