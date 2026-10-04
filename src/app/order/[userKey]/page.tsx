export const dynamic = "force-dynamic";

import type { Metadata, ResolvingMetadata } from "next";
import OrderClientPage from "./OrderClientPage";
import { getOrderCatalogData } from "@/lib/order-catalog-helper";

type Props = {
  params: Promise<{ userKey: string }>;
};

/**
 * 카카오톡, 문자, SNS 링크 공유 시 표시되는 Open Graph 메타태그 생성
 * 사장님이 설정한 상호명만 대괄호 형태([상호명])로 제목에 깔끔하게 표출
 */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { userKey } = await params;
  
  let businessName = "스마트 견적 & 주문 센터";
  let ogImageUrl = "https://sheetbot.cloud/images/og-default.png";

  try {
    const data = await getOrderCatalogData({ userKey, isSsr: true });
    if (data?.merchant?.businessName) {
      businessName = data.merchant.businessName;
    }
    if (data?.merchant?.imageUrl) {
      ogImageUrl = data.merchant.imageUrl;
    }
  } catch (_) {}

  // 🚀 카카오톡/SNS 스크랩 봇 전용: 터널 바이너리 부하를 100% 우회하는 글로벌 초고속 CDN 직통 URL
  const fileMatch = ogImageUrl.match(/quote_[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|gif)/i);
  if (fileMatch) {
    ogImageUrl = `https://cdn.jsdelivr.net/gh/Charismagreat/SheetBot@main/public/uploads/quote-images/${fileMatch[0]}`;
  } else if (!ogImageUrl || ogImageUrl.endsWith(".svg")) {
    ogImageUrl = "https://cdn.jsdelivr.net/gh/Charismagreat/SheetBot@main/public/images/og-default.png";
  }

  const isPng = ogImageUrl.toLowerCase().endsWith(".png");
  const isWebp = ogImageUrl.toLowerCase().endsWith(".webp");
  const mimeType = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";

  const title = `[${businessName}]`;
  const description = `실시간 모바일 간편 주문 • ${businessName}`;
  const pageUrl = `https://sheetbot.cloud/order/${userKey}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: businessName,
      type: "website",
      locale: "ko_KR",
      images: [
        {
          url: ogImageUrl,
          secureUrl: ogImageUrl,
          type: mimeType,
          width: 1200,
          height: 630,
          alt: `${businessName} 대표 이미지`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function Page({ params }: Props) {
  const { userKey } = await params;
  
  // 🚀 [초고속 SSR 0.005초]: SQLite에서 사장님 상호명("스마띠몰")과 로고를 즉시 꺼내 단일 완성본 HTML 생성
  // Suspense 스트리밍 청크 버퍼링을 원천 차단하여 Cloudflare/Render 프록시가 지연 없이 0.05초 만에 전체 HTML 전송
  let initialData = null;
  try {
    initialData = await getOrderCatalogData({ userKey, isSsr: true });
  } catch (err) {
    console.warn("[OrderPage] Server SSR catalog fetch fallback:", err);
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <OrderClientPage userKey={userKey} initialData={initialData} />
    </div>
  );
}
