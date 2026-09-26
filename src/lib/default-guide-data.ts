export interface GuideStep {
  step: string;
  title: string;
  desc: string;
  tip: string;
  badge: string;
}

export interface GuideRecipe {
  id: string;
  title: string;
  tag: string;
  iconName: string;
  color: string;
  prompt: string;
}

export const DEFAULT_GUIDE_STEPS: GuideStep[] = [
  {
    step: "01",
    title: "구글 계정 최소 권한 로그인 & 4대 프로젝트 시작 모드 (템플릿 복제 포함)",
    desc: "보안을 위해 초기 가입/로그인 시에는 최소 권한(이메일·기본 프로필)만 요청하므로 안심하고 로그인할 수 있습니다. 20,000 웰컴 토큰과 개인 에이전트 API 키가 자동 발급되며, ① '✨ 새 시트 자동 생성', ② '📁 엑셀 파일 업로드 변환', ③ '🔗 기존 시트 URL', ④ '🛍️ 공식 템플릿 마켓 사본 복제' 중 원하는 방식을 자유롭게 선택하세요. 템플릿을 복제할 때도 원본 제작자의 API 키나 개인정보는 100% 격리 배제되며, 본인 구글 세션으로만 안전하게 작동합니다.",
    tip: "구글 최소 권한 원칙(Least Privilege) 및 템플릿 복제 시 ScriptProperties 암호화 분리 표준을 철저히 준수합니다.",
    badge: "최소 권한 & 안전 복제",
  },
  {
    step: "02",
    title: "AI 시트 정밀 분석 & 대화형 실행 계획 조율 (HITL)",
    desc: "시트 URL 또는 업로드된 엑셀 데이터를 바탕으로 AI 아키텍트가 시트 구조(헤더 열, 데이터 샘플, 양식 유형)와 실행 계획을 브리핑합니다. 최대 5회까지 AI와 한국어로 편하게 대화하며 컬럼 매핑과 로직을 사전 조율할 수 있습니다.",
    tip: "예: 'D열 품번은 없으면 빈칸으로 두고 E열 품명만 필수로 넣어줘' 등 편하게 피드백하세요.",
    badge: "대화형 조율",
  },
  {
    step: "03",
    title: "기존 코드 안전 보존(Merge) & Apps Script 자동 배포",
    desc: "시트에 이미 작성된 코드가 있어도 걱정 마세요! AI가 기존 스크립트를 자동 감지하여 '🛡️ 안전 보존 병합(Merge)' 모드로 기존 함수와 메뉴를 100% 보존하면서 새 기능만 안전하게 주입합니다. 구글 클라우드에 원클릭으로 안전 배포됩니다.",
    tip: "구글 시트 에디터에서 직접 수정한 최신 코드는 대시보드의 [코드 동기화] 버튼으로 1초 만에 가져올 수 있습니다.",
    badge: "안전 보존 배포",
  },
  {
    step: "04",
    title: "구글 시트 '🚀 SheetBot 메뉴' & 시트 내장 AI 코파일럿·문자/이메일 일괄 발송",
    desc: "구글 시트를 열면 상단에 '🚀 SheetBot 메뉴'가 자동 생성됩니다. [✉️ [발송] 선택 행 안내 이메일 일괄 발송](일 100~1,500건 무료 & 모던 HTML 서식), [📱 [발송] 선택 행 문자 일괄 발송](발송 전 실시간 장치 점검 & 원스톱 승인), [⚡ 터널 연결 상태 점검], [📤 SQLite 3종 동기화] 외에도, [🤖 SheetBot AI 코파일럿] 사이드바를 열어 자연어 요청이나 직접 짠 코드를 시트 안에서 즉시 주입·배포할 수 있으며, 최하단 [📖 SheetBot 사용법 및 활용사례]를 누르면 언제든 공식 가이드가 열립니다.",
    tip: "이메일은 계정별 일일 무료 할당량(100~1,500통)을 사전 점검하고, 문자는 회원 스마트폰 연결 상태를 실시간 점검하여 헛발송 없는 안전한 원클릭 발송을 보장합니다.",
    badge: "시트 메뉴 & AI 코파일럿",
  },
  {
    step: "05",
    title: "스마트 알림(내 폰 문자 0원) & 클라우드 터널 실시간 관제",
    desc: "시트봇 대시보드의 [스마트 알림 센터]에서 본인의 안드로이드 스마트폰(SheetBot Agent2)을 1회 QR 연동해 두면, 추가 통신 비용 0원(무료)으로 시트의 고객들에게 실제 문자를 자동 또는 선택 일괄 발송하고 수신 문자를 시트에 기록할 수 있습니다. 상용 통신사 API Key 폴백도 함께 지원되며, [⚡ 터널 연결 상태 점검]으로 통신 상태를 상시 진단할 수 있습니다.",
    tip: "내 워크스페이스 [당월 AI 사용량] 요약 카드에서 모든 AI 호출 목적과 토큰 소비 내역을 실시간 감사 로그로 확인할 수 있습니다.",
    badge: "스마트 운영",
  },
];

export const DEFAULT_RECIPES: GuideRecipe[] = [
  {
    id: "ex_sms_batch_dispatch",
    title: "A열 체크박스 선택 행 스마트폰(SheetBot Agent2) 문자 일괄 발송 & 사전 장치 점검",
    tag: "스마트폰 문자 일괄 발송 (NEW)",
    iconName: "Smartphone",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "구글 시트 상단 [🚀 SheetBot 메뉴] ➔ [📱 [발송] 선택 행 문자 일괄 발송]을 누르면 A열 체크박스가 선택된 대상자들에게 실제 문자를 일괄 발송해줘. 발송 직전에 내 스마트폰(SheetBot Agent2) 장치 연결 상태를 실시간 점검하여 '점검 완료 및 발송 확인' 알림창을 띄우고, 승인 시 통신비 0원으로 실제 문자를 전송한 뒤 결과메시지 열에 '스마트폰(기기명) 실제 전송 완료'로 기록해줘.",
  },
  {
    id: "ex_gmail_batch_dispatch",
    title: "선택 행 Gmail 맞춤형 HTML 이메일 일괄 발송 & 드라이브 SQLite 대장 동기화",
    tag: "Gmail 원클릭 일괄 발송 (NEW)",
    iconName: "Mail",
    color: "border-rose-200 bg-rose-50/60 text-rose-800",
    prompt: "구글 시트 상단 [🚀 SheetBot 메뉴] ➔ [✉️ [발송] 선택 행 안내 이메일 일괄 발송]을 누르면 A열 체크박스로 선택한 대상자들에게 개인화된 안내 이메일을 GmailApp으로 일괄 발송해줘. 발송 전 오늘 계정의 남은 무료 발송 잔여량(일 100~1,500통)과 사전 확인창을 띄우고, 모던 반응형 HTML 카드 서식(이모지 NCR 인코딩 적용)으로 전송한 후 발송 결과를 시트와 구글 드라이브 SQLite 발송 대장에 실시간으로 동기화해줘.",
  },
  {
    id: "ex_copilot_self_update",
    title: "시트 내장 'SheetBot AI 코파일럿' 사이드바를 통한 자가 기능 확장 및 코드 직접 주입",
    tag: "시트 내장 AI 코파일럿 (NEW)",
    iconName: "Bot",
    color: "border-purple-200 bg-purple-50/60 text-purple-800",
    prompt: "구글 시트 상단 [🚀 SheetBot 메뉴] ➔ [🤖 SheetBot AI 코파일럿] 사이드바를 열고 아래처럼 자연어 요청이나 직접 짠 함수 코드를 입력창에 넣은 후 [⚡ AI 코드 생성 및 시트에 즉시 주입]을 누르세요:\n\n// 자연어 요청 예시:\n'주문금액 50만원 이상인 행은 배경을 연한 노란색으로 강조하는 함수 추가해줘'\n\n// 직접 작성한 함수 코드 예시:\nfunction highlightVipRows() {\n  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  // 직접 짠 로직을 그대로 붙여넣어도 AI가 기존 코드 손실 없이 안전하게 융합 배포합니다.\n}",
  },
  {
    id: "ex_excel",
    title: "엑셀 파일(.xlsx) 업로드 기반 자재 재고관리 시스템 자동 변환",
    tag: "엑셀 업로드 자동 변환",
    iconName: "UploadCloud",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    prompt: "업로드된 엑셀 파일의 품목코드, 품목명, 규격, 현재고, 단가 컬럼 구조를 기반으로 구글 시트 자동화 시스템을 구축해줘. 입출고가 발생할 때마다 현재고를 자동 갱신하고, 재고가 10개 미만으로 떨어지면 행을 주황색으로 하이라이트해줘.",
  },
  {
    id: "ex_new_sheet",
    title: "새 구글 시트 자동 설계 기반 고객 상담 및 견적 요청 접수 대장",
    tag: "새 시트 자동 설계",
    iconName: "FolderPlus",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "구글 시트가 아직 없어. 고객 성함, 연락처, 상담분야, 희망일정, 문의내용, 접수일시를 기록하는 최적의 상담 접수 대장 시트 양식을 설계하고, 신규 접수 시 담당자에게 즉시 알림을 주는 자동화 시스템을 만들어줘.",
  },
  {
    id: "ex_business_card_ocr",
    title: "명함 사진·PDF 업로드 기반 AI 정밀 추출 및 '명함 관리 대장' 자동 누적",
    tag: "명함 AI OCR 대장 등록 (NEW)",
    iconName: "Contact",
    color: "border-sky-200 bg-sky-50/60 text-sky-800",
    prompt: "구글 시트 상단 [🚀 SheetBot 명함 관리] ➔ [📷 명함 OCR 등록 사이드바 열기]를 누르면 사이드바가 열려. 스마트폰으로 촬영한 명함 사진이나 PDF 파일을 드래그하여 업로드하면, Gemini AI 비전 모델이 성명, 직함, 회사명, 부서, 전화번호, 이메일, 주소, 비고를 1초 만에 자동 추출해줘. 추출된 정보는 현재 활성 시트의 다음 빈 행에 실시간 등록 일시와 함께 깔끔하게 추가 등록해줘.",
  },
  {
    id: "ex0",
    title: "발주서/명세서 PDF·이미지 업로드 및 다중 품목 대장 자동 등록",
    tag: "문서 AI OCR 자동화",
    iconName: "Sparkles",
    color: "border-blue-200 bg-blue-50/60 text-blue-800",
    prompt: "사이드바 메뉴에서 PDF나 이미지 발주서를 업로드하면 자동으로 AI OCR 정밀 분석하여 '발주서 접수대장' 시트에 기록해줘. 1장의 발주서에 여러 품목이 있을 때는 품목별로 1행씩 분리해서 최상단(2행~)에 최근 순으로 삽입해줘.",
  },
  {
    id: "ex1",
    title: "일일 마감 데이터 특정 시트로 누적 복사",
    tag: "정기 스케줄링",
    iconName: "Clock",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-700",
    prompt: "매일 밤 11시 50분에 '오늘매출' 탭의 A열부터 F열까지의 데이터를 복사해서 '연간누적' 탭의 마지막 빈 행 아래에 붙여넣고, 오늘매출 탭의 입력칸은 초기화해줘.",
  },
  {
    id: "ex2",
    title: "결제완료 시 고객 휴대폰 감사 문자 자동 발송",
    tag: "SheetBot Agent2 0원 문자 알림 (SMS)",
    iconName: "Smartphone",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "주문관리 시트의 D열(상태)이 '결제완료'로 수정되면, 해당 행의 고객명과 연락처를 읽어서 내 스마트폰(SheetBot Agent2)으로 고객에게 '[SheetBot] {{고객명}}님, 결제가 정상 완료되었습니다.' 문자를 자동 발송해줘.",
  },
  {
    id: "ex3",
    title: "품절 임박 재고 감지 시 담당자 긴급 문자 알림",
    tag: "조건 감지 & 본인 알림",
    iconName: "Zap",
    color: "border-amber-200 bg-amber-50/60 text-amber-800",
    prompt: "재고관리 시트에서 D열(현재고)의 숫자가 5 이하로 떨어지면 해당 행을 빨간색으로 하이라이트하고, 내 휴대폰 번호(010-1234-5678)로 '{{품목명}} 재고 부족 긴급 발주 필요' 문자를 즉시 전송해줘.",
  },
  {
    id: "ex4",
    title: "상담 예약 신청 접수 시 슬랙 & 이메일 웹훅 통보",
    tag: "이벤트 트리거 (onEdit)",
    iconName: "MessageSquare",
    color: "border-purple-200 bg-purple-50/60 text-purple-700",
    prompt: "신규예약 시트에 새로운 행이 추가되면, 고객명, 예약시간, 상담내용을 포맷팅하여 담당자 이메일(help@company.com)로 보내고 슬랙 웹훅으로 실시간 알림을 쏴줘.",
  },
  {
    id: "ex5",
    title: "두 시트 간 VLOOKUP 매칭 및 차액 자동 계산 수식",
    tag: "구글 시트 고급 수식",
    iconName: "FileSpreadsheet",
    color: "border-teal-200 bg-teal-50/60 text-teal-700",
    prompt: "A시트의 주문번호를 기준으로 B시트의 결제금액을 VLOOKUP으로 가져와 C열에 넣고, 미납금이 있는 행만 골라내는 ARRAYFORMULA 수식 구조를 작성해줘.",
  },
  {
    id: "ex_api_key_agent",
    title: "안티그라비티 전용 API 키 기반 원스톱 프로젝트 자동 생성 & 배포",
    tag: "개인 API 키 원스톱 (추천)",
    iconName: "KeyRound",
    color: "border-violet-200 bg-violet-50/60 text-violet-800",
    prompt: "내 시트봇 API 키는 sk_sheetbot_xxxxxxxxxxxx야.\n이 구글 시트 주소(https://docs.google.com/spreadsheets/d/.../edit)로 프로젝트를 만들고, 10행 헤더 기준으로 매일 밤 11시 50분에 일일 매출을 연간누적 탭에 복사하는 자동화 스크립트를 배포해줘.",
  },
  {
    id: "ex_agent_bridge",
    title: "안티그라비티(Antigravity) 브릿지 연동 및 대화형 코드 주입",
    tag: "AI 에이전트 브릿지",
    iconName: "Bot",
    color: "border-purple-200 bg-purple-50/60 text-purple-800",
    prompt: "아래 웹 주소를 통해 내 구글 시트의 헤더 구조와 기존 코드를 확인하고, 필요한 기능 코드를 주입해줘:\n웹 주소: https://.../api/agent/gas-bridge?token=sec_xxxx\n요구사항: 사이드바에서 발주서 PDF를 올리면 10행 헤더 양식에 맞게 품목별로 1행씩 분리해서 자동으로 채워 넣어줘.",
  },
  {
    id: "ex_estimate_form",
    title: "고정 셀·품목란·합계 수식이 결합된 견적서/발주서 양식 자동 완성",
    tag: "견적서/보고서 양식 완성",
    iconName: "FileCode",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "이 견적서 시트의 C4(견적일자), B6(고객사명) 고정 좌표와 14행부터 시작하는 품목란에 입력값을 채워 넣어줘. 하단 G24의 =SUM(G14:G23) 합계 수식은 절대 덮어쓰지 말고 그대로 보존해서 자동 계산되게 해줘.",
  },
  {
    id: "ex_sqlite_sync",
    title: "내 컴퓨터 로컬 SQLite DB 파일 데이터 추출 및 구글 시트 대장 완성",
    tag: "로컬 SQLite DB 연동",
    iconName: "Code",
    color: "border-blue-200 bg-blue-50/60 text-blue-800",
    prompt: "내 컴퓨터 C:\\data\\erp.sqlite 파일의 orders 테이블에서 '삼전상사'의 이번 달 발주 품목만 SQL로 추출해서, 구글 시트 견적서 양식의 14행부터 차례대로 기입해줘.",
  },
  {
    id: "ex_sqlite_crud_all",
    title: "구글 드라이브 SQLite 양방향 동기화 및 시트/사이드바 수정·삭제(CRUD) 올인원",
    tag: "Google Drive SQLite CRUD (NEW)",
    iconName: "Database",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "구글 시트의 주문 데이터를 구글 드라이브 'SheetBot_Databases' 폴더의 SQLite DB 파일로 전송하고, 사이드바에서 조건 및 AI 자연어로 조회하며, 시트 셀에서 직접 편집한 내용이나 사이드바 단건 폼에서 수정·삭제한 내역이 SQLite DB 및 드라이브 파일에 양방향으로 동기화(CRUD)되도록 구현해줘.",
  },
  {
    id: "ex_sqlite_ai_text2sql",
    title: "Gemini AI Text-to-SQL 자연어 주문 조회 및 즐겨찾기 보관함",
    tag: "AI 자연어 Text-to-SQL",
    iconName: "Search",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    prompt: "사이드바의 AI 검색 탭에서 '주문금액 상위 5건', '수량 100개 이상'처럼 자연어로 질문하면 Gemini AI가 SELECT SQL로 즉시 변환하여 시트에 자동 서식과 함께 추출하고, 최근 성공한 질문을 보관함과 즐겨찾기(⭐)로 관리할 수 있도록 해줘.",
  },
  {
    id: "ex_mcp_financehub",
    title: "국세청 홈택스 전자세금계산서 & 법인통장 실시간 자동 전표화 및 미수금 정산",
    tag: "홈택스 & 법인통장 연동 (MCP)",
    iconName: "Landmark",
    color: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    prompt: "매일 아침 8시에 FinanceHub 도구를 호출하여 홈택스 매입/매출 전자세금계산서와 법인통장 거래내역을 수집해줘. 시트 1행 헤더에 맞게 공급가액과 부가세를 분리해 기록하고, 세금계산서와 통장 입금액이 일치하는 거래는 '정산완료'로 자동 마킹해줘.",
  },
  {
    id: "ex_mcp_bizinfo",
    title: "기업마당(BizInfo) 맞춤 정부지원사업 및 R&D 지원금 공고 매일 스크랩",
    tag: "정부지원사업 공고 스캔 (MCP)",
    iconName: "Landmark",
    color: "border-blue-200 bg-blue-50/60 text-blue-800",
    prompt: "매일 평일 오전 8시 30분에 BizInfo 도구를 이용해 '인공지능', '소프트웨어', '수출바우처' 키워드의 최신 정부지원사업 공고를 조회해줘. 접수 중인 사업들의 사업명, 주관기관, 마감일자, 상세URL을 '정부지원공고' 시트에 자동으로 최신화해줘.",
  },
  {
    id: "ex_mcp_koneps",
    title: "조달청 나라장터(KONEPS) 맞춤 공공입찰 공고 자동 수집 & 마감 3일 전 알림",
    tag: "조달청 공공입찰 수집 (MCP)",
    iconName: "Scale",
    color: "border-indigo-200 bg-indigo-50/60 text-indigo-800",
    prompt: "매일 아침 9시에 KONEPS 도구로 조달청 나라장터에서 배정예산 5천만 원 이상의 '웹 개발' 및 '데이터 분석' 입찰 공고를 검색해줘. 공고번호, 수요기관, 추정가격, 마감일을 시트에 채우고, 마감 3일 전인 건은 비고란에 '긴급'으로 표시해줘.",
  },
  {
    id: "ex_mcp_voice_transcript",
    title: "사이드바 통화 녹음 파일 업로드 ➔ 화자 분리(STT) 및 상담 일지 자동 기입",
    tag: "음성통화 AI 상담일지 (MCP)",
    iconName: "PhoneCall",
    color: "border-purple-200 bg-purple-50/60 text-purple-800",
    prompt: "구글 시트 우측 사이드바에서 고객 통화 녹음 파일(MP3/M4A)을 올리면 Voice Transcript 도구로 화자를 분리해 텍스트를 전사해줘. 통화 내용에서 고객의 핵심 문의사항, 불만 요점, 후속 조치 약속일을 추출해 시트의 고객 행에 자동으로 추가해줘.",
  },
];
