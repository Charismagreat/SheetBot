/**
 * SheetBot 공식 마켓플레이스 템플릿 데이터 정의
 */

export interface MarketplaceTemplate {
  id: string;
  title: string;
  category: "MARKETING" | "AUTOMATION" | "AI_OCR";
  categoryLabel: string;
  badge: string;
  tagline: string;
  summary: string;
  priceKrw: number;
  isFree: boolean;
  downloadsCount: number;
  rating: number;
  reviewsCount: number;
  icon: string;
  gradient: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  copyUrl: string;
  gasProjectId: string;
  keyFeatures: string[];
  recommendedFor: string[];
  techStack: string[];
  usageGuide: string[];
}

export const MARKETPLACE_TEMPLATES: MarketplaceTemplate[] = [
  {
    id: "tpl_sms_bulk",
    title: "[문자 일괄 전송 시트]",
    category: "MARKETING",
    categoryLabel: "마케팅 & 고객관리",
    badge: "비용 0원 킬러 솔루션",
    tagline: "통신사 API 비용 없이 개인 스마트폰으로 월 수천 건 무료 문자 일괄 발송",
    summary:
      "스마트폰 요금제의 기본 무료 문자를 Google 스프레드시트와 실시간 연동하여, 선택한 수백 명의 고객에게 개인화된 메시지를 클릭 한 번으로 대량 발송합니다. 3중 중복 발송 차단 및 SQLite 대장 동기화가 기본 제공됩니다.",
    priceKrw: 0,
    isFree: true,
    downloadsCount: 1420,
    rating: 4.95,
    reviewsCount: 88,
    icon: "MessageSquare",
    gradient: "from-blue-600 to-indigo-600",
    spreadsheetId: "197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/edit",
    copyUrl: "https://docs.google.com/spreadsheets/d/197paXClC1QLJV88e_TranJffhTt4UGU9FBcqnYQhcwE/copy",
    gasProjectId: "25bdf0d8-6162-4af4-8aa9-707ac45a47d9",
    keyFeatures: [
      "스마트폰(안드로이드) 실시간 페어링 및 실제 무료 문자 발송",
      "전화번호, 최근 발송일, 이름 기준 3중 중복 발송 방지 안전장치",
      "선택 행(A열 체크박스) 일체형 사전 승인 알림창",
      "성공/실패 셀 배경색 실시간 스타일링 & 결과 메시지 기입",
      "구글 드라이브 SheetBot_Databases 폴더 내 SQLite 백업 동기화",
      "자연어 Text-to-SQL 대장 조건 검색 전용 사이드바 탑재",
    ],
    recommendedFor: [
      "월 문자 발송 비용이 부담스러운 1인 기업 및 소상공인",
      "예약 안내, 행사 공지, 결제 확인 문자를 자주 보내는 학원/병원",
      "고객 관리(CRM)를 구글 시트 하나로 끝내고 싶은 영업직",
    ],
    techStack: ["Google Apps Script", "EGDesk Phone MCP", "SQLite 3", "Tailwind CSS"],
    usageGuide: [
      "1. [사본 만들기]를 눌러 본인 구글 드라이브로 시트를 복제합니다.",
      "2. 시트 상단 🚀 SheetBot 메뉴 ➔ ⚡ 터널 연결 상태 점검을 클릭하여 연동을 확인합니다.",
      "3. 2행부터 수신자 목록을 작성하고 A열 체크 후 [발송] 선택 행 문자 일괄 발송을 누르면 즉시 전송됩니다.",
    ],
  },
  {
    id: "tpl_gmail_bulk",
    title: "[SheetBot] Gmail 안내 이메일 일괄 발송 대장",
    category: "AUTOMATION",
    categoryLabel: "업무자동화 & 이메일",
    badge: "일일 100~1,500통 무료",
    tagline: "상용 메일 솔루션 없이 모던 반응형 HTML 카드 메일을 원클릭 발송",
    summary:
      "Google Apps Script 네이티브 GmailApp 엔진을 활용하여 별도 외부 API 키 없이 구글 계정 무료 쿼터로 고급스러운 반응형 HTML 카드 메일을 대량 전송합니다. 실시간 일일 쿼터 확인 및 SQLite 발송 감사 대장을 완비했습니다.",
    priceKrw: 0,
    isFree: true,
    downloadsCount: 1850,
    rating: 4.98,
    reviewsCount: 112,
    icon: "Mail",
    gradient: "from-indigo-600 to-violet-600",
    spreadsheetId: "1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/edit",
    copyUrl: "https://docs.google.com/spreadsheets/d/1oyr_On_t2zV2Ii5w3rX2QWHuHYoQgAwQduvJ-J1nWPA/copy",
    gasProjectId: "d7ee58ea-2a39-46bb-992d-7edbb134fd7c",
    keyFeatures: [
      "Google 네이티브 GmailApp 직접 발송 (외부 상용 키 불필요)",
      "MailApp.getRemainingDailyQuota() 실시간 잔여 통수 사전 검증",
      "MIME 특수문자 깨짐 없는 모던 반응형 HTML 카드 이메일 서식",
      "발송 성공(연초록), 실패(연빨강) 실시간 셀 서식 피드백",
      "드라이브 SheetBot_Databases/.sqlite 이력 자동 저장",
      "초보자를 위한 샘플 데이터 1초 자동 세팅 기능 완비",
    ],
    recommendedFor: [
      "고객 뉴스레터, 주문 확인 메일을 정기 발송하는 쇼핑몰 운영자",
      "웨비나, 세미나, 사내 공지를 일괄 안내해야 하는 기획자",
      "Stibee나 Mailchimp 등 유료 메일 서비스 비용을 절감하고 싶은 스타트업",
    ],
    techStack: ["Google Apps Script", "GmailApp & MailApp", "Responsive HTML", "SQLite"],
    usageGuide: [
      "1. [사본 만들기]를 눌러 시트를 복제한 후 새로고침(F5)합니다.",
      "2. 상단 메뉴 ➔ 📊 [점검] 오늘 남은 Gmail 무료 발송 잔여량 확인을 눌러 통수를 확인합니다.",
      "3. A열 체크박스 선택 후 ✉️ [발송] 선택 행 안내 이메일 일괄 발송을 누르면 끝!",
    ],
  },
  {
    id: "tpl_business_card_ocr",
    title: "[SheetBot] 명함 기록 대장 (AI OCR)",
    category: "AI_OCR",
    categoryLabel: "영업관리 & AI 비전 OCR",
    badge: "Gemini 3.8 Flash 탑재",
    tagline: "명함 사진/PDF를 올리면 AI가 9대 항목 자동 추출 & Drive 원본 및 SQLite 양방향 동기화",
    summary:
      "카메라로 찍은 명함 사진이나 스캔 PDF를 사이드바에 드래그하면, Gemini 3.8 Flash 비전 AI가 성명, 회사명, 직책, 휴대폰, 대표전화, 이메일, 주소, 웹사이트, 메모를 1초 만에 추출하여 시트 최상단에 자동 기입합니다. 원본 드라이브 보관 및 3중 중복 감지가 완비되어 있습니다.",
    priceKrw: 0,
    isFree: true,
    downloadsCount: 2310,
    rating: 5.0,
    reviewsCount: 145,
    icon: "CreditCard",
    gradient: "from-emerald-600 to-teal-600",
    spreadsheetId: "1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/edit",
    copyUrl: "https://docs.google.com/spreadsheets/d/1PbE0jDn7-k70ZH2mEWRf3VoW6IjGlVgF4UOQiA75niE/copy",
    gasProjectId: "47580f8f-5b92-4c50-8710-1fd954bd2eaf",
    keyFeatures: [
      "전용 업로드 사이드바 (파일 교체, 취소, 상시 초기화, 연속 등록 완비)",
      "Gemini 3.8 Flash 비전 OCR 9대 핵심 비즈니스 항목 정밀 추출",
      "구글 드라이브 SheetBot_BusinessCards 폴더 원본 자동 보관 & 링크 생성",
      "휴대폰, 이메일, 성명+회사명 3중 중복 감지 및 자동 하이라이트",
      "시트 2행 최상단 자동 삽입 & SQLite 양방향 동기화 CRUD",
      "자연어 질문 시 SQL로 변환하여 조회하는 AI Text-to-SQL 사이드바",
    ],
    recommendedFor: [
      "미팅 후 명함 정리에 매주 수시간을 소모하는 영업 대표 및 B2B 마케터",
      "인맥 데이터를 엑셀 대신 안전한 클라우드 DB로 구축하고 싶은 임원진",
      "명함 원본 사진과 텍스트를 함께 영구 보관하고 싶은 모든 직장인",
    ],
    techStack: ["Google Apps Script", "Gemini 3.8 Flash Vision", "Google Drive API", "SQLite 3"],
    usageGuide: [
      "1. [사본 만들기]를 눌러 본인의 구글 드라이브에 시트를 생성합니다.",
      "2. 상단 메뉴 ➔ 📷 [등록] 명함 사진 업로드 및 AI 자동 등록을 실행합니다.",
      "3. 명함 사진이나 PDF를 드래그하여 올리면 AI가 즉시 분석하여 시트에 기록합니다.",
    ],
  },
];
