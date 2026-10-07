export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import EstimateIssueClientPage from "./EstimateIssueClientPage";
import { getEstimateCatalogData } from "@/lib/estimate-catalog-helper";
import { getCurrentUserEmail } from "@/lib/auth";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await searchParams;
  const userKey = (query.userKey as string) || (query.key as string) || "";
  const userEmail = (query.email as string) || "";

  let businessName = "스마트 간편 견적서 발행";
  let ogImageUrl = "https://sheetbot.cloud/images/og-default.png";
  try {
    const data = await getEstimateCatalogData({
      userKey: userKey || undefined,
      directEmail: userEmail || undefined,
    });
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
  const description = "단가표 기반 품목과 수량을 터치하여 30초 만에 공인 전자 견적서를 즉시 발행합니다.";
  const pageUrl = `https://sheetbot.cloud/estimate/issue${userKey ? `?userKey=${userKey}` : ""}`;

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

export default async function EstimateIssuePage({ searchParams }: Props) {
  const query = await searchParams;
  let userKey = (query.userKey as string) || (query.key as string) || "";
  let userEmail = (query.email as string) || "";

  if (!userKey && !userEmail) {
    try {
      const sessionEmail = await getCurrentUserEmail().catch(() => null);
      if (sessionEmail) {
        userEmail = sessionEmail;
      }
    } catch (_) {}
  }

  // 기본 관리자 계정 폴백
  if (!userKey && !userEmail) {
    userEmail = "chachogreat@gmail.com";
  }

  const initialData = await getEstimateCatalogData({
    userKey: userKey || undefined,
    directEmail: userEmail || undefined,
  });

  const effectiveKey = userKey || userEmail || "common";

  return (
    <EstimateIssueClientPage
      userKey={effectiveKey}
      initialData={initialData}
    />
  );
}
