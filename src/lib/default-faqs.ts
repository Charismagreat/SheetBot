export interface DefaultFaqItem {
  id: string;
  category: "시작하기" | "토큰/결제" | "Apps Script/기능" | "보안/계정";
  question: string;
  answer: string;
  sort_order: number;
}

export const DEFAULT_FAQS: DefaultFaqItem[] = [
  {
    id: "faq_seed_1",
    category: "시작하기",
    question: "Google Apps Script 코딩 경험이 전혀 없어도 이용할 수 있나요?",
    answer: "네, 완전히 가능합니다! SheetBot은 복잡한 자바스크립트 문법 대신 '매일 특정 시트에 합산해줘'와 같은 자연어 명령만 입력하면 AI가 실행 가능한 완전한 코드를 생성하고, 구글 클라우드와 터널을 통해 대상 시트에 원클릭으로 주입해 줍니다.",
    sort_order: 1,
  },
  {
    id: "faq_seed_2",
    category: "시작하기",
    question: "자동화하려는 구글 시트의 권한은 어떻게 주어야 하나요?",
    answer: "로그인하신 구글 계정에 편집 권한이 있는 시트라면 별도의 복잡한 공유 설정 없이 시트 URL만 등록하면 됩니다. 브라우저 주소창의 'https://docs.google.com/spreadsheets/d/...' URL을 그대로 복사하여 프로젝트 생성창에 붙여넣으시면 됩니다.",
    sort_order: 2,
  },
  {
    id: "faq_seed_3",
    category: "토큰/결제",
    question: "매월 자동 결제되는 정기 구독(월정액) 방식인가요?",
    answer: "아닙니다. SheetBot은 쓰지도 않는 월 구독료가 나가는 방식이 아닌, 원하는 만큼만 결제해 충전해서 사용하는 '선불형 토큰 지갑' 방식입니다. 충전하신 토큰은 유효기간 없이 평생 보관되며, 수식을 생성하거나 스크립트를 배포할 때만 소모됩니다.",
    sort_order: 3,
  },
  {
    id: "faq_seed_4",
    category: "토큰/결제",
    question: "결제 후 영수증(매출전표)이나 세금계산서, 현금영수증을 발급받을 수 있나요?",
    answer: "네! [토큰 충전 & 요금제] 페이지 하단의 '내 최근 충전/결제 대장'에서 [🧾 영수증] 버튼을 누르면 부가세(10%)가 분리 표기된 정식 신용카드 매출전표를 즉시 인쇄하거나 PDF로 저장할 수 있습니다. 사업자 지출증빙을 위한 [📑 계산서 / 현금영수증] 신청도 원클릭으로 접수 가능합니다.",
    sort_order: 4,
  },
  {
    id: "faq_seed_5",
    category: "Apps Script/기능",
    question: "시트를 닫아두어도 스케줄(트리거)이 자동으로 돌아가나요?",
    answer: "네, 그렇습니다! Google Apps Script의 시간 기반 트리거(Time-driven Trigger)를 구글 클라우드 서버에 직접 등록하기 때문에, 사용자가 컴퓨터를 끄거나 브라우저를 닫아두어도 구글 서버에서 약속된 주기(예: 매일 자정, 매주 월요일 등)에 맞춰 자동으로 스크립트가 실행됩니다.",
    sort_order: 5,
  },
  {
    id: "faq_seed_6",
    category: "Apps Script/기능",
    question: "시트에 있는 기존 데이터가 덮어씌워지거나 지워질 위험은 없나요?",
    answer: "SheetBot이 생성하는 모든 코드는 '안전 우선(Safety-First)' 원칙을 준수합니다. 기존 데이터를 삭제하기 전 검증하거나, 신규 데이터를 항상 마지막 행 아래에 누적(Append)하도록 기본 설계되며, 구글 시트 상단 메뉴에 '시트봇 자동화' 전용 메뉴가 생겨 안전하게 수동 테스트 후 스케줄을 가동할 수 있습니다.",
    sort_order: 6,
  },
  {
    id: "faq_seed_7",
    category: "보안/계정",
    question: "제 스프레드시트의 내부 데이터가 다른 사용자에게 노출되지는 않나요?",
    answer: "절대 노출되지 않습니다. SheetBot은 엄격한 '회원별 데이터 완전 격리(Multi-User Isolation)' 정책을 준수합니다. 본인의 구글 로그인 세션 이메일과 일치하는 프로젝트만 조회·관리되며, 타 회원의 프로젝트나 시트 정보는 데이터베이스 수준에서 원천 차단됩니다.",
    sort_order: 7,
  },
  {
    id: "faq_seed_8",
    category: "보안/계정",
    question: "어떤 AI 모델을 사용하나요? 최신 모델로 변경할 수 있나요?",
    answer: "이지데스크의 고성능 AI Caller를 통해 Google Gemini 3.5 Flash 및 최신 Gemini 3.8 Flash 모델과 실시간 연동되어 있습니다. [AI 모델 환경 설정] 페이지에서 원하는 모델과 Temperature 파라미터를 언제든 자유롭게 변경할 수 있습니다.",
    sort_order: 8,
  },
];
