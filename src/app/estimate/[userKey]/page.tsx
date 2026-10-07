import type { Metadata } from "next";
import EstimateClientPage from "./EstimateClientPage";
import { getEstimateCatalogData } from "@/lib/estimate-catalog-helper";

interface Props {
  params: Promise<{ userKey: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userKey } = await params;
  let businessName = "스마트 간편 견적 센터";
  let ogImage = "https://sheetbot.cloud/og-order-preview.png";

  try {
    const data = await getEstimateCatalogData({ userKey });
    if (data?.merchant?.businessName) {
      businessName = data.merchant.businessName;
    }
    if (data?.merchant?.imageUrl) {
      ogImage = data.merchant.imageUrl;
    }
  } catch (_) {}

  const title = `실시간 스마트 간편 견적 • ${businessName}`;
  const description = `구글 시트 단가표 실시간 반영 • 비대면 전자 견적서 즉시 발행 • ${businessName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 800,
          height: 800,
          alt: businessName,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function EstimatePage({ params }: Props) {
  const { userKey } = await params;
  const initialData = await getEstimateCatalogData({ userKey });

  return <EstimateClientPage userKey={userKey} initialData={initialData} />;
}
