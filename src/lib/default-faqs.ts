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
    category: "Apps Script/기능",
    question: "발주서나 영수증 PDF, 이미지를 구글 시트에 자동으로 넣을 수 있나요?",
    answer: "네! 시트봇의 AI OCR 기능으로 가능합니다. 구글 시트 상단 메뉴 [🚀 SheetBot 자동화]를 누르면 열리는 사이드바에 PDF나 이미지(JPG/PNG) 발주서를 올리면, AI가 문서를 1초 만에 분석하여 시트 양식(품명, 수량, 단가 등)에 맞춰 12개 열 또는 해당 시트 규격대로 자동 기록해 줍니다. 1장에 여러 품목이 있어도 품목별로 1행씩 완벽히 분리되어 최상단에 기록됩니다.",
    sort_order: 7,
  },
  {
    id: "faq_seed_8",
    category: "Apps Script/기능",
    question: "이미 배포된 자동화 프로젝트의 기능을 바꾸고 싶을 때는 어떻게 하나요?",
    answer: "프로젝트 목록의 [요구사항 수정] 버튼을 누르시면 됩니다. AI가 현재 구글 시트 문서 전체를 다시 스캔하여 시트 구조와 실행 계획을 먼저 브리핑해 드립니다. 최대 5회까지 AI와 대화하며 세부 조정을 마친 후 [AI 코드 재배포 실행]을 누르면 구글 시트에 새로운 코드가 즉시 반영됩니다.",
    sort_order: 8,
  },
  {
    id: "faq_seed_9",
    category: "토큰/결제",
    question: "시트에서 AI OCR을 돌리거나 기능을 수정할 때 토큰은 어떻게 기록되나요?",
    answer: "모든 AI 호출은 실시간으로 투명하게 감사 기록됩니다. 웹에서 시트를 분석하거나 대화형 조율을 진행할 때, 그리고 구글 시트 사이드바에서 발주서를 업로드하여 OCR 분석을 돌릴 때 발생하는 모든 토큰 소비량과 비용이 상단 [AI 사용료] 관제 센터(/dashboard/ai-usage)에 실시간으로 1건도 빠짐없이 자동 기록됩니다.",
    sort_order: 9,
  },
  {
    id: "faq_seed_10",
    category: "보안/계정",
    question: "개인 Gemini API 키나 OpenAI API 키를 구글 시트에 등록해야 하나요?",
    answer: "전혀 필요 없습니다! 시트봇은 모든 AI 및 OCR 호출을 이지데스크 중앙 AI 클라우드 터널을 통해 일괄 안전 처리하므로, 사용자가 개인 API 키를 발급받거나 시트에 노출할 위험 없이 원클릭으로 안전하게 자동화 서비스를 이용하실 수 있습니다.",
    sort_order: 10,
  },
  {
    id: "faq_seed_11",
    category: "보안/계정",
    question: "제 스프레드시트의 내부 데이터가 다른 사용자에게 노출되지는 않나요?",
    answer: "절대 노출되지 않습니다. SheetBot은 엄격한 '회원별 데이터 완전 격리(Multi-User Isolation)' 정책을 준수합니다. 본인의 구글 로그인 세션 이메일과 일치하는 프로젝트만 조회·관리되며, 타 회원의 프로젝트나 시트 정보는 데이터베이스 수준에서 원천 차단됩니다.",
    sort_order: 11,
  },
  {
    id: "faq_seed_12",
    category: "보안/계정",
    question: "어떤 AI 모델을 사용하나요? 최신 모델로 변경할 수 있나요?",
    answer: "이지데스크의 고성능 AI Caller를 통해 Google Gemini 3.5 Flash 및 최신 Gemini 3.8 Flash 모델과 실시간 연동되어 있습니다. [AI 모델 환경 설정] 페이지에서 원하는 모델과 Temperature 파라미터를 언제든 자유롭게 변경할 수 있습니다.",
    sort_order: 12,
  },
];
