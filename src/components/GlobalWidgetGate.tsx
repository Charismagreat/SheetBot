"use client";

import React from "react";
import { usePathname } from "next/navigation";
import nextDynamic from "next/dynamic";
import Footer from "@/components/Footer";

const LazyAIHelpManager = nextDynamic(() => import("@/components/AIHelpManager"), { ssr: false });
const LazyEasyBot = nextDynamic(() => import("@/components/EasyBot"), { ssr: false });

/**
 * 모바일 고객용 주문 웹앱(/order/...) 및 고객 견적서(/q/...)에서는
 * 서비스 관리자용 푸터(Footer), AI 컨텍스트 도움말(EasyBot, AIHelpManager)을 100% 격리하여
 * 고객 화면이 깨지거나 불필요한 번들이 로딩되는 현상을 원천 방지
 */
export default function GlobalWidgetGate() {
  const pathname = usePathname() || "";

  // 고객용 전용 화면 및 모바일 웹앱에서는 관리자용 위젯 전체 숨김
  const isCustomerPortal = 
    pathname.startsWith("/order") || 
    pathname.startsWith("/estimate") || 
    pathname.startsWith("/site") || 
    pathname.startsWith("/q/") || 
    pathname.startsWith("/m/");

  if (isCustomerPortal) {
    return null;
  }

  return (
    <>
      <Footer />
      <LazyAIHelpManager />
      <LazyEasyBot />
    </>
  );
}
