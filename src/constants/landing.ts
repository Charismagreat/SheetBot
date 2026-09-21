import { 
  Sparkles, 
  FileSpreadsheet,
  PlusCircle,
  MessageSquare,
  Mail,
  Cpu,
  ScanText,
  CalendarCheck,
  ShoppingBag,
  Search,
  Vote,
  QrCode,
} from "lucide-react";

// 🔥 대중 반응 폭발 킬러 웹앱 쇼케이스 프리셋 (3x2 그리드 완성)
export const KILLER_WEBAPPS = [
  {
    rank: "🥇 1위",
    title: "0원 모바일 예약 & 웨이팅 접수기",
    target: "식당 · 카페 · 공방 · 1인 미용실 사장님",
    badge: "월정액 0원 • 수수료 0%",
    pain: "캐치테이블/네이버예약 월 3~5만원 수수료 부담",
    solution: "시트에 [이름, 번호, 시간, 인원]만 적으면 감성 예약 웹앱 1초 완성!",
    columns: ["예약자명", "연락처", "일시", "인원수", "요청사항", "확정여부"],
    icon: CalendarCheck,
    color: "from-rose-500 to-pink-600",
    lightColor: "bg-rose-50 border-rose-200 text-rose-700",
    url: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/edit",
    defaultPrompt: "[모바일 예약 웹앱 제작] 이 시트를 기반으로 외부 고객이 스마트폰으로 접속하여 날짜, 시간, 인원을 선택하고 예약을 접수할 수 있는 모바일 반응형 웹앱(Web App)을 배포해줘. 예약 접수 시 시트에 즉시 등록되고 안내 문자가 발송되도록 해줘."
  },
  {
    rank: "🥈 2위",
    title: "인스타 프로필용 '감성 공구 주문서'",
    target: "인스타 셀러 · 블로그 마켓 · 농산물 직거래",
    badge: "네이버 폼 탈피 • 링크트리 일체형",
    pain: "촌스러운 네이버 폼, 복잡한 쇼핑몰 솔루션 구축 비용",
    solution: "링크트리처럼 세련된 모바일 카드 + 수량 선택 + 계좌 복사 일체형 웹앱!",
    columns: ["상품명", "옵션", "판매단가", "주문자명", "배송주소", "입금확인"],
    icon: ShoppingBag,
    color: "from-amber-500 to-orange-600",
    lightColor: "bg-amber-50 border-amber-200 text-amber-700",
    url: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/edit",
    defaultPrompt: "[공구 주문서 웹앱 제작] 이 시트를 기반으로 인스타그램 프로필에 걸 수 있는 세련된 상품 주문서 모바일 웹앱(Web App)을 배포해줘. 고객이 상품과 옵션을 고르고 주소를 입력하면 시트에 실시간 주문이 들어가도록 해줘."
  },
  {
    rank: "🥉 3위",
    title: "전화문의 90% 줄이는 '재고·단가 조회기'",
    target: "도소매 유통 · 부품 대리점 · 쇼핑몰 관리자",
    badge: "원본 시트 100% 보안",
    pain: "하루 50통씩 오는 '재고 있어요? 단가 얼마예요?' 전화",
    solution: "원본 시트는 안전하게 숨김! 품번만 검색하면 재고/단가가 뜨는 전용 검색기!",
    columns: ["상품코드", "상품명", "규격", "현재재고", "도매단가", "창고위치"],
    icon: Search,
    color: "from-blue-500 to-indigo-600",
    lightColor: "bg-blue-50 border-blue-200 text-blue-700",
    url: "https://docs.google.com/spreadsheets/d/1AmOiCgzS2H3FBMJJ8hgSiXprnbUXyKk7sUZmOubEuCY/edit",
    defaultPrompt: "[실시간 재고 조회 웹앱 제작] 이 시트의 원본은 외부에 노출하지 않고, 거래처가 상품코드나 품명을 검색하면 현재 재고 수량과 단가만 안전하게 조회할 수 있는 클라우드 웹앱(Web App)을 배포해줘."
  },
  {
    rank: "🎖️ 4위",
    title: "단톡방 공유용 '점심·회식 실시간 투표기'",
    target: "직장인 막내 · 총무팀 · 동호회 운영진",
    badge: "단톡방 취합 고통 0초 해결",
    pain: "카톡 단톡방에서 '뭐 먹을래요?' 묻고 수동 취합하는 고통",
    solution: "카톡 링크 클릭 한 번으로 투표하고 실시간 득표율 그래프가 짠! 움직이는 웹앱!",
    columns: ["메뉴후보", "득표수", "투표자", "마감시간", "실시간집계"],
    icon: Vote,
    color: "from-teal-500 to-emerald-600",
    lightColor: "bg-teal-50 border-teal-200 text-teal-700",
    url: "NEW_SHEET",
    defaultPrompt: "[실시간 투표 웹앱 제작] 구글 시트에 후보 목록을 두고, 카카오톡 단톡방 링크로 공유할 수 있는 인터랙티브 점심/회식 메뉴 투표 웹앱(Web App)을 배포해줘. 실시간 득표율 그래프가 반영되도록 해줘."
  },
  {
    rank: "🎖️ 5위",
    title: "번호 4자리 '원터치 모바일 출결 키패드'",
    target: "학원 · 스터디룸 · 운동 클래스 · 소모임",
    badge: "출결 기계 0원 대체",
    pain: "매달 수만 원씩 나가는 비싼 지문/얼굴 출결 기계",
    solution: "태블릿이나 폰에 번호 키패드가 뜨고, 뒤 4자리만 누르면 출석 도장 쾅!",
    columns: ["학생명", "전화번호뒤4자리", "출석일자", "출석시간", "지각여부"],
    icon: QrCode,
    color: "from-purple-500 to-indigo-600",
    lightColor: "bg-purple-50 border-purple-200 text-purple-700",
    url: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/edit",
    defaultPrompt: "[원터치 출결 키패드 웹앱 제작] 태블릿이나 모바일 화면에 0~9 번호 키패드가 뜨고, 수강생이 전화번호 뒤 4자리를 입력하면 출석 시간이 시트에 자동 기록되는 출결 웹앱(Web App)을 배포해줘."
  },
  {
    rank: "✨ 맞춤형",
    title: "내 구글 시트로 '나만의 맞춤 웹앱' 만들기",
    target: "사내 특수 업무 · 커스텀 DB · 모든 비즈니스",
    badge: "100% 자율 구성 • 1초 AI 래핑",
    pain: "기성 템플릿에 맞지 않는 복잡한 사내 전용 업무 양식과 시트",
    solution: "내 시트 링크만 넣고 원하는 기능을 적으면 AI가 맞춤형 웹앱을 1초 만에 완성!",
    columns: ["자유 컬럼", "계산 수식", "커스텀 버튼", "원격 배포"],
    icon: Sparkles,
    color: "from-slate-800 to-slate-900",
    lightColor: "bg-slate-100 border-slate-300 text-slate-800",
    url: "NEW_SHEET",
    defaultPrompt: "[맞춤형 웹앱 제작] 이 구글 시트의 데이터를 기반으로 스마트폰과 PC 어디서나 편리하게 조회, 입력, 처리할 수 있는 직관적인 반응형 모바일 웹앱(Web App)을 배포해줘."
  }
];

// 하단 퀵 바로가기 템플릿 프리셋 5종
export const TEMPLATE_SHORTCUTS = [
  {
    id: "new",
    title: "빈 시트로 시작",
    sub: "원클릭 시트 생성",
    projectName: "스마트 자동화 시트",
    defaultPrompt: "내 비즈니스에 맞는 컬럼 구조와 스프레드시트 자동화 함수를 설계하고, 필요한 Apps Script 코드를 주입해줘.",
    icon: PlusCircle,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    url: "NEW_SHEET"
  },
  {
    id: "sms",
    title: "주문 문자 알림",
    sub: "실시간 SMS 발송",
    projectName: "주문 접수 및 실시간 SMS 발송",
    defaultPrompt: "주문 대장 시트에 신규 주문이 추가되거나 발송 체크박스를 선택하면, 고객 연락처로 주문 확인 및 배송 안내 SMS 문자를 자동으로 발송하는 기능을 주입해줘.",
    icon: MessageSquare,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    url: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/edit"
  },
  {
    id: "email",
    title: "Gmail 대량 발송",
    sub: "고객 맞춤 이메일",
    projectName: "Gmail 고객 맞춤 대량 발송",
    defaultPrompt: "고객 명단 시트에서 발송 대상을 선택하고 상단 메뉴를 누르면, 고객 이름과 맞춤 정보를 반영한 정중한 HTML 안내 이메일을 Gmail로 일괄 발송하는 기능을 주입해줘.",
    icon: Mail,
    color: "bg-rose-50 text-rose-600 border-rose-200",
    url: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/edit"
  },
  {
    id: "mes",
    title: "MES·ERP 연동",
    sub: "생산 실적 동기화",
    projectName: "생산 실적 집계 및 MES·ERP 연동",
    defaultPrompt: "생산 라인별 작업 일지와 재고 수량을 집계하고, 일일 마감 통계 및 공정 불량률을 자동으로 산출하여 일일 보고서 탭에 기록하는 기능을 주입해줘.",
    icon: Cpu,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    url: "https://docs.google.com/spreadsheets/d/1AmOiCgzS2H3FBMJJ8hgSiXprnbUXyKk7sUZmOubEuCY/edit"
  },
  {
    id: "ocr",
    title: "명함·영수증 OCR",
    sub: "AI 문서 자동 입력",
    projectName: "명함·영수증 AI 문서 자동 기입",
    defaultPrompt: "구글 시트 사이드바에서 영수증이나 명함 이미지를 업로드하면 AI가 상호명, 금액, 일자, 연락처를 정밀 분석하여 시트 행에 최신순으로 자동 등록하는 기능을 주입해줘.",
    icon: ScanText,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    url: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/edit"
  }
];
