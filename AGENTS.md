# Project Agent Rules


<!-- BEGIN:database-audit-rules -->
## 데이터베이스 테이블 설계 및 소프트 삭제(Soft Delete) 준수 원칙

1. **공통 7종 감사(Audit) 및 소프트 삭제 컬럼 기본 제공**:
   - 이 프로젝트에서 새로 추가되거나 관리되는 모든 My DB 테이블은 데이터 변경 이력 관리와 소프트 삭제를 위해 반드시 다음 7종 컬럼을 포함해야 합니다:
     - `uuid` (TEXT) - 예측 불가능한 전역 고유 식별자
     - `updated_at` (TEXT) - 최종 수정 일시 (YYYY-MM-DD HH:MM:SS)
     - `updated_by` (TEXT) - 최종 수정자 정보
     - `deleted_at` (TEXT) - 소프트 삭제 처리 일시 (삭제되지 않은 경우 NULL)
     - `deleted_by` (TEXT) - 삭제 처리 작업자
     - `restored_at` (TEXT) - 복원 일시 (복원되지 않은 경우 NULL)
     - `restored_by` (TEXT) - 복원 처리 작업자
2. **`uuid` 컬럼의 Nullable 설계 원칙**:
   - `uuid` 컬럼은 데이터베이스 스키마에서 **필수 입력 값(`notNull: true`)으로 강제하지 않고 Nullable(선택 입력)로 정의**합니다. 하위 호환성 유지 및 무손실 마이그레이션을 안전하게 보장합니다.
3. **스키마 정의 및 마이그레이션 자동화 헬퍼 활용**:
   - `src/lib/setup-db.ts` 내의 `safeCreateTable` 함수는 스키마 선언 시 7종 컬럼이 생략되더라도 자동으로 컬럼을 주입해 줍니다. 신규 테이블 생성 시 이 헬퍼를 경유해야 합니다.
4. **조회 및 통계 쿼리 시 소프트 삭제 필터링 (`deleted_at IS NULL`) 필수 적용**:
   - `queryTable` 등을 통해 데이터를 조회하거나 동적 쿼리를 생성할 때, WHERE 조건에 반드시 `deleted_at IS NULL` 조건을 기본 주입하여 삭제된 레코드가 화면 및 집계에 노출되지 않도록 해야 합니다.
5. **대장 쿼리 시 최신순(`orderBy DESC`) 정렬 기본 주입 원칙**:
   - 프로젝트 및 스케줄 대장을 조회할 때는 최신 등록건이 우선 표시되도록 `orderBy: 'id'`, `orderDirection: 'DESC'` 정렬을 필수 주입하여 조회해야 합니다.
<!-- END:database-audit-rules -->

<!-- BEGIN:multi-user-isolation-rules -->
## 회원별 데이터 완전 격리(Multi-User Isolation) 준수 원칙

1. **로그인 세션 기반 이메일 필터링 강제**:
   - 모든 프로젝트 및 스케줄 데이터 CRUD 작업은 NextAuth 구글 세션의 `user.email`을 필수 식별자로 사용해야 합니다.
   - 타 회원의 프로젝트나 스케줄을 조회, 수정, 삭제하는 쿼리를 절대 수행해서는 안 됩니다.
2. **소프트 삭제 시 사용자 검증**:
   - 삭제 및 상태 변경 시 해당 레코드의 `user_email`이 현재 로그인된 세션과 일치하는지 반드시 검증한 후 소프트 삭제를 실행합니다.
<!-- END:multi-user-isolation-rules -->

<!-- BEGIN:easybot-and-ai-help-rules -->
## 이지봇(EasyBot) 및 AI Contextual 도움말 연동 원칙

1. **이지봇 (EasyBot Orchestrator)**:
   - 사용자의 자연어 질문을 받아 스프레드시트 수식, Google Apps Script 코드 문법, 스케줄/트리거 설정 및 오류 해결을 가이드합니다.
   - 비즈니스 실행(프로젝트 생성, 스케줄 실행 등)은 모달 폼 또는 명시적 승인 인터페이스를 통해 안전하게 수행하도록 안내합니다.
2. **AI Contextual 도움말 (`AIHelpManager`)**:
   - 주요 입력 필드, 제어 버튼, 상태 뱃지에는 `data-easybot-hint` 속성을 적극 부여하여 사용자가 마우스를 올렸을 때 실시간 AI 컨텍스트 가이드가 표시되도록 구성합니다.
   - `localStorage`를 통해 사용자가 원할 때 언제든 도움말 기능을 ON/OFF 토글할 수 있도록 보장합니다.
<!-- END:easybot-and-ai-help-rules -->

<!-- BEGIN:ai-caller-rules -->
## 이지데스크 AI Caller 표준 연동 원칙

1. **`callAiCaller` 도구 경유 일원화**:
   - Apps Script 코드 생성, 프롬프트 파싱, AI 도움말 응답 시 외부 LLM API(Gemini 직접 호출 등)를 개별 호출하지 않고, 이지데스크 표준 라이브러리인 `callAiCaller`(`egdesk-helpers.ts`)를 최우선으로 경유해야 합니다.
   - 이를 통해 사내 AI 토큰 사용량 감사 및 API 키 중앙 관리를 준수합니다.
2. **지능형 폴백(Fallback) 안전망 유지**:
   - AI Caller 응답 지연 또는 네트워크 예외 발생 시 서비스 중단을 방지하기 위해 표준 템플릿 또는 캐시 가이드를 안전하게 제공해야 합니다.
3. **AI Caller 응답 메타데이터 2중 언래핑(Unwrapping) 절대 준수 원칙 (재발 방지)**:
   - 이지데스크 AI Caller(`ai_caller_call`)는 LLM 생성 결과를 항상 `{ "content": "실제응답텍스트", "usage": { ... }, "finishReason": "STOP" }` 형태의 메타데이터 래퍼 JSON으로 감싸서 반환합니다.
   - 따라서 Google Apps Script나 Node.js에서 AI 응답을 파싱할 때 `res.result.content[0].text`를 그대로 사용하거나 단순 1차 `JSON.parse`만 해서는 안 되며, 반드시 내부의 `.content` 필드를 안전하게 꺼내는 **2중 언래핑 헬퍼(`unwrapAiCallerText`, `unwrapAiCallerJson`) 패턴을 필수로 적용**해야 합니다. 이를 지키지 않아 발생하는 속성 누락(`undefined`)이나 `미확인` 표시는 엄격히 금지됩니다.
<!-- END:ai-caller-rules -->

<!-- BEGIN:oauth-preflight-rules -->
## Google Workspace OAuth 사전 점검 (Pre-flight Token Check) 절대 준수 원칙

1. **코드 생성 및 시트 생성 착수 전 선제적 토큰 검증 필수**:
   - 사용자가 구글 스프레드시트 연동, 자동화 코드 주입, 또는 신규 시트 생성을 요청했을 때, **수백 줄의 코드를 작성하기 전에 반드시 1순위로 Google OAuth 토큰 상태(`drive_auth_status`, `apps_script_auth_status`)를 선제 점검**해야 합니다.
2. **토큰 만료/부재 시 사전 차단 및 원클릭 인증 링크 안내**:
   - 토큰이 없거나 만료(`token_missing`, `connected: false`)된 경우, 불필요한 코드 생성 작업을 즉시 멈추고 `drive_auth_login`으로 생성된 **구글 Workspace 동의 페이지 링크**를 사용자에게 선제 안내해야 합니다.
   - "구글 시트 및 Apps Script 직접 주입을 위해 먼저 아래 링크에서 구글 계정 인증을 완료해 주세요"라고 사용자에게 승인을 요청합니다.
3. **인증 확인 후 파이프라인 개시**:
   - 사용자가 인증을 완료하여 `connected: true`가 확인된 시점에 시트 생성(`sheets_create_spreadsheet`) 및 Apps Script 원격 주입(`apps_script_push_to_google`) 파이프라인을 완전 자동 진행합니다. 이를 통해 작업 단절과 사용자 혼란을 원천 방지합니다.
<!-- END:oauth-preflight-rules -->

<!-- BEGIN:apps-script-safety-rules -->
## Google Apps Script 안전 배포 및 트리거 제어 표준 원칙

1. **자동 생성 코드 품질 및 3대 표준 기본 메뉴 보장**:
   - 생성되는 `Code.gs`는 반드시 `onOpen()`을 포함하여 구글 시트 상단에 **`🚀 SheetBot 메뉴`** 전용 메뉴를 등록해야 합니다.
   - 상단 메뉴는 업무 기능 등록 후 구분선(`addSeparator()`), **`🤖 SheetBot AI 코파일럿`**(사이드바 제어 센터), **`💳 토큰 잔액 확인 및 즉시 충전`**(인-시트 충전 센터), **`📖 SheetBot 사용법 및 활용사례`**(새 탭 열기)의 **3대 고정 기본 메뉴 순서**로 깔끔하고 슬림하게 구성합니다. '터널 점검'이나 '삭제' 등 부가 제어 기능은 상단 메뉴에 별도로 두지 않고 코파일럿 사이드바 내부로 일원화합니다.
   - 메뉴에는 항상 **`💳 토큰 잔액 확인 및 즉시 충전`**(`openTokenRechargeModal` - 실시간 지갑 잔액 확인 및 3대 패키지 다이렉트 충전 모달)과 **`📖 SheetBot 사용법 및 활용사례`**(`https://sheetbot.cloud` 새 탭 열기 모달 함수 `openSheetBotGuide`)를 필수로 포함해야 합니다.
   - 예외 처리를 위한 `try-catch` 및 구글 시트 알림 UI(`SpreadsheetApp.getUi().alert`, `toast`)를 필수로 포함해야 합니다.
2. **트리거 등록 및 중복 방지**:
   - Apps Script 원격 함수 실행(`apps_script_run_function`) 시 실행 결과 및 로그를 `last_run_at`, `last_status`, `last_run_message`에 투명하게 기록해야 합니다.
3. **SQLite 양방향 동기화 및 CRUD 표준 아키텍처 준수**:
   - 데이터 전송(`[1]`), 조회(`[2]`), 수정/삭제 일괄 동기화(`[3]`)의 3종 메뉴를 표준 제공합니다.
   - 조회 결과 시트 출력 시 이전 날짜 서식 오염을 방지하기 위해 `sheet.clearFormats()` 후 A열(SQLite ID)을 `setNumberFormat("0")`으로 강제 고정하며, `extractSqliteId` 헬퍼(날짜 오인식 역산 2중 방어)를 필수 적용합니다.
   - 사이드바 UI는 인라인 스크립트 파싱 충돌을 방지하기 위해 `HtmlService.createHtmlOutputFromFile("Sidebar")`를 사용하는 독립 `Sidebar.html` 모듈화 패턴을 필수 적용합니다.
4. **`user_data_sql_query` 키워드 차단 방지 및 `queryTable`(`user_data_query`) 표준 사용 원칙**:
   - `user_data_sql_query` 도구는 보안을 위해 쿼리 텍스트 전체에 `UPDATE`, `DELETE`, `DROP`, `INSERT` 등의 단어가 포함되어 있는지 단순 포함 검사를 수행(HTTP 500 차단)합니다.
   - 이때 `updated_at`, `updated_by`, `deleted_at` 등 감사 컬럼명이 SELECT 절뿐만 아니라 **WHERE 조건절(예: `deleted_at IS NULL`)에 직접 명시되어도 `DELETE` 키워드 차단 오류가 발생**합니다.
   - 따라서:
     - **조건 검색 및 일반 조회**: 날것의 SQL 조립(`user_data_sql_query`)을 절대 사용하지 말고, 반드시 `egdesk-helpers.ts` 및 `EgdeskClient.gs`에 표준 제공되는 구조적 도구인 **`queryTable(tableName, options)` (`user_data_query`)**를 필수로 사용해야 합니다.
     - **AI 자연어 Text-to-SQL 질의**: 부득이 SQL을 생성할 때는 반드시 `SELECT * FROM 테이블명 WHERE ...` 형태로 작성하고, WHERE 조건절에서도 `deleted_at`, `updated_at` 등의 감사 컬럼명 사용을 엄격히 배제하며, 조회 결과에 대해 애플리케이션 레벨(JS)에서 소프트 삭제(`!r.deleted_at`) 필터링을 수행해야 합니다.
5. **Apps Script 매니페스트(`appsscript.json`) 필수 5대 OAuth 권한 기본 보장 원칙**:
   - `Ui.showSidebar` 또는 모달 창 호출 시 권한 거부(`https://www.googleapis.com/auth/script.container.ui`) 예외가 발생하지 않도록, 모든 프로젝트의 매니페스트에는 다음 5대 필수 권한이 `oauthScopes`에 반드시 포함되어야 합니다:
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/script.container.ui`
     - `https://www.googleapis.com/auth/script.external_request`
     - `https://www.googleapis.com/auth/script.scriptapp`
     - `https://www.googleapis.com/auth/drive`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/script.send_mail`
   - `ensureStandardManifest`(`src/lib/gas-manifest.ts`) 헬퍼를 통해 프로젝트 생성, 수정, 재배포 시 자동으로 스코프가 누락 없이 주입되도록 보장합니다.
6. **코파일럿 사이드바 통합 제어 센터(터널 실시간 진단 · 안티그라비티 AI 확장 · 스크립트 전체 삭제) 원칙**:
   - `🤖 SheetBot AI 코파일럿`(`showAiCopilotSidebar`) 화면은 3단 일체형 제어 센터로 동작해야 합니다:
     - **[1. 인프라 실시간 진단]**: 사이드바 로드 즉시 비동기 `getTunnelStatusData()`를 호출하여 응답속도(ms) 및 정상 연결 뱃지를 표시하고 `[🔄 재점검]` 지원.
     - **[2. 안티그라비티(Antigravity) AI 확장]**: 래핑 브릿지 주소 표시, `[🚀 안티그라비티 열기 및 자동화 시작]` 버튼, 프롬프트 원클릭 복사, 접이식 직접 코드 주입 지원.
     - **[3. 연동 관리 Danger Zone]**: `[🗑️ 시트봇 연동 해제 및 스크립트 전체 삭제]` 버튼을 제공하여, 클릭 시 2중 확인 후 설치형 트리거 전체 해제 및 `Code.gs` 초기화 배포를 실행하고 시트 새로고침(F5) 안내.
7. **OCR 파일 업로드 사이드바 파일 생명주기 관리 원칙 (파일 교체/취소/연속등록/상시초기화)**:
   - 명함, 영수증, 세금계산서, 발주서 등 파일 업로드 기반 OCR 사이드바를 구축할 때는 다음 4대 UI/UX 인터랙션을 기본 제공해야 합니다:
     - **[상시 초기화]**: 사이드바 상단 헤더에 `[🔄 초기화]` 버튼을 배치하여 언제든 폼을 최초 상태로 리셋 가능하게 함.
     - **[요청 전 교체/취소]**: 파일 선택 즉시 미리보기 상단에 `[🔄 파일 변경]` 및 `[❌ 취소]` 버튼을 제공하여 재선택 지원.
     - **[완료 후 연속 등록]**: OCR 분석 완료 후 메인 버튼을 `[➕ 다음 파일 바로 등록하기]`로 전환하고, 클릭 시 기존 폼 초기화와 동시에 자동으로 파일 탐색기(`fileInput.click()`)를 띄워 연속 작업 효율을 극대화함.
     - **[PDF 및 이미지 동시 지원]**: 이미지(`image/*`)뿐만 아니라 PDF(`application/pdf`) 파일도 오류 없이 수용하고 전용 아이콘 프리뷰를 제공함.
<!-- END:apps-script-safety-rules -->

<!-- BEGIN:sms-dispatch-rules -->
## 스마트폰 SMS 문자 발송 표준 프로세스 준수 원칙

1. **실제 발송 및 모의(Mock) 코드 절대 금지**:
   - 가짜 성공("발송성공", HTTP 200 등)을 대입하는 Mock 코드를 절대 작성하지 않고, 반드시 실제 `phone_send` 또는 상용 통신사 API 통신을 수행해야 합니다.
2. **발송 전 기기 실시간 점검(`checkActiveSmsDevice`) 및 계정 1:1 매칭 필수**:
   - My DB(`sheetbot_user_devices`)의 터널 응답(JSON)을 안전하게 언래핑하여 로그인된 세션 이메일(`SHEETBOT_USER_EMAIL`)에 매핑된 활성 기기를 1순위로 탐색해야 합니다.
3. **기기 미등록 시 발송 사전 차단 및 2가지 대안 안내 모달 표출**:
   - 연동된 기기나 상용 API 키가 없을 때는 발송을 즉시 중단하고, 1번 스마트폰 연동(무제한 무료)과 2번 상용 API 설정을 안내하는 모달 다이얼로그(`showSmsDeviceNoticeModal`)를 필수로 띄워야 합니다.
4. **일체형 점검 완료 및 발송 승인 확인창 필수 제공**:
   - 발송 전 기기 연결 상태, 무료 연동 여부, 발송 대상 건수를 요약 안내하는 통합 확인창을 표출하여 사용자로부터 최종 승인([확인])을 받은 후 실제 발송을 개시해야 합니다.
5. **결과 피드백 및 SQLite 대장 동기화**:
   - 발송 결과를 시트(결과메시지 열: `스마트폰(기기명) 실제 전송 완료`) 및 SQLite 발송 대장에 투명하게 기록해야 합니다.
<!-- END:sms-dispatch-rules -->

<!-- BEGIN:gmail-dispatch-rules -->
## Gmail 안내 이메일 일괄 발송 및 HTML 템플릿 인코딩 표준 원칙

1. **`GmailApp.sendEmail` 네이티브 엔진 활용 원칙**:
   - 외부 상용 이메일 API 키 없이 구글 계정 세션 권한으로 발송합니다.
   - 일반 구글 계정(@gmail.com)은 일일 100건, Google Workspace 계정은 일일 1,500건까지 무료 쿼터가 보장됩니다.
2. **사전 일일 쿼터 확인 및 원스톱 승인 모달 필수**:
   - 발송 전 반드시 `MailApp.getRemainingDailyQuota()`를 호출하여 남은 무료 수량을 실시간 점검합니다.
   - 선택된 발송 대상 건수가 잔여 쿼터를 초과할 경우 즉시 발송을 사전 차단하고 친절한 안내를 제공합니다.
   - 발송 전 발신 계정, 남은 통수, 대상 건수를 요약하는 통합 승인창(`OK_CANCEL`)을 통해 사용자 동의 후 실제 발송을 개시합니다.
3. **MIME 변환 이모지 깨짐 방지 (`&#128640;` 등 HTML NCR 필수 적용)**:
   - Google Apps Script `GmailApp.sendEmail`의 `htmlBody` 파라미터는 4바이트 UTF-8 SMP 이모지(`🚀` 등)를 MIME 인코딩할 때 `??????`로 깨뜨릴 수 있습니다.
   - 따라서 HTML 이메일 템플릿 내의 모든 특수 이모지는 반드시 HTML 숫자 문자 참조(NCR, 예: `<h1><span style="font-size:22px;">&#128640;</span> SheetBot 알림 센터</h1>`) 및 `&bull;` 형태로 작성하여 전송해야 합니다.
4. **결과 시트 서식 스타일링 및 SQLite/드라이브 백업 동기화**:
   - 발송 성공 시 해당 셀을 연한 초록색(`#dcfce7`), 실패 시 연한 빨간색(`#fee2e2`)으로 즉시 서식 변경합니다.
   - 발송 이력을 SQLite DB(`email_send_logs_sqlite`) 및 구글 드라이브 `SheetBot_Databases` 폴더 내 `.sqlite` 백업 파일에 실시간으로 안전하게 보관합니다.
<!-- END:gmail-dispatch-rules -->

<!-- BEGIN:egdesk-tunnel-rules -->
## 이지데스크 공용 터널(EGDesk Tunnel) 및 원격 클라우드 연동 원칙

1. **Google Apps Script(클라우드)의 `localhost` 호출 절대 금지 (DNS 오류 방지)**:
   - Google Apps Script(`UrlFetchApp.fetch`)는 사용자 로컬 머신이 아닌 해외 Google 클라우드 데이터센터에서 실행됩니다.
   - 따라서 `http://localhost:4002`나 `http://localhost:4005` 같은 로컬 루프백 주소를 Apps Script 코드 상수에 절대 주입해서는 안 됩니다 (호출 시 100% `DNS 오류` 발생).
2. **이지데스크 정식 공용 터널 엔드포인트 표준 사용**:
   - 원격 클라이언트(Apps Script, 외부 웹훅 등)가 이지데스크 AI Caller나 My DB를 호출해야 할 때는 반드시 `egdesk_get_tunnel`로 조회되는 활성 공용 터널 주소를 사용해야 합니다:
     - **호출 URL**: `https://tunneling-service.onrender.com/t/mcp-server-fxkud1/{service}/tools/call`
     - **필수 인증 헤더**: `X-Api-Key: a67ddc0f-7e2b-4997-9a0b-9667a74c89d0`
3. **AI OCR 및 파일 분석 전송 규격 준수**:
   - 이미지 및 PDF 파일을 AI Caller 터널로 보낼 때는 Gemini 네이티브 파일 첨부 규격을 준수합니다:
     ```json
     {
       "tool": "ai_caller_call",
       "arguments": {
         "caller": "sheetbot-gas-ocr",
         "model": "gemini-3.8-flash",
         "temperature": 0.1,
         "prompt": "문서 분석 지침...",
         "files": [
           {
             "name": "파일명.png",
             "content": "Base64문자열",
             "encoding": "base64",
             "mimeType": "image/png 또는 application/pdf"
           }
         ]
       }
     }
     ```
4. **신규 Apps Script 코드 생성 시 터널 자동 주입 강제 및 표준 클라이언트 사용**:
   - Apps Script 프로젝트 생성/배포 시 `apps_script_setup_egdesk_tunnel` 도구를 자동 실행하여 `EgdeskConfig.gs` 및 `EgdeskClient.gs`를 클라우드에 사전 주입합니다.
   - 코드 생성 AI(`src/app/api/generate/route.ts`)는 저수준 `UrlFetchApp`이나 키 하드코딩 대신, 주입된 `egdeskToolsCall('ai-caller', 'ai_caller_call', ...)` 및 `egdeskUserDataSql(query)` 함수를 자율 활용하여 간결하고 신뢰성 높은 자동화 코드를 생성합니다.
5. **Apps Script 소스코드 내 마스터 API Key 평문 하드코딩 절대 금지 및 ScriptProperties 격리 원칙**:
   - `EgdeskConfig.gs` 등 어떤 `.gs` 소스코드 파일에도 서버 마스터 API Key(`a67ddc0f...`)를 평문 문자열로 직접 노출해서는 안 됩니다.
   - 반드시 Google Apps Script의 암호화 저장소(`PropertiesService.getScriptProperties().getProperty('EGDESK_API_KEY')`)를 경유하여 키를 동적으로 참조하도록 구성해야 합니다.
   - 이를 통해 타인이 시트 에디터에서 마스터 키를 탈취하거나, 시트 사본 복제(Make a copy) 시 마스터 키가 제3자에게 복제·유출되는 보안 사고를 원천 차단합니다.
<!-- END:egdesk-tunnel-rules -->

<!-- BEGIN:resource-lifecycle-and-revocation-rules -->
## 프로젝트 삭제 및 회원 탈퇴 시 연동 주소/API 키 생명주기 제어 원칙 (구현 대기)

1. **프로젝트 삭제 시 연동 주소/엔드포인트 무효화 원칙 (Edge-based Soft Revocation)**:
   - **즉각 차단(Immediate Cut-off)**: 프로젝트가 삭제되면 구글 시트 등 외부에서 호출하는 해당 프로젝트 전용 연동 주소(엔드포인트, 웹훅, 트리거 API)는 지연 없이 즉시 차단되어야 합니다.
   - **선제 거부(410 Gone / 403 Forbidden)**: 방치된 구글 시트의 Apps Script 좀비 트리거(`onEdit` 등)로 인한 불필요한 AI 토큰 과금 및 백엔드 부하를 차단하기 위해, 게이트웨이/미들웨어 레벨에서 `410 Gone` 또는 `403 Forbidden`을 즉시 반환해야 합니다.
   - **소프트 삭제 및 복구 유예(Grace Period)**: 물리적 즉시 삭제 대신 `status: 'PENDING_DELETE'` 상태로 두고 14일간 유예 기간을 제공합니다. 사용자가 복원할 경우 기존 구글 시트 스크립트 수정 없이 즉시 재활성화됩니다.
   - **GAS 클라이언트 자가 비활성화(Self-disable)**: 주입되는 Apps Script는 `410 Gone` 응답을 수신했을 때 사용자에게 안내 토스트를 띄우고 스스로 트리거 실행을 멈추도록 예외 처리를 내장합니다.

2. **회원 탈퇴 시 에이전트 API 키 즉각 전체 차단 및 복구 시 재발급 원칙 (Rotate on Recovery)**:
   - **전체 킬스위치(Global Kill-Switch)**: 회원 탈퇴 시 해당 계정에 속한 모든 에이전트 API 키는 T=0초에 즉시 `SUSPENDED` 처리되어 `401 Unauthorized`로 100% 호출이 차단되어야 합니다 (고아 키 및 무단 자원 점유 방지).
   - **유예 기간 중 API 호출 엄격 차단**: 계정 복구 유예 기간(예: 14~30일) 중이라도 API 호출은 절대 허용되지 않습니다.
   - **계정 복구 시 기존 키 재활성화 금지(Rotate on Recovery)**: 유예 기간 내에 사용자가 탈퇴를 취소하고 계정을 복구하더라도, 보안 유출 방지를 위해 **과거에 사용하던 기존 API 키는 영구 폐기(Revoked)** 처리하며, 대시보드에서 반드시 **새로운 API 키를 신규 발급**받도록 강제합니다.
<!-- END:resource-lifecycle-and-revocation-rules -->

