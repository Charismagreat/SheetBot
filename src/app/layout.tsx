import type { Metadata } from "next";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";
import GlobalWidgetGate from "@/components/GlobalWidgetGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://sheetbot.cloud"),
  title: "SheetBot (시트봇) - 구글 시트 AI 업무 자동화",
  description: "복잡한 수식과 코딩 없이, 말 한마디로 구글 시트에 AI 비서를 달아보세요. 영수증·명함·문자·주문 자동화까지 한 번에!",
  keywords: ["구글 시트 자동화", "스프레드시트 AI", "구글 시트 업무 자동화", "영수증 OCR", "명함 CRM", "시트봇", "SheetBot"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://sheetbot.cloud",
    siteName: "SheetBot (시트봇)",
    title: "SheetBot (시트봇) - 구글 시트 AI 업무 자동화",
    description: "복잡한 수식과 코딩 없이, 말 한마디로 구글 시트에 AI 비서를 달아보세요. 영수증·명함·문자·주문 자동화까지 한 번에!",
    images: [
      {
        url: "https://sheetbot.cloud/images/og-sheetbot.png",
        width: 1200,
        height: 630,
        alt: "SheetBot (시트봇) - 구글 시트 AI 업무 자동화",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SheetBot (시트봇) - 구글 시트 AI 업무 자동화",
    description: "복잡한 수식과 코딩 없이, 말 한마디로 구글 시트에 AI 비서를 달아보세요. 영수증·명함·문자·주문 자동화까지 한 번에!",
    images: ["https://sheetbot.cloud/images/og-sheetbot.png"],
  },
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
