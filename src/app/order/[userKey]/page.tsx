import type { Metadata, ResolvingMetadata } from "next";
import OrderClientPage from "./OrderClientPage";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

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
  let ogImageUrl = "https://sheetbot.cloud/favicon.svg";

  try {
    await setupDatabase();
    const email = await resolveUserEmailFromKey(userKey);
    if (email) {
      // 1. sheetbot_settings 설정 확인
      try {
        const settingRes = await queryTable("sheetbot_settings", {
          filters: { key: `quote_profile_${email}` },
          limit: 1,
        }).catch(() => ({ rows: [] }));
        if (settingRes.rows && settingRes.rows.length > 0) {
          const val = JSON.parse(settingRes.rows[0].value || "{}");
          if (val.businessName && val.businessName.trim()) {
            businessName = val.businessName.trim();
          }
          if (val.ogImageUrl) ogImageUrl = val.ogImageUrl;
          else if (val.imageUrl) ogImageUrl = val.imageUrl;
        }
      } catch (_) {}

      // 2. sheetbot_users 사용자 정보 확인
      if (businessName === "스마트 견적 & 주문 센터" || ogImageUrl === "https://sheetbot.cloud/favicon.svg") {
        try {
          const userRes = await queryTable("sheetbot_users", {
            filters: { email },
            limit: 1,
          }).catch(() => ({ rows: [] }));
          if (userRes.rows && userRes.rows.length > 0) {
            const u = userRes.rows[0];
            if (businessName === "스마트 견적 & 주문 센터" && u.business_name && u.business_name.trim()) {
              businessName = u.business_name.trim();
            }
            if (ogImageUrl === "https://sheetbot.cloud/favicon.svg" && u.quote_image_url) {
              ogImageUrl = u.quote_image_url;
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // 사용자의 요청: 상호명만 [상호명] 형태로 타이틀에 표출 (예: [chachogreat몰])
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
  return <OrderClientPage userKey={userKey} />;
}
