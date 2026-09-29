import type { Metadata, ResolvingMetadata } from "next";
import { resolveUserEmailFromKey } from "@/lib/user-key-helper";
import { queryTable } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

type Props = {
  params: Promise<{ userKey: string }> | { userKey: string };
  children: React.ReactNode;
};

/**
 * 카카오톡, 문자, SNS 링크 공유 시 표시되는 Open Graph 동적 메타태그 생성
 * 사장님의 실제 상호명(예: chachogreat몰)을 제목과 미리보기에 반영
 */
export async function generateMetadata(
  props: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(props.params);
  const userKey = resolvedParams?.userKey || "";
  let businessName = "스마트 견적 & 주문 센터";

  try {
    await setupDatabase();
    const email = await resolveUserEmailFromKey(userKey);
    if (email) {
      // 1. sheetbot_settings 키-값 저장소 우선 확인
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
        }
      } catch (_) {}

      // 2. sheetbot_users 테이블 확인
      if (businessName === "스마트 견적 & 주문 센터") {
        try {
          const userRes = await queryTable("sheetbot_users", {
            filters: { email },
            limit: 1,
          }).catch(() => ({ rows: [] }));
          if (userRes.rows && userRes.rows.length > 0) {
            const u = userRes.rows[0];
            if (u.business_name && u.business_name.trim()) {
              businessName = u.business_name.trim();
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  const title = `[${businessName}]`;
  const description = `실시간 셀프 견적 및 간편 주문 • ${businessName}`;
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
          url: "https://sheetbot.cloud/favicon.svg",
          width: 512,
          height: 512,
          alt: `${businessName} 셀프 견적 및 간편 주문`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["https://sheetbot.cloud/favicon.svg"],
    },
  };
}

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
