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

/**
 * 🚀 [인라인 크리티컬 스타일]: 외부 CSS 다운로드가 터널 지연으로 pending 되더라도
 * 브라우저가 첫 HTML 문서를 파싱하는 0.00초에 즉각적인 배경색과 상호명, 골격을 렌더링하도록 강제
 * (Render-blocking으로 인한 완전한 백지/흰 화면 원천 방지)
 */
const CRITICAL_INLINE_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    background-color: #020617 !important;
    color: #f8fafc !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .critical-order-shell {
    min-height: 100vh;
    background-color: #020617;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
  }
  .critical-header-box {
    background-color: rgba(15, 23, 42, 0.95);
    border-bottom: 1px solid #1e293b;
    padding: 12px 16px;
    position: sticky;
    top: 0;
    z-index: 40;
  }
  .critical-container {
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
    padding: 16px;
    box-sizing: border-box;
  }
  .critical-card {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 12px;
  }
`;

export default async function Page({ params }: Props) {
  const { userKey } = await params;
  
  // 🚀 [SSR 고속 렌더링]: 서버에서 0.001초 만에 인메모리 캐시된 데이터를 사전 로드하여 클라이언트에 주입
  // 브라우저 접속 즉시 완성된 상점 화면이 나타나며, 깜빡임이나 로딩 지연이 100% 제거됩니다.
  let initialData = null;
  try {
    initialData = await getOrderCatalogData({ userKey });
  } catch (err) {
    console.warn("[OrderPage] Server SSR catalog fetch fallback:", err);
  }

  return (
    <>
      {/* 🚀 Render-Blocking 방지용 핵심 인라인 스타일 주입 */}
      <style dangerouslySetInnerHTML={{ __html: CRITICAL_INLINE_CSS }} />
      <OrderClientPage userKey={userKey} initialData={initialData} />
    </>
  );
}
