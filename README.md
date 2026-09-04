# SheetBot 🤖 - Google Apps Script AI 자동화 SaaS

구글 계정 로그인 기반으로 회원별로 Google Apps Script 자동화 프로젝트와 스케줄(트리거)을 생성하고 관리할 수 있는 모던 SaaS 애플리케이션입니다.

---

## 🌟 주요 특징

1. **구글 계정 로그인 (NextAuth Google OAuth)**:
   - 회원가입 없이 구글 계정으로 1초 로그인.
   - 로컬 테스트 및 개발용 **1초 데모 계정 체험 모드** 동시 지원.
2. **회원별 데이터 완전 격리 (Multi-User Isolation)**:
   - 테넌트 방식 대신 로그인된 구글 계정 이메일(`session.user.email`) 단위로 프로젝트 및 스케줄이 완벽히 분리 보관됩니다.
3. **이지데스크 백엔드 인프라 100% 활용**:
   - 이지데스크 데이터베이스(`system_settings`, `user_data`), MCP 도구(`apps_script_*`, `drive_*`), `egdesk-helpers.ts`를 그대로 연동하여 고성능 자동화 환경 제공.
4. **자연어 AI Apps Script 코드 생성**:
   - 구글 스프레드시트 URL과 자연어 요구사항만 입력하면 Gemini AI가 `Code.gs` 및 `appsscript.json`을 자동 생성하여 구글 클라우드에 원스톱 배포.
5. **자동화 스케줄 & 실행 트리거 관리**:
   - 분/시간/일/주 단위 시간 기반 스케줄 및 시트 셀 수정 시 `onEdit` 이벤트 트리거의 등록, 수정, 원클릭 활성/일시정지 토글, 즉시 실행 테스트 지원.

---

## 🚀 빠른 시작 (Getting Started)

### 1. 패키지 설치
```bash
cd C:\dev\SheetBot
npm install
```

### 2. 개발 서버 구동 (포트 4002)
```bash
npm run dev
```

브라우저에서 `http://localhost:4002`으로 접속합니다. (이지데스크 호스팅 포트 4002 사전 구성 완료)

---

## 📁 프로젝트 폴더 구조

```
C:\dev\SheetBot\
├── package.json                   # 의존성 및 스크립트 (포트 4002)
├── tsconfig.json                  # TypeScript 설정
├── next.config.ts                 # Next.js 프록시 rewrite 설정
├── egdesk-helpers.ts              # 이지데스크 백엔드 통신 라이브러리
├── .env.local                     # 환경변수 설정
├── src/
│   ├── app/
│   │   ├── layout.tsx             # RootLayout & SessionProvider
│   │   ├── page.tsx               # 서비스 소개 랜딩 페이지
│   │   ├── login/page.tsx         # 구글 계정 로그인 페이지
│   │   ├── dashboard/page.tsx     # 회원 전용 Apps Script 대시보드
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts  # NextAuth 인증 API
│   │       ├── projects/route.ts            # 회원별 프로젝트 CRUD API
│   │       ├── schedules/route.ts           # 회원별 스케줄 CRUD API
│   │       └── generate/route.ts            # AI 자연어 Apps Script 생성 API
│   ├── components/
│   │   ├── Navbar.tsx             # 회원 프로필 & 로그아웃 헤더
│   │   ├── NewProjectModal.tsx    # 새 프로젝트 생성 모달
│   │   ├── ScheduleModal.tsx      # 스케줄 등록 및 수정 모달
│   │   └── ScheduleManager.tsx    # 스케줄 대장 및 즉시 실행 관리
│   └── lib/
│       ├── auth.ts                # NextAuth 설정 & 세션 헬퍼
│       └── egdesk-helpers.ts      # 이지데스크 헬퍼 경로 별칭
```

---

## ⚙️ 환경변수 설정 (`.env.local`)

```env
NEXTAUTH_URL=http://localhost:4100
NEXTAUTH_SECRET=sheetbot_super_secret_auth_key_2026_apps_script_saas
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_EGDESK_API_URL=http://localhost:8080
EGDESK_API_URL=http://localhost:8080
GEMINI_API_KEY=your-gemini-api-key
```
