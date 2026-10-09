import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface MarketplaceCardItem {
  key: string;
  title: string;
  icon: string;
  category: 'all' | 'store' | 'crm' | 'ai' | 'exclusive';
  categoryName: string;
  description: string;
  badge?: string;
  author: string;
  isExclusive: boolean;
  allowedEmails?: string[];
  isInstalledByDefault: boolean;
  version: string;
  updatedAt: string;
}

// 🛍️ 시트봇 카드 마켓플레이스 기본 내장 카탈로그
const DEFAULT_CATALOG: MarketplaceCardItem[] = [
  // 1. 매장 · 정산 카테고리
  {
    key: 'cardTaxInvoice',
    title: '전자세금계산서 원클릭 발행',
    icon: '🧾',
    category: 'store',
    categoryName: '매장 · 정산',
    description: '홈택스 연동 없이 구글 시트 거래처 내역에서 1초 만에 전자세금계산서/계산서를 자동 발행하고 국세청에 전송합니다.',
    badge: 'NEW',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: false,
    version: '1.0.0',
    updatedAt: '2026-10-09',
  },
  {
    key: 'cardPaymentReceipt',
    title: '매장 결제 확인 & 영수증 문자',
    icon: '💳',
    category: 'store',
    categoryName: '매장 · 정산',
    description: '은행 입금 및 카드 결제 알림을 실시간 감지하여 구글 시트 매출 장부에 자동 기록하고 고객에게 감사 문자를 발송합니다.',
    badge: '인기',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.1.0',
    updatedAt: '2026-10-08',
  },
  {
    key: 'cardEstimateSync',
    title: '간편 견적서 발행 대장',
    icon: '📑',
    category: 'store',
    categoryName: '매장 · 정산',
    description: '단가표 기반으로 모바일에서 원터치 견적서를 생성하고, 세련된 견적 카드 이미지와 함께 카카오톡/문자로 즉시 발송합니다.',
    badge: '추천',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-07',
  },
  {
    key: 'cardQuoteSync',
    title: '간편 주문 접수 기록',
    icon: '📦',
    category: 'store',
    categoryName: '매장 · 정산',
    description: '고객 주문 내역을 폼 링크로 접수받아 구글 시트 주문 대장에 실시간 적재하고 주문 접수 확인증을 자동 생성합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-07',
  },

  // 2. 고객 · 영업 (CRM) 카테고리
  {
    key: 'cardCallRecording',
    title: '통화 녹음 AI 전사 & 상담 요약',
    icon: '🎙️',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '스마트폰 통화 녹음 파일을 구글 드라이브에 안전 백업하고 Gemini AI가 상담 요약, 할 일, 핵심 안건을 3줄로 정리해 시트에 적재합니다.',
    badge: 'HOT',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.2.0',
    updatedAt: '2026-10-09',
  },
  {
    key: 'cardInCallSummary',
    title: '수신 통화 시 고객 요약 팝업',
    icon: '📞',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '전화가 걸려오는 순간 화면 상단에 구글 시트 고객 정보(성함, 최근 주문내역, 직전 통화 메모)를 0초 만에 플로팅 표출합니다.',
    badge: '필수',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.1.0',
    updatedAt: '2026-10-08',
  },
  {
    key: 'cardCallEnded',
    title: '통화 종료 후 모바일 명함 발송',
    icon: '🪪',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '상담이나 통화가 끝나면 화면에 원터치 팝업이 떠서 대표님 모바일 명함 및 회사 소개 링크를 1초 만에 문자로 회신합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardMissedCall',
    title: '부재중 전화 자동 답장',
    icon: '📴',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '미팅 중이거나 운전 중 부재중 전화 발생 시 미리 설정한 정중한 안내 문자 및 문의 접수 링크를 자동으로 답장합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardSmsSync',
    title: '스마트폰 문자 시트 동기화',
    icon: '💬',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '특정 고객 또는 지정 번호로 주고받은 모든 SMS/LMS 메시지를 구글 시트 대장에 실시간 안전 보관합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardKakaoSync',
    title: '카카오톡 비즈니스 대화 기록',
    icon: '🟡',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '카카오톡으로 수신된 고객 주문 및 상담 알림톡을 시트에 실시간 분류 적재합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardContactsBackup',
    title: '스마트폰 연락처 시트 백업',
    icon: '📇',
    category: 'crm',
    categoryName: '고객 · 영업',
    description: '스마트폰 주소록 전체를 구글 시트로 백업하고 엑셀 형식으로 관리합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },

  // 3. AI 자동화 & 마케팅 카테고리
  {
    key: 'cardInventory',
    title: '스마트 실시간 재고 관리',
    icon: '📊',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '입출고 사진 또는 바코드 스캔 한 번으로 구글 시트 재고 수량을 자동 차감/가산하고 안전 재고 미달 시 비상 알림을 전송합니다.',
    badge: 'NEW',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: false,
    version: '1.0.0',
    updatedAt: '2026-10-09',
  },
  {
    key: 'cardAttendance',
    title: '직원 출퇴근 체크 & 급여 계산',
    icon: '⏰',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '매장 와이파이 또는 QR 코드로 출퇴근을 인증하면 시트에 근무 시간이 자동 기록되고 월말 주휴수당/급여가 자동 산출됩니다.',
    badge: 'NEW',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: false,
    version: '1.0.0',
    updatedAt: '2026-10-09',
  },
  {
    key: 'cardReviewReply',
    title: '배달앱/플레이스 리뷰 AI 답글',
    icon: '💬',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '배민, 요기요, 네이버 플레이스 고객 리뷰를 AI가 분석하여 정성스럽고 진정성 있는 맞춤 답글을 시트에서 즉시 생성합니다.',
    badge: '인기',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: false,
    version: '1.0.0',
    updatedAt: '2026-10-09',
  },
  {
    key: 'cardBlog',
    title: 'AI 네이버 블로그 자동 포스팅',
    icon: '✍️',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '사진 몇 장과 핵심 키워드만 입력하면 상위 노출에 최적화된 고품질 홍보 블로그 글을 AI가 자동으로 작성하고 발행합니다.',
    badge: '추천',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-07',
  },
  {
    key: 'cardInsta',
    title: 'AI 인스타그램 피드 자동 발행',
    icon: '📸',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '매장 상품 사진에 맞는 감성 캡션과 해시태그를 생성하고 인스타그램 계정으로 즉시 예약/업로드합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-07',
  },
  {
    key: 'cardSite',
    title: 'AI 모바일 홈페이지 제작',
    icon: '🌐',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '구글 시트에 적힌 매장 정보와 상품 가격을 바탕으로 0초 만에 스마트폰 전용 모바일 웹사이트를 생성하고 도메인을 연결합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.1.0',
    updatedAt: '2026-10-07',
  },
  {
    key: 'cardCompanyResearch',
    title: '원클릭 기업 심층 리서치',
    icon: '🏢',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '사업자등록번호나 회사명 입력 시 공공데이터와 웹을 크롤링하여 기업 개요, 재무 상태, 입찰 공고를 시트에 브리핑합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardLawAdvisory',
    title: 'AI 법률/계약서 팩트체크',
    icon: '⚖️',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '계약서 사진이나 법률 조항을 올리면 최신 대한민국 법률과 대법원 판례를 기반으로 불리한 독소조항을 팩트체크합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardLinkScrap',
    title: '웹 링크 & 유튜브 3줄 요약',
    icon: '🔗',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '유튜브 영상 링크나 뉴스 기사 URL을 공유하면 핵심 내용을 3줄로 즉시 요약하여 지식 베이스 시트에 저장합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardMeetingRecording',
    title: '회의 녹음 자동 회의록',
    icon: '👥',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '회의나 미팅 음성 녹음본을 화자별로 분리하고 결정 사항과 액션 아이템을 도출하여 구글 시트 회의록으로 자동 정리합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardWebsiteMonitor',
    title: '웹사이트 실시간 장애 감시',
    icon: '🚨',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '대표님의 쇼핑몰이나 회사 웹사이트가 다운되거나 500 오류가 발생하면 스마트폰으로 즉각 비상 경보 음성을 울립니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  {
    key: 'cardFileUpload',
    title: '사진 & 문서 드라이브 보관',
    icon: '📁',
    category: 'ai',
    categoryName: 'AI 자동화',
    description: '영수증, 명함, 서류 사진을 촬영하면 OCR로 텍스트를 추출해 시트에 장부화하고 구글 드라이브에 자동 분류 저장합니다.',
    author: '시트봇 공식',
    isExclusive: false,
    isInstalledByDefault: true,
    version: '2.0.0',
    updatedAt: '2026-10-06',
  },
  // 5. 나만의 맞춤 전용 카드 (chachogreat@gmail.com 전담)
  {
    key: 'cardVipCustomAuto',
    title: '👑 VIP 프라이빗 자동화 센터 (차호석 대표님 전용)',
    icon: '👑',
    category: 'exclusive',
    categoryName: '나만의 맞춤 카드',
    description: '차호석 대표님(chachogreat@gmail.com)만을 위해 특별 설계된 맞춤형 올인원 비즈니스 대시보드 및 지능형 알림 관제 카드입니다.',
    badge: 'VIP전용',
    author: '시트봇 파트너스',
    isExclusive: true,
    allowedEmails: ['chachogreat@gmail.com', 'charismagreat@gmail.com'],
    isInstalledByDefault: false,
    version: '1.0.0',
    updatedAt: '2026-10-09',
  },
];

import { queryTable } from '@/lib/egdesk-helpers';

/**
 * 🛍️ GET /api/user/cards/catalog
 * - 전체 공개 카드 카탈로그 제공
 * - sheetbot_marketplace_cards 테이블의 동적 CMS 등록 카드 자동 병합 (DB 카드 우선)
 * - 사용자 이메일 기준 특정 사용자 전용(Private/Exclusive) 카드 병합 필터링
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userEmail = (
      searchParams.get('email') ||
      searchParams.get('userEmail') ||
      req.headers.get('x-sheetbot-user-email') ||
      ''
    ).trim().toLowerCase();

    // 1. 기본 카탈로그를 맵으로 초기화 (key 기준)
    const cardMap = new Map<string, MarketplaceCardItem>();
    for (const card of DEFAULT_CATALOG) {
      cardMap.set(card.key, { ...card });
    }

    // 2. DB(sheetbot_marketplace_cards)에서 활성/출시준비 카드 조회 및 동적 병합
    try {
      const dbRes = await queryTable('sheetbot_marketplace_cards', {
        orderBy: 'display_order',
        orderDirection: 'ASC',
        limit: 200,
      });

      if (dbRes?.rows && Array.isArray(dbRes.rows)) {
        for (const r of dbRes.rows) {
          // 소프트 삭제된 카드는 제외
          if (r.deleted_at) continue;

          // 비활성(INACTIVE) 상태인 경우 카탈로그에서 제거
          if (r.status === 'INACTIVE') {
            cardMap.delete(r.key);
            continue;
          }

          // DB에 등록된 카드로 병합 (새 카드 추가 또는 기존 기본 카드 덮어쓰기)
          const emails: string[] = r.allowed_emails
            ? r.allowed_emails.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean)
            : [];

          const dbCardItem: MarketplaceCardItem = {
            key: r.key,
            title: r.title,
            icon: r.icon || '⚡',
            category: (r.category || 'ai') as MarketplaceCardItem['category'],
            categoryName: r.category_name || 'AI 자동화',
            description: r.description || '',
            badge: r.badge || undefined,
            author: r.author || '시트봇 공식',
            isExclusive: Boolean(r.is_exclusive),
            allowedEmails: emails.length > 0 ? emails : undefined,
            isInstalledByDefault: Boolean(r.is_installed_by_default),
            version: r.version || '1.0.0',
            updatedAt: r.updated_at ? r.updated_at.split('T')[0] : '2026-10-09',
          };

          cardMap.set(r.key, dbCardItem);
        }
      }
    } catch (dbErr) {
      console.warn('[Cards-Catalog] DB 동적 카드 조회 실패, 기본 카탈로그로 폴백:', dbErr);
    }

    // 3. 전체 카드 목록에서 권한(전용 카드 여부) 필터링
    const allCards = Array.from(cardMap.values());
    const resultCards: MarketplaceCardItem[] = allCards.filter(card => {
      // 전체 공개 카드인 경우 무조건 포함
      if (!card.isExclusive) return true;

      // 특정 사용자 전용 카드인 경우, 이메일 일치 시에만 포함
      if (card.isExclusive && userEmail) {
        return card.allowedEmails?.some(e => e.toLowerCase() === userEmail) ?? false;
      }

      return false;
    });

    // 4. 카테고리 메타데이터
    const categories = [
      { id: 'all', name: '전체 보기', icon: '🌟' },
      { id: 'store', name: '매장 · 정산', icon: '🏪' },
      { id: 'crm', name: '고객 · 영업', icon: '👥' },
      { id: 'ai', name: 'AI 자동화', icon: '🤖' },
      { id: 'exclusive', name: '나만의 맞춤 카드', icon: '🔒' },
    ];

    return NextResponse.json({
      success: true,
      totalCount: resultCards.length,
      categories,
      cards: resultCards,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to get card marketplace catalog:', errorMsg);
    return NextResponse.json(
      { success: false, error: '카탈로그를 불러오는데 실패했습니다: ' + errorMsg },
      { status: 500 }
    );
  }
}
