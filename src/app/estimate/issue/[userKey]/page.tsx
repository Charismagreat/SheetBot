export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import EstimateIssueClientPage from "../EstimateIssueClientPage";
import { getEstimateCatalogData } from "@/lib/estimate-catalog-helper";

type Props = {
  params: Promise<{ userKey: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userKey } = await params;
  let businessName = "스마트 간편 견적센터";
  let ogImageUrl = "https://sheetbot.cloud/images/og-default.png";

  try {
    const data = await getEstimateCatalogData({ userKey });
    if (data?.merchant?.businessName) {
      businessName = `${data.merchant.businessName} 견적센터`;
    }
    if (data?.businessInfo?.previewImageUrl) {
      ogImageUrl = data.businessInfo.previewImageUrl;
    } else if (data?.merchant?.imageUrl) {
      ogImageUrl = data.merchant.imageUrl;
    }
  } catch (_) {}

  const title = `[${businessName}] 스마트 간편 견적서 발행`;
  const description = `단가표 기반 품목과 수량을 터치하여 30초 만에 공인 전자 견적서를 즉시 발행합니다.`;
  const pageUrl = `https://sheetbot.cloud/estimate/issue/${userKey}`;

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
          width: 1200,
          height: 630,
          alt: `${businessName} 간편 견적`,
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

export default async function EstimateIssueUserKeyPage({ params }: Props) {
  const { userKey } = await params;
  const initialData = await getEstimateCatalogData({ userKey });

  return (
    <EstimateIssueClientPage
      userKey={userKey}
      initialData={initialData}
    />
  );
}
