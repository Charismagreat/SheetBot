/**
 * SheetBot 공식 마켓플레이스 템플릿 데이터 정의
 */

export interface MarketplaceTemplate {
  id: string;
  title: string;
  category: "MARKETING" | "AUTOMATION" | "AI_OCR" | "VOICE_AI";
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
      "2. 시트 상단 🚀 SheetBot 메뉴 ➔ 🤖 SheetBot AI 코파일럿을 열어 터널 정상 연결(초록불)을 확인합니다.",
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
  {
    id: "tpl_voice_intelligence_crm",
    title: "[통화 녹음 AI 분석 & 스마트 CRM 대장]",
    category: "VOICE_AI",
    categoryLabel: "음성 AI & 통화 인텔리전스",
    badge: "최신 킬러 솔루션",
    tagline: "통화 녹음 파일 업로드로 화자분리 전사, 원클릭 화자 교정 & 3초 지표 재산출, 3줄 요약, PII 마스킹 및 스마트 오디오 CRM 구축",
    summary:
      "통화 녹음 오디오(MP3, M4A, WAV 등)를 드래그 앤 드롭하면 음성 AI가 화자별(상담원/고객) 대화록을 분리 전사하고, 개인정보(주민/카드/계좌번호)를 자동 비식별화합니다. 핵심 3줄 요약, 고객 감정 점수, 구매 의향 및 이탈 위험도(Churn Risk)를 자동 산출하며, 화자가 뒤바뀐 경우 원클릭 맞바꾸기 및 3초 지표 재산출을 지원합니다. 사이드바 미니 오디오 플레이어에서 타임스탬프 클릭 시 해당 발화 구간으로 즉시 이동 재생되며, 초보자도 안심하고 쓸 수 있는 대장 동기화 및 자연어 대장 검색을 완벽 지원합니다.",
    priceKrw: 0,
    isFree: true,
    downloadsCount: 890,
    rating: 4.98,
    reviewsCount: 54,
    icon: "Mic",
    gradient: "from-indigo-600 via-purple-600 to-slate-900",
    spreadsheetId: "11V1oYLJl3fHafrX7h051u9zDOq_zzk8s0UyaFrnP7Ds",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/11V1oYLJl3fHafrX7h051u9zDOq_zzk8s0UyaFrnP7Ds/edit",
    copyUrl: "https://docs.google.com/spreadsheets/d/11V1oYLJl3fHafrX7h051u9zDOq_zzk8s0UyaFrnP7Ds/copy",
    gasProjectId: "2bb408ea-f598-4f9c-a307-584d4d199005",
    keyFeatures: [
      "통화 녹음 오디오(MP3, M4A, WAV 등) 화자 분리(상담원 vs 고객) 및 고정밀 STT 전사",
      "[신규] 원클릭 화자 맞바꾸기 & 변경된 대화록 기준 요약·감정·이탈도 3초 초고속 AI 재산출",
      "민감정보(주민등록번호, 신용카드, 계좌번호) PII 자동 마스킹 및 비식별화",
      "핵심 통화 내용 3줄 요약 및 후속 To-Do(액션 아이템) 자동 추출",
      "고객 감정 점수(-100~+100), 구매 의향 지수 및 이탈 위험도(Churn Risk) 자동 스코어링",
      "이탈 위험 고객(80점 이상) 시트 행 연한 빨간색(#fee2e2) 자동 강조 서식",
      "사이드바 미니 오디오 플레이어: 대화록 타임스탬프 클릭 시 해당 발화 구간 즉시 이동 재생(Seek & Play)",
      "배속 재생(1.0x / 1.2x / 1.5x) 지원 및 구글 드라이브 원본 오디오 무결성 해시(SHA-256) 보관",
      "사이드바 통합 검색: 간편 조건 필터(고객명, 연락처, 상담유형, 이탈위험도) 및 AI 자연어 질의 지원",
      "사이드바 원클릭 행 수정 및 안전한 7종 감사 기반 소프트 삭제(Soft Delete) 기능 완비",
      "[개선] 초보자 친화적 DB 제어: 수기 입력 건 전송 및 전체 DB조회 시 사전 역할 안내 & 확인 팝업 탑재",
      "[신규] 상단 메뉴 원클릭 가이드: 기능별 역할 및 사용 시점을 한눈에 확인하는 모달 팝업 제공",
      "검색 결과를 전용 시트(SQLite_조회결과)에 자동 렌더링하고 시트에서 직접 수정/삭제 후 일괄 동기화 지원",
      "구글 드라이브 SheetBot_Databases 폴더 내 .sqlite 파일 실시간 양방향 동기화 및 CRUD 지원",
    ],
    recommendedFor: [
      "부동산 공인중개사 (매물 조건, 희망가, 입주일 자동 정리)",
      "B2B 고관여 영업팀 (BANT 분석 및 핵심 요구사항 망각 방지)",
      "법률/노무/세무 상담사 (유선 상담 사실관계 정리 및 법적 증빙 보관)",
      "병원/클리닉 상담실 (예약 부도 방지 및 불만 고객 관리)",
      "외주 프리랜서 및 개발사 (통화 요구사항 명세서 자동 기록 및 분쟁 방지)",
    ],
    techStack: ["Google Apps Script (V8)", "Google Drive API", "Gemini 3.8 Flash Audio", "SQLite 3", "HTML5 Web Audio"],
    usageGuide: [
      "1. 상단의 [사본 복제하기] 버튼을 클릭하여 본인의 구글 드라이브로 시트를 복제합니다.",
      "2. 구글 시트 상단 메뉴 [🚀 SheetBot Voice CRM] > [💡 [초보 가이드] 기능별 역할 & 사용 시점]에서 전체 기능을 확인합니다.",
      "3. 사이드바 열기 메뉴 클릭 후 최초 1회 구글 보안 확인 창이 나타나면 [고급] → [프로젝트명으로 이동] → [허용]을 클릭합니다.",
      "4. 사이드바에서 통화 녹음 파일(mp3, m4a 등)을 선택하고 [AI 화자분리 & 심층 분석 시작]을 누르면 분석과 DB 저장이 100% 자동 완료됩니다.",
    ],
  },
];
