# Project Agent Rules

<!-- BEGIN:egdesk-dev-context -->
## EGDesk Development Context

EGDesk opened this project with the dev server on **port 4002** (http://localhost:4002, coding (dev)).
Do not assume port 3000. Use port 4002 for local preview and dev commands.
EGDesk MCP/API runs at http://localhost:8080.

See `.agents/rules/egdesk-dev-context.md` for full details.
<!-- END:egdesk-dev-context -->

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
<!-- END:ai-caller-rules -->

<!-- BEGIN:apps-script-safety-rules -->
## Google Apps Script 안전 배포 및 트리거 제어 표준 원칙

1. **자동 생성 코드 품질 보장**:
   - 생성되는 `Code.gs`는 반드시 `onOpen()`을 포함하여 구글 시트 상단에 전용 메뉴를 등록해야 합니다.
   - 예외 처리를 위한 `try-catch` 및 구글 시트 알림 UI(`SpreadsheetApp.getUi().alert`, `toast`)를 필수로 포함해야 합니다.
2. **트리거 등록 및 중복 방지**:
   - Apps Script 원격 함수 실행(`apps_script_run_function`) 시 실행 결과 및 로그를 `last_run_at`, `last_status`, `last_run_message`에 투명하게 기록해야 합니다.
<!-- END:apps-script-safety-rules -->
