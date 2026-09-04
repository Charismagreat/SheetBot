import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import AIHelpManager from "@/components/AIHelpManager";
import EasyBot from "@/components/EasyBot";

export const metadata: Metadata = {
  title: "SheetBot - AI 기반 Google Apps Script 자동화 SaaS",
  description: "구글 계정으로 로그인하여 스프레드시트 자동화 Apps Script 프로젝트와 스케줄을 손쉽게 생성하고 관리하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 min-h-screen" suppressHydrationWarning>
        <SessionWrapper>
          {children}
          <AIHelpManager />
          <EasyBot />
        </SessionWrapper>
      </body>
    </html>
  );
}
