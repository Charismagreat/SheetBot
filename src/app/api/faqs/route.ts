export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { queryTable, insertRows } from "@/lib/egdesk-helpers";
import { setupDatabase } from "@/lib/setup-db";

const DEFAULT_FAQS = [
  {
    category: "시작하기",
    question: "Google 계정 권한은 왜 필요하고 어떤 권한을 사용하나요?",
    answer: "SheetBot은 사용자의 Google Sheets 스프레드시트를 탐색 및 수정하고, 연결된 Google Apps Script 프로젝트를 생성/배포하기 위해 최소한의 Google Drive 및 Sheets, Script API 권한을 요청합니다. 모든 코드는 사용자의 본인 구글 드라이브 영역 내에서만 안전하게 실행되며, 외부로 데이터가 유출되지 않습니다.",
    sort_order: 1,
  },
  {
    category: "시작하기",
    question: "코딩을 전혀 모르는 비개발자도 쓸 수 있나요?",
    answer: "네! 자연어로 '매일 아침 9시에 재고가 10개 미만인 품목을 찾아 담당자에게 이메일 요약 보고서를 보내줘'와 같이 원하는 작업을 적기만 하면, SheetBot AI가 완벽한 작동 코드와 스케줄 트리거까지 원클릭으로 구글 시트에 탑재해 드립니다.",
    sort_order: 2,
  },
  {
    category: "토큰/결제",
    question: "무료로 제공되는 토큰은 얼마나 되며, 결제는 어떻게 하나요?",
    answer: "신규 가입 시 10,000 Free AI 토큰이 기본 지급되며, 간단한 스크립트 10~20개를 제작할 수 있는 분량입니다. 대량 자동화가 필요하신 경우 [토큰 충전] 메뉴에서 10만/30만/100만 토큰 패키지를 구매하실 수 있습니다.",
    sort_order: 3,
  },
  {
    category: "토큰/결제",
    question: "세금계산서나 현금영수증 발행이 가능한가요?",
    answer: "네! 무통장 입금 및 카드 결제 건에 대해 세금계산서 또는 지출증빙용 현금영수증 발행을 지원합니다. 결제 화면 또는 마이페이지의 '세금계산서 신청'을 통해 사업자등록증 번호를 입력해 주시면 익일 일괄 발급 처리됩니다.",
    sort_order: 4,
  },
  {
    category: "Apps Script/기능",
    question: "기존에 쓰던 복잡한 구글 시트 양식이나 수식이 망가지지 않나요?",
    answer: "SheetBot은 기존 시트의 데이터와 수식을 임의로 덮어쓰지 않습니다. 백업 시트를 생성하거나 별도의 자동화 전용 메뉴 및 탭을 신설하여 안전하게 연동되도록 설계되어 있습니다.",
    sort_order: 5,
  },
  {
    category: "Apps Script/기능",
    question: "매일 특정 시간이나 시트 수정 시 자동으로 돌아가게 할 수 있나요?",
    answer: "네, SheetBot의 '스케줄 대장' 기능을 통해 시간 기반(매시간, 매일 아침 N시, 주간 특정 요일) 트리거와 시트 수정 이벤트(onEdit) 트리거를 대시보드에서 직관적으로 켜고 끌 수 있습니다.",
    sort_order: 6,
  },
  {
    category: "보안/계정",
    question: "우리 회사의 소중한 시트 데이터가 AI 학습에 쓰이나요?",
    answer: "절대 쓰이지 않습니다. SheetBot은 엔터프라이즈 레벨의 보안 정책을 준수하며, 스크립트 생성 시 참조되는 시트 메타데이터는 오직 코드 생성 세션 중에만 일시 참조되며 AI 모델의 재학습 데이터로 보관되거나 활용되지 않습니다.",
    sort_order: 7,
  },
  {
    category: "보안/계정",
    question: "생성된 Apps Script 소스코드를 직접 수정하거나 다운로드할 수 있나요?",
    answer: "물론입니다! SheetBot 대시보드의 '스크립트 에디터'에서 실시간으로 코드를 열람 및 직접 수정할 수 있으며, 구글 시트 내부의 확장 프로그램 > Apps Script 메뉴에서도 직접 코드를 확인하고 다운로드하실 수 있습니다.",
    sort_order: 8,
  },
];

export async function GET(req: NextRequest) {
  try {
    await setupDatabase();

    const res = await queryTable("sheetbot_faqs", {
      orderBy: "sort_order",
      orderDirection: "ASC",
      limit: 100,
    }).catch(() => ({ rows: [] }));

    let validRows = (res.rows || []).filter((r: any) => !r.deleted_at);

    // 테이블이 비어있는 경우 기본 FAQ 시드 주입
    if (validRows.length === 0) {
      const now = new Date().toISOString();
      const seedRows = DEFAULT_FAQS.map((faq, idx) => ({
        id: `faq_seed_${idx + 1}`,
        category: faq.category,
        question: faq.question,
        answer: faq.answer,
        sort_order: faq.sort_order,
        created_at: now,
        updated_at: now,
        updated_by: "system_seed",
        deleted_at: null,
      }));

      await insertRows("sheetbot_faqs", seedRows).catch(() => {});
      validRows = seedRows;
    }

    return NextResponse.json({ success: true, faqs: validRows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, faqs: DEFAULT_FAQS }, { status: 500 });
  }
}
