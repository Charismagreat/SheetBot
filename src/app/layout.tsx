import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import GlobalWidgetGate from "@/components/GlobalWidgetGate";

export const metadata: Metadata = {
  title: "SheetBot - AI 기반 Google Apps Script 자동화 SaaS",
  description: "구글 계정으로 로그인하여 스프레드시트 자동화 Apps Script 프로젝트와 스케줄을 손쉽게 생성하고 관리하세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col" suppressHydrationWarning>
        <SessionWrapper>
          <div className="flex-1 flex flex-col">
            {children}
          </div>
          {/* 고객 포털(/order, /q)에서는 숨겨지고, 서비스 페이지에서만 안전하게 노출되는 위젯 게이트 */}
          <GlobalWidgetGate />
        </SessionWrapper>
      </body>
    </html>
  );
}
