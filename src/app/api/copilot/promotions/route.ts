import { NextResponse } from 'next/server';

export async function GET() {
  const promotionsData = {
    success: true,
    version: '3.3',
    updatedAt: new Date().toISOString(),
    templates: [
      {
        id: 'delivery',
        icon: '📦',
        title: '송장 자동조회',
        tooltip: '배송·송장 실시간 배송상태 자동조회',
        url: 'http://localhost:4004/wrap?tpl=delivery'
      },
      {
        id: 'ocr',
        icon: '🧾',
        title: '영수증 OCR',
        tooltip: '영수증·명함 스마트 AI OCR',
        url: 'http://localhost:4004/wrap?tpl=ocr'
      },
      {
        id: 'kakao',
        icon: '💬',
        title: '알림톡 발송',
        tooltip: '카카오 알림톡/문자 자동 발송',
        url: 'http://localhost:4004/wrap?tpl=kakao'
      },
      {
        id: 'inventory',
        icon: '📊',
        title: '실시간 재고',
        tooltip: '실시간 재고·단가 관리 대장',
        url: 'http://localhost:4004/wrap?tpl=inventory'
      }
    ],
    fdeRecruit: {
      badge: '👨‍💻 파트너스 1기 모집',
      tag: '수익 창출',
      title: '시트 제작 능력을 수익으로 전환하세요',
      desc: '고객 맞춤 자동화 제작 건당 5만~30만원 부수입 창출',
      buttonText: '🚀 공인 FDE 파트너 지원하기',
      url: 'http://localhost:4004/dashboard?modal=fde-recruit'
    },
    kakaoCommunity: {
      title: '시트봇 실시간 해결 오픈채팅',
      subtitle: '막힐 때 실시간 질문 & 자동화 팁 공유',
      buttonText: '입장하기',
      url: 'https://invite.kakao.com/tc/DiKY7rTu0w'
    },
    promoBanner: {
      badge: '📖 1분 사용법',
      headline: 'Google 시트 AI 래핑',
      headlineHighlight: '스크린샷 보며 따라하기',
      features: [
        '복잡한 코딩 없이 안티그라비티 즉시 연동',
        '구글 시트 상단 전용 메뉴 자동 생성'
      ],
      buttonText: '🚀 초간단 사용법 보기',
      url: 'https://sheetbot.cloud/wrap/guide'
    },
    footer: {
      brandName: 'SheetBot',
      subtext: 'Google 시트 AI 업무 자동화 엔진',
      version: 'v3.3 Connected',
      url: 'https://sheetbot.cloud'
    }
  };

  return NextResponse.json(promotionsData, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
