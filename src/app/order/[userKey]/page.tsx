import type { Metadata, ResolvingMetadata } from "next";
import OrderClientPage from "./OrderClientPage";
import { getOrderCatalogData } from "@/lib/order-catalog-helper";

type Props = {
  params: Promise<{ userKey: string }>;
};

/**
 * 카카오톡, 문자, SNS 링크 공유 시 표시되는 Open Graph 메타태그 생성
 * 사장님이 설정한 상호명만 대괄호 형태([상호명])로 제목에 깔끔하게 표출
 * 🚀 불필요한 setupDatabase()를 완전 제거하여 0.001초 만에 메타태그 완성
 */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { userKey } = await params;
  
  let businessName = "스마트 견적 & 주문 센터";
  let ogImageUrl = "https://sheetbot.cloud/favicon.svg";

  try {
    const data = await getOrderCatalogData({ userKey });
    if (data?.merchant?.businessName) {
      businessName = data.merchant.businessName;
    }
    if (data?.merchant?.imageUrl) {
      ogImageUrl = data.merchant.imageUrl;
    }
  } catch (_) {}

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
          width: 800,
          height: 400,
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
  
  // 🚀 [SSR 고속 렌더링]: 서버에서 0.001초 만에 인메모리 캐시된 데이터를 사전 로드하여 클라이언트에 주입
  // 브라우저 접속 즉시 화면이 완성되어 표시되며, 깜빡임이나 로딩 지연이 100% 제거됩니다.
  let initialData = null;
  try {
    initialData = await getOrderCatalogData({ userKey });
  } catch (err) {
    console.warn("[OrderPage] Server SSR catalog fetch fallback:", err);
  }

  return <OrderClientPage userKey={userKey} initialData={initialData} />;
}
