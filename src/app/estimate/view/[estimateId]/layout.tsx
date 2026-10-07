import type { Metadata } from "next";
import { queryTable } from "@/lib/egdesk-helpers";

type Props = {
  params: Promise<{ estimateId: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: { params: Promise<{ estimateId: string }> }): Promise<Metadata> {
  const { estimateId } = await params;

  let customerName = "고객";
  let totalAmount = "";
  let merchantName = "스마트 견적센터";
  let ogImageUrl = "https://sheetbot.cloud/images/og-default.png";

  try {
    const res = await queryTable("sheetbot_estimates", {
      filters: { id: estimateId },
      limit: 1,
    });
    if (res?.rows && res.rows.length > 0) {
      const row = res.rows[0];
      if (row.customer_name) customerName = row.customer_name;
      if (row.total_amount) totalAmount = ` (${Number(row.total_amount).toLocaleString()}원)`;
      const userEmail = row.user_email;

      if (userEmail) {
        // 사장님 프로필 조회
        const settingRes = await queryTable("sheetbot_settings", {
          filters: { key: `quote_profile_${userEmail}` },
          limit: 1,
        });
        if (settingRes?.rows && settingRes.rows.length > 0) {
          const val = JSON.parse(settingRes.rows[0].value || "{}");
          if (val.businessName) merchantName = val.businessName;
          if (val.ogImageUrl) ogImageUrl = val.ogImageUrl;
          else if (val.imageUrl) ogImageUrl = val.imageUrl;
        }
      }
    }
  } catch (_) {}

  const title = `[${merchantName}] ${customerName}님을 위한 전자 견적서`;
  const description = `견적 금액${totalAmount} • 견적 상세 내역을 확인하고 온라인에서 원터치로 승인하세요.`;
  const pageUrl = `https://sheetbot.cloud/estimate/view/${estimateId}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: merchantName,
      type: "website",
      locale: "ko_KR",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${merchantName} 견적서`,
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

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
